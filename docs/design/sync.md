# Progress sync, game modes and quizzes

Status: proposal (v0.2 line). Owner: Alex. Covers three things:

1. Phone ↔ web progress sync.
2. The three modes: Mastery, Normal and Quiz.
3. The Quiz API that Muse uses.

## 1. Goals

- Progress made on the phone shows up on the web and the other way round. That covers SRS state, mastery, reviews, wallet, packs, spins and today's session.
- **The phone is the source of truth.** The server is a relay and a backup. If the server is lost, the phone can rebuild it.
- Works offline. Every write goes to the local store first, then to an outbox.
- No accounts. A web browser is paired with the phone using a one-time code.
- Never put secrets in logs. Device tokens are stored hashed on the server.

## 2. Identity and pairing

| Thing | What it is |
|---|---|
| `player_id` | A uuid made on the phone at first launch. It is the owner of all the data. |
| `device_id` | A uuid per install or browser. |
| `device_token` | 32 random bytes, sent as `Authorization: Bearer`. D1 stores `sha256(token)`. |

The phone registers itself on first sync: `POST /api/devices/register {player_id, device_id, kind:"phone"}`. The response contains `device_token`. That call is rate-limited per IP.

### Pairing steps (what Alex does)

1. On the phone, open **Settings → Link a browser**. The phone calls `POST /api/pair/start` and shows an **8-character code** and a QR code. The code is good for 10 minutes and can be used once.
2. On the web, open the app and tap **Link to phone**. Enter the code, or open the URL in the QR code (`/pair?code=…`).
3. The web calls `POST /api/pair/claim {code, device_id}`. It gets its own `device_token` for the same `player_id`.
4. The web downloads a full snapshot (`GET /api/sync/snapshot`) into IndexedDB. It then pulls incrementally.
5. The phone lists linked browsers. **Unlink** revokes a token (`DELETE /api/devices/:id`).

Codes use the base32 Crockford alphabet, so 0/O and 1/I are never confused. They are stored hashed. Five wrong claims lock the code.

## 3. Data model and merge rules

Every change is an **event**: `{id (uuid), player_id, device_id, seq (per-device counter), at (ms), type, payload}`.

| Data | Rule | Why |
|---|---|---|
| Reviews (`review`), wallet ledger (`ledger`), pack openings, spins, quiz answers | **Append-only event log.** Merged as the union by `id`, so a duplicate is ignored. | These are facts. Summing a ledger never loses a coin twice. |
| Wallet balance, collection counts | **Derived** by folding events. Never synced directly. | They can't diverge. |
| FSRS card state | **LWW by `(lastReview, device_id)`**. Once both sides have the reviews, the state is recomputed by replaying them. | Same review history gives the same schedule. |
| Mastery/Anki card state (queue, step, suspended, buried, leech) | LWW per field by `(at, device_id)`. | Rare edits. Last one wins. |
| Deck options presets | LWW per preset. | |
| Daily session (`day:<YYYY-MM-DD>`) | Counters **derived from today's review events**: new seen, reviews done, learning left. | A session started on the phone resumes on the web with exact counts. |

The phone is the tie-breaker. If two LWW writes have the same `at`, the phone's `device_id` wins. Conflicts are logged as an `audit` event; nothing is discarded silently.

## 4. Wire protocol

- `POST /api/sync/push {events:[…≤500], last_seq}` returns `{accepted, server_cursor}`. It is idempotent: an event `id` that is already stored is not stored again. The phone's outbox drains in batches and retries with backoff.
- `GET /api/sync/pull?cursor=` returns `{events, cursor, more}`. The cursor is the server's insert order (`rowid`). A device skips its own events.
- `GET /api/sync/snapshot` returns the folded state plus a cursor. Used for first pairing and repair.
- The first upload from the phone pushes the full history (reviews, ledger, packs, spins) as events with stable ids. That makes it safe to re-run.

D1 tables (migration `0003_sync.sql`):

- `players`
- `devices(id, player_id, kind, token_hash, created_at, revoked_at)`
- `pair_codes(code_hash, player_id, expires_at, attempts, used_at)`
- `events(rowid, id UNIQUE, player_id, device_id, seq, at, type, payload_json)`
- index `(player_id, rowid)`

## 5. Web store

- The web uses **IndexedDB** (`idb`) behind the same `LocalStore` interface as SQLite. That interface is in `db/types.ts`, so the screens don't change.
- It persists across reloads, and `navigator.storage.persist()` is requested.
- An unpaired web works as it does today: empty and local-only.

## 6. Modes

### 6.1 Mastery: Anki, faithfully ported

This is Anki's study model inside the Fish Frenzy wrapper. Much of `packages/core/src/anki/` already exists (steps, bury, queue). This mode finishes it.

- **Automatic grading.** A wrong answer is **Again**. A right answer is graded by answer time relative to the card's median time (default 8 s when there's no history):
  - more than 1.5× the median: **Hard**
  - between 0.5× and 1.5×: **Good**
  - less than 0.5×: **Easy**

  The grade is shown after the catch ("Good · 4.1 s").
- **Learning and relearning steps** come from the preset (default learn `1m 10m`, relearn `10m`). Graduating interval 1 d, easy 4 d. Scheduling is FSRS with the preset's desired retention.
- **Daily limits** per preset: new cards per day (default 20) and maximum reviews per day (200). Learning cards always come back and don't count toward the limits. A limit set on a class is shared by its decks, the same way Anki parent limits work.
- **Leeches.** A card becomes a leech after 8 lapses (configurable). It gets a 🐛 badge, and the deck viewer suggests "Ask Muse to rewrite this card". Action: tag only (default) or auto-suspend.
- **Suspend and bury.** Suspend from the deck viewer, or long-press after an answer. Siblings are buried for the day (they already exist). Manual bury lasts until tomorrow (day rollover at 4 am local time, like Anki).
- **Presets.** Named option groups, assigned per class or per deck; a deck setting overrides its class. Fields: new/day, reviews/day, desired retention, learn steps, relearn steps, graduating interval, easy interval, leech threshold and action.
- **Daily session state** `day:<date>` (new done, reviews done, learning pending) is derived from synced events. It resumes on any device.
- **Done for today.** When the queue is empty, a celebration screen shows today's stats and the next due time. Two buttons: **Keep playing (Normal mode)** and Home.

#### Reconciling "3 correct" with graduation

Today, Mastery means 3 correct answers in a session. Under Anki this becomes:

- **Mastered n/3** counts correct answers since the last lapse, across days. It is a display-only progress meter, kept for the dev pill and the deck viewer.
- A card **graduates** (Learning → Review) the Anki way: it passes the last learning step.
- A card is shown as **★ Mastered** once it is in Review **and** its stability is at least 21 days (Anki's "mature").

Graduation is what actually schedules the card, so it is the real rule. The 3-correct count is only a visual meter. The two rarely disagree: with 1m/10m steps, a card graduates on its 2nd or 3rd correct answer.

Migration: saved `fishing.masteryCounts.v1` values become a `mastery_count` field on each card. Cards with no FSRS state stay New.

#### Math is its own section

Math questions (`"type": "math"`) are slow to solve, so they never mix with
multiple choice. Home has a QUESTIONS tab and a MATH tab; a session plays
one track only (`track` route param, `filterByTrack` in core). A mixed deck
is split by question type and shows up in both tabs. Math Mastery has its
own daily counts (`study.dailyDone.math.v1`), its own presets
(`mathDeckPresets` / `mathClassPresets`, default Math: 5 new / 50 reviews,
steps 10m 1d) and lenient timing (`Hard` only past 3x the expected time).

### 6.2 Normal: fun, unlimited

This is today's endless shuffle: no limits, no stop screen. Answers are still logged as review events (so they sync and count toward stats). They only move FSRS state for cards that are due. Cards that aren't due get a "practice" event that doesn't change the schedule. That way Normal mode can't break the Anki schedule.

### 6.3 Quiz: a fixed random subset, assigned by Muse

- A quiz is `N` questions drawn at random (seeded, so it can be reproduced) from a deck or class. It can be created on the phone, or by Muse through the API with an optional due date.
- It is played once in the Fish Frenzy wrapper. There's no SRS effect, and the pool is fixed when the quiz is created.
- For each question, the app saves: correct (yes/no), the chosen answer, the correct answer, and the time in ms. Results go up as `quiz_answer` events and are readable through the API.
- The Home screen shows a "📝 Quiz from Muse · due Fri" card when a quiz is assigned.

## 7. Deck viewer: next steps

The v0.1.10 screen gets:

- search across all decks
- filters: due tomorrow, missed (lapsed in the last 7 days), leeches, suspended, buried
- the preset of each deck
- bulk suspend and unsuspend

## 8. Rollout as stacked PRs

1. **Sync D1 + API.** Migration, register, pair, push, pull, snapshot, and tests.
2. **Phone outbox.** Events are written alongside local writes; the outbox drains on app start, on resume and after a session; the first upload sends the history.
3. **Web IndexedDB store, pairing screen and pull loop.**
4. **Mastery/Anki.** Auto-grading, presets, limits, leech, suspend, bury, daily state, Done-for-today screen.
5. **Deck viewer: search and filters.**
6. **Quiz.** D1 tables, Muse API (docs/API.md), the quiz player and results.
7. Later: stats screen.

Each PR goes through CI and review before merge. Each user-facing step gets a `v*` tag.
