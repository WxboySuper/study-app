# study-app

Endless, untimed study game: Blooket-style game modes and collectibles plus
Anki-style spaced repetition (FSRS).

- **Client:** native mobile app built with [Expo](https://expo.dev) (React Native,
  TypeScript, expo-router). **Android first**, iOS later. No PWA, no service worker.
- **API:** a single [Cloudflare Worker](https://developers.cloudflare.com/workers/)
  built on [Hono](https://hono.dev), deployed to `*.workers.dev`.
- **DB:** [D1](https://developers.cloudflare.com/d1/) (SQLite) for everything.
- **SRS:** [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) `5.4.2`
  (pinned) in `packages/core`, shared by the app and the API.

The full product plan lives in [docs/SPEC.md](docs/SPEC.md). This repository is
currently at **Phase 0** (scaffold) plus the FSRS core.

## Repository layout

```
apps/mobile    Expo app (expo-router, expo-sqlite, expo-notifications, expo-secure-store)
apps/api       Cloudflare Worker (Hono) + D1 migrations
packages/core  Pure TypeScript FSRS core (no React/RN/Worker dependencies)
```

## Requirements

- Node >= 22.12
- pnpm 10 (the version is pinned in `package.json` via `packageManager`)
- Android Studio / an Android device for local native builds (optional)

`.npmrc` sets `node-linker=hoisted` so Expo/Metro works inside a pnpm workspace.

## Getting started

```bash
pnpm install
```

### Mobile app

```bash
pnpm --filter mobile start      # Expo dev server (press "a" for Android)
```

The app is a placeholder home screen with a **Study All** button that already
reads the local SQLite store (`apps/mobile/src/db/local.ts`) and hands the cards
to the FSRS queue builder of `packages/core`. The actual game screen lands in
Phase 1.

### API

```bash
pnpm --filter api dev           # wrangler dev on http://127.0.0.1:8787
curl http://127.0.0.1:8787/api/health
```

Apply the D1 migrations to the local database (creates
`apps/api/.wrangler/state/.../study-app.sqlite`):

```bash
pnpm --filter api db:migrate:local
# or, from apps/api:
npx wrangler d1 migrations apply DB --local
```

`wrangler.jsonc` carries a placeholder `database_id` (`"TODO"`). Create the real
database once (`npx wrangler d1 create study-app`) and paste the id in. Nothing
in this repository deploys on its own: `pnpm --filter api deploy` is a manual
step and the CI workflow never runs it.

### Checks

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm lint          # the root ESLint config as well
```

`packages/core` runs Vitest with a coverage threshold of 90 %; the API test
calls `app.fetch()` directly, so no test ever touches the network.

## Android builds

There is **no EAS** in this project. Release APKs are built by
[`.github/workflows/android-release.yml`](.github/workflows/android-release.yml):
on a `v*` tag (or via manual dispatch) it runs `expo prebuild --platform android`,
builds the APK with Gradle, re-signs it with `apksigner` using the release
keystore from the repository secrets and uploads it to the GitHub release. The
keystore itself is never committed.

Locally you can build the same thing with:

```bash
npx expo run:android
```

or `pnpm --filter mobile prebuild && cd apps/mobile/android && ./gradlew assembleRelease`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `pnpm install
--frozen-lockfile`, the typecheck, the lint and the tests on Node 22, 24 and 26.
It never builds an APK and never deploys.

## TODO

- [ ] Phase 1: set import (paste/CSV/JSON), scope picker, Cast game mode,
      session API (`start` / `end`), server side payout, offline outbox sync,
      pack shop with the Starter and Halloween 2026 packs.
- [ ] Phase 2: MCP server on `/mcp`, push reminders, stats page, collection book.
- [ ] Replace the `database_id` placeholder in `apps/api/wrangler.jsonc`.
- [ ] Push the `expo-notifications` stub to the API (`push_tokens`) once the
      cron trigger exists.
