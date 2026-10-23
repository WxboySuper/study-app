# CramCritters API

Base URL: `https://<worker>/api`. JSON in and out. Errors look like `{error}` and come with a 4xx or 5xx status.

**Auth.** Two kinds of bearer token:

- **Muse token** (server secret `MUSE_TOKEN`). Used for deck and quiz admin, and for reading results.
- **Device token.** Issued by pairing; scoped to one `player_id`.

Never log tokens.

## Existing endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | `{ok:true}` |
| POST | `/decks` | Muse | Upserts a deck (docs/DECK-FORMAT.md). |
| GET, PATCH, DELETE | `/decks`, `/decks/:id`, `/decks/:id/questions/:qid` | Muse | See Decks (Muse) below. |
| GET | `/sync` | none | Deck snapshot for the apps. |
| GET | `/update`, `/update/apk` | none | Latest release and its APK. |

## Sync (docs/design/sync.md §2-§4)

Device routes authenticate with `Authorization: Bearer <device_token>` (not
`MUSE_TOKEN`). Tokens are 32 random bytes; the server stores only their
SHA-256. Ids (`player_id`, `device_id`, event `id`) are 8-64 chars of
`[A-Za-z0-9_-]`.

| Method | Path | Auth | Body → response |
|---|---|---|---|
| POST | `/devices/register` | none | `{player_id, device_id, label?}` → 201 `{player_id, device_id, device_token}` |
| POST | `/pair/start` | device (phone) | → 201 `{code, expires_at}` (8 chars Crockford, 10 min, single use) |
| POST | `/pair/claim` | none | `{code, device_id, label?}` → 201 `{player_id, device_id, device_token}` |
| GET | `/devices` | device | → `{devices: [{id, kind, label, created_at, last_seen, current}]}` |
| DELETE | `/devices/:id` | device (phone; a browser only itself) | → `{ok, id}` |
| POST | `/sync/push` | device | `{events: [{id, seq, at, type, payload}] ≤ 500}` → `{accepted, inserted, duplicates, rejected, cursor}` |
| GET | `/sync/pull?cursor=&all=1` | device | → `{events[], cursor, more, player_id}` (500 per page) |

Notes:

- `register` creates the player on first use. A player that already has a
  live phone only gains devices through pairing (409 `player_taken`).
  Re-registering the same device rotates its token.
- `push` is idempotent by event `id`; malformed events (or payloads over
  16 KB) are listed by index in `rejected`, the rest are kept.
- `pull` skips the caller's own events unless `all=1`. The snapshot of §4
  is `pull?cursor=0&all=1` paged until `more` is false; the folding is done
  on the device (`packages/core`), the server never interprets payloads.
- Codes are case-insensitive; spaces and dashes are ignored, `O`→`0`,
  `I`/`L`→`1`. Wrong/expired/used codes all answer 400 `invalid_code`.

## Decks (Muse)

All of these need the Muse token. Every answer carries the ids of the deck and of its questions.

| Method | Path | Body → response |
|---|---|---|
| POST | `/decks` | a deck (docs/DECK-FORMAT.md) → `{id, name, class, questions[], changes: {kept, added, retired}}` |
| GET | `/decks` | → `{decks: [{id, name, class, updatedAt, questionCount, retiredCount}]}` |
| GET | `/decks/:id?retired=1` | → the deck with its questions (retired ones only with `retired=1`, marked `retired: true`) |
| PATCH | `/decks/:id` | `{name?, class?}` (class `null` clears it) → the deck. 409 `name_taken` |
| DELETE | `/decks/:id` | → `{ok, id, deleted: true}`. The apps remove the deck and its progress. |
| POST | `/decks/:id/questions` | one question `{id?, question, correct, wrong?, selfGraded?}` → 201 the question, or 200 with `restored: true` when it brings back a retired question of the same id or text. 409 `question_exists` |
| PATCH | `/decks/:id/questions/:qid` | any of `{question, correct, wrong, selfGraded}` → the question. The id (and so the progress) stays. |
| DELETE | `/decks/:id/questions/:qid` | → `{ok, id, retired: true}`. The question is retired, not deleted. |

Errors of these routes look like `{error: code, errors: [message]}`.

### For Muse: updating a deck

- **Ids are stable.** A question keeps its id for good, and the progress of the player (mastery, the review schedule, quiz results) is keyed by that id.
- **Re-POSTing a whole deck is safe.** To update a deck, send it again with the same deck `id` (or the same name). Each question is matched, in order: by its `id` if you send one, else by its text (case and spacing ignored). A match keeps its id and progress even when its answers change. Reordering is fine.
- **A reworded question with no `id` counts as new** (and the old one is retired). To reword and keep the progress, send the question `id` from `GET /decks/:id`, or use `PATCH /decks/:id/questions/:qid`.
- **Questions you leave out are retired**: hidden from play and from new quizzes, progress and quiz history kept. Sending them again (or POSTing them) brings them back with their progress.
- Prefer the small routes for small changes: PATCH one question, POST one question, DELETE one question, PATCH the deck for a rename or a class.
- `DELETE /decks/:id` really removes a deck from the apps, progress included. Use it only when asked.
- Look at `changes` in the answer of `POST /decks` to check what happened.
- **Math questions.** Send `{"type": "math", "question", "answer" | "answers", "setup"?, "steps"?}` (docs/DECK-FORMAT.md, "Math questions"). The answers use the keyboard syntax: `3x^2`, `sqrt(x)`, `pi`, `e`, `ln(x)`, `int(f, x)`, `int(f, x, a, b)`, `diff(f, x)`, `pdiff(f, x)`, `+ C`. Equivalent answers are accepted, so give one clean answer (add others only for genuinely different forms). Use `"setup": true` when the answer is the setup (`int(x^2, x, 0, 2)`) and not its value. `steps` (max 8, each `{prompt, answer, setup?}`) walk a multi-step problem in order. The API answers a math question with `type: "math"` and `math: {kind, answers, steps?, constant?}`; `correct` is its first answer. A PATCH keeps the math unless you send `"type": "mc"`; PATCH `{"answer": "..."}` replaces the answers.

## Quizzes

### `POST /quizzes` (Muse)

```json
{ "deckId": "set_123", "count": 10, "dueAt": "2026-10-30T17:00:00-05:00", "title": "Ch. 4 check" }
```

- Exactly one of `deckId` or `classId` is required.
- `count` must be 1–100. If the pool is smaller than `count`, the whole pool is used.
- Response: `201 {id, title, deckId|classId, cardIds[], seed, dueAt, createdAt, status:"assigned"}`.

### `GET /quizzes?status=assigned|completed|all` (Muse or device)

Lists quizzes, newest first.

### `GET /quizzes/:id` (Muse or device)

Returns the quiz with its questions: `{…, questions:[{cardId, front, back}]}`.

### `GET /quizzes/:id/results` (Muse)

```json
{
  "id": "qz_1", "status": "completed", "startedAt": 0, "completedAt": 0,
  "score": { "correct": 8, "total": 10 },
  "answers": [
    { "cardId": "c1", "prompt": "…", "correctAnswer": "…", "chosenAnswer": "…",
      "correct": true, "timeMs": 4210, "answeredAt": 0 }
  ]
}
```

### `DELETE /quizzes/:id` (Muse)

Withdraws an assigned quiz.

**How results get there.** The device writes answers as `quiz_answer` events through `/sync/push`. The server stores each one in `quiz_answers(quiz_id, card_id, chosen, correct, time_ms, answered_at)` when it accepts the event.
