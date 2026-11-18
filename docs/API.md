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
- **Math questions.** Send `{"type": "math", "question", "answer" | "answers", "setup"?, "steps"?}` (docs/DECK-FORMAT.md, "Math questions"). The answers use the keyboard syntax: `3x^2`, `sqrt(x)`, `pi`, `e`, `ln(x)`, `int(f, x)`, `int(f, x, a, b)`, `diff(f, x)`, `pdiff(f, x)`, `+ C`. Equivalent answers are accepted, so give one clean answer (add others only for genuinely different forms). Use `"setup": true` when the answer is the setup (`int(x^2, x, 0, 2)`) and not its value. `steps` (max 8, each `{prompt, answer, setup?}`) walk a multi-step problem in order; with `steps` the top-level `answer` is optional (omit it and the last step is the final answer). The API answers a math question with `type: "math"` and `math: {kind, answers, steps?, constant?}`; `correct` is its first final answer (`math.answers` is `[]` when the last step is the final answer). A PATCH keeps the math unless you send `"type": "mc"`; PATCH `{"answer": "..."}` replaces the answers.
- **Math decks.** The app plays math apart from multiple choice (a MATH tab on home with its own decks, daily queue and Mastery limits). There is no deck flag: every question with `"type": "math"` goes to the Math section, everything else to multiple choice, and a mixed deck is split between the two. To make a math deck, make every question of it `"type": "math"`, and name it so it reads as math (e.g. `Calc 1 · Math`). Don't mix a few math questions into a multiple-choice deck: they leave its sessions and play in the Math section instead.

## Quizzes

### `POST /quizzes` (Muse)

Assign a quiz made of what you name:

```json
{ "deckIds": ["set_123", "set_456"], "classIds": ["Calc 2"], "count": 10,
  "dueAt": "2026-10-30T17:00:00-05:00", "title": "Ch. 4 check" }
```

- Name at least one deck or class: `deckId` / `classId` (one of them), or the lists `deckIds` / `classIds` (up to 50 each, they can be mixed). A question in two of them is picked once.
- `count` must be 1-100. If the pool is smaller than `count`, the whole pool is used.

Or hand-pick the questions:

```json
{ "cardIds": ["q_1", "q_2", "q_3"], "title": "The ones I keep missing", "dueAt": null }
```

- `cardIds` is exactly the quiz, in that order (1-100). It cannot be mixed with decks or classes. An id that does not exist (or is retired) answers `404 {error:"unknown_cards", cardIds:[...]}`.
- Response: `201 {id, title, deckId|classId (only when the quiz is made of exactly one deck or class), cardIds[], seed, dueAt, createdAt, status:"assigned"}`.

### `PATCH /quizzes/:id` (Muse)

Edits a quiz that is still `assigned` (a completed or withdrawn quiz answers `409 not_assigned`). Send any of:

```json
{ "title": "New name", "dueAt": "2026-11-02T09:00:00Z" }
{ "dueAt": null }
{ "addCardIds": ["q_9"], "removeCardIds": ["q_2"] }
{ "cardIds": ["q_5", "q_1"] }
```

- `dueAt: null` clears the due date. `cardIds` replaces the whole list and cannot be mixed with `addCardIds` / `removeCardIds`. Added ids must be live questions; a quiz keeps 1-100 questions.
- Answers that were already given are kept. A removed question stops counting; if every remaining question already has an answer the quiz becomes `completed`.
- Response: the quiz, as in `POST`.

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
