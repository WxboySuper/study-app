# CramCritters API

The small API behind the app: it shares the decks between the devices, tells
the app when a new release is out and serves the web build. The service is a
Cloudflare Worker (`apps/api`), the database is D1 and the code is deployed
from the repository.

* **Live URL:** `https://cramcritters-api.alex-miller-6464.workers.dev`
* **Local URL:** the `wrangler dev` output (usually `http://localhost:8787`)
* **Worker config:** `apps/api/wrangler.jsonc`

The app reads the base URL from `expo.extra.apiBaseUrl` of `app.json`
(`apps/mobile/src/config.ts`). The web build uses the same Worker, so its URL
is also the base URL of the pages.

## Endpoints at a glance

| Method | Path | Auth | What it does |
| ------ | ---- | ---- | ------------ |
| `GET` | `/api/health` | none | Says that the Worker is alive. |
| `GET` | `/api/sync` | none | The decks that changed after a moment. |
| `GET` | `/api/update` | none | The latest release of the game. |
| `POST` | `/api/decks` | bearer | Pushes (creates or replaces) a deck. |
| `DELETE` | `/api/decks/:id` | bearer | Deletes a deck (a tombstone). |

Every response is JSON. The public endpoints send the CORS headers, so a
browser can read them; the write endpoints are called by the app with its
bearer token, never by a page.

## Authentication

The write endpoints (`POST /api/decks`, `DELETE /api/decks/:id`) need the
Worker secret `MUSE_TOKEN` in the `Authorization` header:

```
Authorization: Bearer $MUSE_TOKEN
```

The token is a secret of the Worker (`wrangler secret put MUSE_TOKEN`). It is
**never** written in the repository, in a document or in a command line that
is shared: use the shell variable `$MUSE_TOKEN` (or a local `.env` file that is
ignored by git).

A missing or wrong token answers:

```json
{ "error": "unauthorized" }
```

with the status `401`.

## `GET /api/health`

```bash
curl https://cramcritters-api.alex-miller-6464.workers.dev/api/health
```

```json
{ "ok": true }
```

## `GET /api/sync`

Reads the decks that changed **after** a moment in time. The app calls it when
it starts (and when it comes back from the background) with the cursor of its
last sync.

### Query parameters

| Name | Type | Default | Meaning |
| ---- | ---- | ------- | ------- |
| `since` | integer (epoch ms) | `0` | Only the decks whose `updatedAt` is greater than this. A missing or broken value means `0`: the whole library. |

### Response

```json
{
  "now": 1760000000000,
  "decks": [
    {
      "id": "deck_abc",
      "name": "European capitals",
      "class": "Geography",
      "updatedAt": 1759999999000,
      "deleted": false,
      "questions": [
        {
          "id": "q_1",
          "question": "Capital of France",
          "correct": "Paris",
          "wrong": ["Marseille", "Lyon", "Nice"],
          "position": 0,
          "selfGraded": false
        }
      ]
    },
    {
      "id": "deck_gone",
      "name": "Old deck",
      "class": null,
      "updatedAt": 1759999998000,
      "deleted": true,
      "questions": []
    }
  ]
}
```

* `now` is the moment of the answer: the app keeps it as the cursor of its
  next sync.
* A deck that is deleted stays in the answer as a **tombstone**
  (`deleted: true`, empty `questions`), so the other devices drop it too.
* `class` is the **name** of the class (`null` when the deck has none). The
  app finds or creates the local class with that name.
* A question without wrong answers is **self-graded** (`selfGraded: true`): the
  player reveals the answer and grades themselves.

```bash
# The first sync: everything.
curl "https://cramcritters-api.alex-miller-6464.workers.dev/api/sync?since=0"

# The next sync: only what changed since the cursor of the last answer.
curl "https://cramcritters-api.alex-miller-6464.workers.dev/api/sync?since=1760000000000"
```

## `GET /api/update`

Reads the latest release of the game. The release is read from the GitHub feed
and cached for ten minutes, so every device asks the same question.

### Response

```json
{
  "version": "0.1.3",
  "url": "https://github.com/WxboySuper/study-app/releases/tag/v0.1.3",
  "name": "CramCritters 0.1.3",
  "publishedAt": "2026-10-20T18:04:11Z",
  "apkUrl": "https://github.com/WxboySuper/study-app/releases/download/v0.1.3/app.apk"
}
```

The app compares `version` with its own version and shows a banner when the
release is newer. The banner opens `url`; when the release has no page, it
falls back to `apkUrl`.

When the GitHub feed cannot be read, the endpoint answers with the status
`502`:

```json
{ "error": "update_unavailable" }
```

```bash
curl https://cramcritters-api.alex-miller-6464.workers.dev/api/update
```

## `POST /api/decks`

Pushes a deck. The body is the same JSON shape the app imports
(`docs/DECK-FORMAT.md`): the name, the class, the id and the questions. The
Blooket shape (the `answers` of a question and the index of the right one) is
read too.

* The deck is found by its `id`. A body **without** an id is matched by name:
  a deck that is pushed twice without an id does not become two decks.
* The questions of the deck are **replaced** by the ones of the push. A
  question that stays at the same place keeps its id, so the schedule of the
  players who already reviewed it survives the update.
* `class` is the **name** of the class, not an id.

### Body

```json
{
  "id": "deck_abc",
  "name": "European capitals",
  "class": "Geography",
  "questions": [
    {
      "question": "Capital of France",
      "correct": "Paris",
      "wrong": ["Marseille", "Lyon", "Nice"]
    },
    {
      "question": "Capital of Italy",
      "correct": "Rome",
      "wrong": ["Milan", "Venice", "Naples"]
    }
  ]
}
```

| Field | Type | Required | Meaning |
| ----- | ---- | -------- | ------- |
| `id` | string | no | The id of an existing deck. Without it the deck is matched by `name`. |
| `name` | string | yes | The name of the deck. |
| `class` | string \| null | no | The name of the class of the deck. |
| `questions[].question` | string | yes | The question. |
| `questions[].correct` | string | yes | The correct answer. |
| `questions[].wrong` | string[] | no | 0 to 3 wrong answers. A question without wrong answers is self-graded. |

### Responses

* `201` when the deck is new, `200` when an existing deck was replaced:

```json
{
  "id": "deck_abc",
  "name": "European capitals",
  "questions": [
    {
      "id": "q_1",
      "question": "Capital of France",
      "correct": "Paris",
      "wrong": ["Marseille", "Lyon", "Nice"],
      "position": 0,
      "selfGraded": false
    }
  ],
  "selfGraded": false
}
```

* `400` when the deck cannot be read:

```json
{ "error": "invalid_deck", "errors": ["The deck has no questions."] }
```

* `401` when the bearer token is missing or wrong.

### Example

```bash
curl -X POST "https://cramcritters-api.alex-miller-6464.workers.dev/api/decks" \
  -H "Authorization: Bearer $MUSE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "European capitals",
    "class": "Geography",
    "questions": [
      { "question": "Capital of France", "correct": "Paris", "wrong": ["Marseille", "Lyon"] },
      { "question": "Capital of Italy", "correct": "Rome", "wrong": ["Milan", "Venice"] }
    ]
  }'
```

## `DELETE /api/decks/:id`

Deletes a deck. The row is not thrown away: it becomes a **tombstone** that
the other devices read on their next `/api/sync` and use to drop the deck.

### Responses

* `200` when the deck was deleted:

```json
{ "ok": true, "id": "deck_abc", "deleted": true }
```

* `404` when the deck does not exist:

```json
{ "error": "not_found" }
```

* `401` when the bearer token is missing or wrong.

### Example

```bash
curl -X DELETE "https://cramcritters-api.alex-miller-6464.workers.dev/api/decks/deck_abc" \
  -H "Authorization: Bearer $MUSE_TOKEN"
```

## Pushing a deck from a script

The usual flow for a Muse (the content author):

```bash
# 1. The token lives in the environment (a secret of the machine, never git).
export MUSE_TOKEN="…"

# 2. Push the deck. The answer carries the id of the deck.
curl -sS -X POST "https://cramcritters-api.alex-miller-6464.workers.dev/api/decks" \
  -H "Authorization: Bearer $MUSE_TOKEN" \
  -H "Content-Type: application/json" \
  -d @deck.json

# 3. Update it later: keep its id in the body.
jq '.id = "deck_abc"' deck.json > deck-with-id.json
curl -sS -X POST "https://cramcritters-api.alex-miller-6464.workers.dev/api/decks" \
  -H "Authorization: Bearer $MUSE_TOKEN" \
  -H "Content-Type: application/json" \
  -d @deck-with-id.json

# 4. Remove it: the devices drop it on their next sync.
curl -sS -X DELETE "https://cramcritters-api.alex-miller-6464.workers.dev/api/decks/deck_abc" \
  -H "Authorization: Bearer $MUSE_TOKEN"
```

## Errors

| Status | `error` | When |
| ------ | ------- | ---- |
| `400` | `invalid_deck` | The body is not a readable deck (with the list of the problems). |
| `401` | `unauthorized` | The write endpoint has no valid bearer token. |
| `404` | `not_found` | The deck of `DELETE /api/decks/:id` does not exist. |
| `502` | `update_unavailable` | The GitHub release feed cannot be read. |
