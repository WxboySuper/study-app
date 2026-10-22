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

## Quizzes (planned)

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
