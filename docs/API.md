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

## Sync (planned, docs/design/sync.md §4)

| Method | Path | Auth | Body → response |
|---|---|---|---|
| POST | `/devices/register` | none (rate-limited) | `{player_id, device_id, kind}` → `{device_token}` |
| POST | `/pair/start` | device (phone) | → `{code, expires_at}` |
| POST | `/pair/claim` | none | `{code, device_id}` → `{player_id, device_token}` |
| DELETE | `/devices/:id` | device (phone) | Revokes a device. |
| POST | `/sync/push` | device | `{events[]}` → `{accepted, cursor}` |
| GET | `/sync/pull?cursor=` | device | → `{events[], cursor, more}` |
| GET | `/sync/snapshot` | device | → folded state + `cursor` |

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
