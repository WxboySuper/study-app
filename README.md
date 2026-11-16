# CramCritters

Endless, untimed study game: Blooket-style game modes and collectibles plus
Anki-style spaced repetition (FSRS).

- **Client:** native mobile app built with [Expo](https://expo.dev) (React Native,
  TypeScript, expo-router). **Android first**, iOS later. No PWA, no service worker.
- **API:** a single [Cloudflare Worker](https://developers.cloudflare.com/workers/)
  built on [Hono](https://hono.dev), deployed to `*.workers.dev`.
- **DB:** [D1](https://developers.cloudflare.com/d1/) (SQLite) for everything.
- **SRS:** [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) `5.4.2`
  (pinned) in `packages/core`, shared by the app and the API.
- **Session scheduler:** the in-session queue is a TypeScript port of the
  *design* of [Anki](https://github.com/ankitects/anki)'s scheduler (new,
  learning and review queues, learning steps, sibling burying). It lives in
  [`packages/core/src/anki/`](packages/core/src/anki/) under the AGPL-3.0
  license, with the attribution in
  [`NOTICE`](packages/core/src/anki/NOTICE). The real-day intervals still come
  from the MIT-licensed `ts-fsrs`.

The full product plan lives in [docs/SPEC.md](docs/SPEC.md). The fishing mode
is described in [docs/design/fishing.md](docs/design/fishing.md).

## Repository layout

```
apps/mobile    Expo app (expo-router, expo-sqlite, expo-audio, expo-haptics, expo-notifications, expo-secure-store)
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

The app is the home screen of the app: pick a mode (**Fishing**), pick what to
study (**All**, a topic or a set) and tap **Go**. The last choice is
remembered, so the next session is one tap away.

### The fishing mode

`apps/mobile/src/modes/fishing/` holds the whole mode; the rules live in
`packages/core/src/fishing/` and are shared with the API.

```
packages/core/src/fishing/
  catches.ts   the seven tiers and the catch catalogue (junk, jokes, seasonal
               catches and the critter catches)
  roll.ts      the tier odds per lure rank, the weight roll, the special table
               (new lure, frenzy, powerups, critters, pack tickets), the lure
               guarantees and the bonus card rule
  machine.ts   the pure reducer of the nine states of the mode
  lures.ts     the shop of the mode (starting lures, baits, rods, dock skins)
```

The loop is `cast → wait → HOOKED! → answer → reel → reveal` (or
`got away → cast again`). The catch is rolled when the fish is hooked, the
next card of the FSRS queue is pulled at the same moment, and the question is
shown as a parchment note inside the scene (never as a full screen card).
There is no timer anywhere: the bite takes 0.8 to 2.5 seconds and the player
decides when to reel in.

The sprites do not exist yet, so every one of them falls back to a tier
coloured circle with an emoji. The sounds are CC0 (Kenney) and are credited
in `apps/mobile/assets/CREDITS.md`.

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

**Releasing is automatic.** Bump `version` in `apps/mobile/app.json` in the PR
(every PR that changes the app does). When that lands on `main`,
[`.github/workflows/release-on-version-bump.yml`](.github/workflows/release-on-version-bump.yml)
creates the `v<version>` tag and starts the Android build on it, and the build
publishes the GitHub release. The in-app update check reads the latest release,
so phones see the new version about half an hour after the merge. If the tag
already exists nothing happens; pushing a `v*` tag by hand still works too.

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

- [ ] Phase 1: set import (paste/CSV/JSON), session API (`start` / `end`),
      server side payout, offline outbox sync, pack shop with the Starter and
      Halloween 2026 packs.
- [x] Phase 1: the **Fishing** mode (scene, loop, HUD, payout screen).
- [ ] The session API has to validate the critters and the pack tickets of a
      fishing session and pay the tokens out (the mode shows the estimate of
      `computePayout` until then).
- [ ] The art of the mode (the PNGs of `docs/ART-HANDOFF.md`) and the shop of
      the lures (the baits, the rods and the dock skins are data only).
- [ ] Phase 2: MCP server on `/mcp`, push reminders, stats page, collection book.
- [ ] Replace the `database_id` placeholder in `apps/api/wrangler.jsonc`.
- [ ] Push the `expo-notifications` stub to the API (`push_tokens`) once the
      cron trigger exists.
