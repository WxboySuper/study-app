# CramCritters — Spec & MVP Plan (formerly "working title: Blookless")
_Draft 2026-10-21 · Owner: Alex Miller · Solo dev, phone-first_

## 1. Pitch
A solo, **untimed** Blooket-style game that uses spaced repetition to pick your cards. Endless, chill game modes. You play as long as you like, then tap **End**, and that is when the rewards drop: tokens plus collectible characters ("critters", our own version of blooks). The goal is to replace doomscrolling on Instagram, Discord and Twitter with something that feels just as good and actually teaches you something.

## References / Inspiration
**One line:** Anki's brain wearing Blooket's clothes: mobile-first, solo, untimed, with an End-button payout.

**Blooket is the reference for game feel**
- Solo game modes such as Fish Frenzy and the food-serving mode (Café)
- The number-go-up loop
- Tokens and collectible "blooks"
- What we drop: the timer, competition, and lobbies

**Anki is the reference for the learning engine**
- Spaced repetition (we use FSRS)
- Decks/sets and tags/topics
- What we drop: its clunky, desktop-first UI

## 2. Core principles
- **No timers, no fail states.** A wrong answer slows progress but never ends the run.
- **The scheduler picks the cards, the game picks the vibe.** FSRS chooses what you see, and the mode only decides how it looks.
- **The payout comes at End**, so there's an exit ramp you choose and a dopamine hit when you stop, not while you keep going (healthy stopping cue).
- **Phone first.** One-thumb play, native Android-first app (Expo; iOS later), works offline.
- **Agent friendly.** AI agents can create and import sets over MCP.

## 3. Features
| Area | MVP | Later |
|---|---|---|
| Modes | **Fish Frenzy-like** "Cast": correct answer → catch a fish, weight/multiplier number goes up | "Café" food serving (combos, customer queue), idle/tower, ambient garden |
| Scope | Study **All / Topic(tag) / Set** | Custom filters (due only, leeches, new only) |
| SRS | ts-fsrs, 4-button grade auto-derived (wrong=Again, slow=Hard, correct=Good, fast streak=Easy); per-card state | Parameter optimization from review logs, desired retention slider |
| Rewards | Tokens = f(correct, new learned, due cleared); End payout screen; buy **packs** → random critter (rarity tiers) | Collection book, more seasonal packs (Thanksgiving, Winter), cosmetics for modes, streak shields |
| Question types | **Multiple choice only** (2 to 4 choices, the wrong answers are written by the author for every question) | Short answer (fuzzy match), math (KaTeX rendering + numeric/expression answers), cloze |
| Import | Paste/CSV/TSV (Quizlet export format), JSON | Anki .apkg, image cards, cloze |
| MCP | — (Phase 2) | `create_set`, `add_cards`, `import_set`, `list_sets`, `search_cards`, `get_stats` |
| Engagement | — | Push notifications via expo-notifications (Phase 2): daily "due count" nudge, streak-at-risk, new seasonal pack; quiet hours. Home screen widget (Phase 4, via Expo config plugins / native targets) |
| Learning science | Retrieval practice, spacing (FSRS), interleaving in "All" | Elaboration prompts, dual coding (images), pre-test on new sets, "explain it" self-check, daily new-card cap |

### Collectibles: packs & critters
Blooket-style themed **packs** bought with tokens. Opening a pack gives one random critter from that pack, weighted by rarity: **Common 60% · Uncommon 25% · Rare 10% · Epic 4% · Legendary 1%**. Duplicates convert to bonus tokens. All names and characters are original.

**Starter Pack: "Brain Buddies"** (always available, 20 tokens)
| Critter | Rarity | Vibe |
|---|---|---|
| Nibbles the Notecard | Common | A folded index card that snacks on loose facts. |
| Pip Pencil | Common | Tiny, eager, always first to raise its eraser. |
| Doodle Moth | Common | Flutters around your margins leaving little sketches. |
| Sir Highlighter | Common | Marks everything important in blinding yellow. |
| Gummy Eraser | Uncommon | Squishy; forgives every mistake you've ever made. |
| Captain Cram | Uncommon | Pulls all-nighters on purpose. Do not be like him. |
| Recall Raccoon | Uncommon | Digs through your memory trash and finds the good stuff. |
| Synapse Sprite | Rare | A crackling spark that zips between neurons. |
| Professor Hoot-n-Holler | Rare | An owl who lectures loudly and is always right. |
| Mnemo the Memory Jelly | Epic | A glowing jellyfish that never forgets a single card. |
| The Spaced Ranger | Epic | Shows up exactly when you're about to forget. |
| Gigabrain Golem | Legendary | Built from every card you've ever mastered. |

**Seasonal: "Halloween 2026 — Midterm Monsters"** (available Oct 1–Nov 2, 2026 CT, 25 tokens; critters stay in your collection forever)
| Critter | Rarity | Vibe |
|---|---|---|
| Candy Corn Kid | Common | Divisive, sugary, and fully committed. |
| Pumpkin Pupil | Common | A jack-o'-lantern that studies by its own candlelight. |
| Bat-ter Up | Common | A bat who swings at every question, hits most of them. |
| Ghost of Finals Past | Uncommon | Haunts you with the questions you skipped. |
| Mummy Wrapped-Up | Uncommon | Wraps up every study session neat and tidy. |
| Count Flashula | Rare | Vants to quiz your flashcards. Ah-ah-ah! |
| The Witching Hour Owl | Epic | Only appears during late-night sessions. Spooky smart. |
| Headless Homework Horseman | Legendary | Lost his head, never his GPA. |

**Seasonal calendar** (US Central; each is a core-priced 25 token pack of 8 critters, 3 common / 2 uncommon / 1 rare / 1 epic / 1 legendary; critters stay in the collection forever). Packs are data, not code: adding a season is one entry in `content/packs.ts`, eight entries in `content/critters.ts` and the art.

| Window | Pack | Theme |
|---|---|---|
| Oct 1 – Nov 2 | Midterm Monsters | Halloween (shipped) |
| Nov 2 – Dec 1 | Gobble Scholars | Thanksgiving (shipped) |
| Dec 1 – Jan 1 | Frostbitten Finals | Winter and finals week (shipped) |
| Jan 1 – Feb 1 | Resolution Rookies | New year: planners, habit trackers, gym-bro flashcards |
| Feb 1 – Mar 1 | Flashcard Flirts | Valentine's: study-date critters (love notes as mnemonics) |
| Mar 1 – Apr 1 | Spring Break Scholars | Spring break: beach towels, sunscreen sage, the one who actually studies |
| Apr 1 – May 1 | Bloom & Boom | Spring: sprouting knowledge, April-fools quiz gremlins |
| May 1 – Jun 1 | Finals Frenzy | Exam season: energy-drink sprites, library campers |
| Jun 1 – Sep 1 | Summer School Sidekicks | Summer: lifeguard tutors, ice-pop study snacks |
| Sep 1 – Oct 1 | Syllabus Week | Back to school: planners, highlighters, first-day nerves |

Seasonal critters never come back as a pack the next year unless the whole set is remixed with new variants ("2027 Edition"), so the book stays a record of when you studied.

### End-of-session payout
`tokens = floor(1.5·correct + 1·newCardsGraduated + 0.25·dueCleared) + modeBonus(score)` (see Economy tuning: ~50 tokens per 10 min session), with a soft cap per day (~500, diminishing returns after ~N tokens) so grinding doesn't beat spacing. You get one free pack each day you clear your due queue. **The payout is computed on the server** from the review logs, so the client can't pay itself.

## 4. Stack (Cloudflare free tier)
- **Client:** native app built with **Expo** (React Native, TypeScript), **Android primary** (Alex is an Android user), iOS later. **expo-router** for navigation, Zustand for state. Dev via Expo Go / dev client.
- **Android builds (no EAS cloud):** GitHub Actions on ubuntu runs `expo prebuild -p android` then `./gradlew assembleRelease`, signed with a release keystore from repo secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). The keystore itself is never committed; the master copy lives on the VPS at `~devrun/keys/` (mode 600). Local builds via `npx expo run:android` or gradle also work.
- **Distribution:** `.github/workflows/android-release.yml` runs on tags `v*` and on manual dispatch, then uploads the signed APK to **GitHub Releases**. Alex installs it from the repo's Releases page on his phone. The repo is private, so he must be logged in to GitHub in the phone's browser; Android also needs "install unknown apps" allowed for that browser. A web build via Expo (`expo export --platform web`) is optional, not a goal.
- **API:** a single Cloudflare **Worker** built on **Hono**.
- **DB:** **D1** (SQLite) for everything. Durable Objects aren't needed for the MVP because it's single user. Add them later only if there's realtime or multiplayer.
- **Offline:** **expo-sqlite** local store holding cards/state and an outbox review queue. Reviews are queued locally and synced in batches via `POST /sync`. Review logs are append-only, so merging is trivial.
- **SRS:** `ts-fsrs` **5.4.2** (stable). v6 is at 6.0.0-beta.15 and stable is planned for ~Oct 28, 2026. Start on 5.x and upgrade later. Scheduling runs on the client for snappiness and is re-validated on the server at sync.
- **Auth:** single user to start. The app calls the API with a bearer token stored in expo-secure-store (Cloudflare Access doesn't suit a native client); proper login later. The MCP server uses a bearer token in a Worker secret, with OAuth (`workers-oauth-provider`) later.
- **MCP:** in the same Worker on `/mcp`, using `createMcpHandler` from `agents/mcp/server` plus `@modelcontextprotocol/server` (SDK v2). It's **stateless Streamable HTTP**. **Don't use `McpAgent`**, because it's deprecated and feature-frozen per the Cloudflare docs (Oct 2026).
- **Push:** **expo-notifications**; the app registers an Expo push token with the API, and a Worker **Cron Trigger** sends via the Expo Push Service (handles APNs/FCM).
- **CI:** GitHub Actions on Node 22/24/26, Vitest, typecheck/lint of the Expo app, `wrangler deploy` of the API on main; the signed Android APK is built by the tag-triggered release workflow.

## 5. Data model (D1)
```sql
users(id TEXT PK, created_at INT, settings_json TEXT)           -- retention, daily new cap, quiet hours
topics(id TEXT PK, user_id, name, color)
sets(id TEXT PK, user_id, topic_id NULL, title, description, source TEXT, -- 'manual'|'csv'|'mcp'|'anki'
     created_at, updated_at)
cards(id TEXT PK, set_id, type TEXT DEFAULT 'mc', -- 'mc' now; 'short'|'math'|'cloze' later
     front TEXT, back TEXT, answer_json TEXT NULL,  -- later: accepted answers / math expr + tolerance
     render TEXT DEFAULT 'text',                   -- 'text'|'katex'
     extra_json TEXT, -- hints, image url, choices
     created_at, updated_at, deleted_at NULL)
card_state(card_id PK, due INT, stability REAL, difficulty REAL, elapsed_days INT,
     scheduled_days INT, reps INT, lapses INT, state INT, last_review INT)  -- mirrors ts-fsrs Card
review_logs(id TEXT PK, card_id, session_id, rating INT, state INT, due INT, stability, difficulty,
     elapsed_days, scheduled_days, review INT, duration_ms INT, client_id TEXT UNIQUE) -- idempotent sync
sessions(id TEXT PK, user_id, mode TEXT, scope_json TEXT, started_at, ended_at NULL,
     score INT, stats_json TEXT, payout_tokens INT NULL)
wallet(user_id PK, tokens INT, updated_at)
ledger(id PK, user_id, delta INT, reason TEXT, ref_id TEXT, created_at)    -- audit for tokens
packs(id TEXT PK, name, theme TEXT, price_tokens INT, kind TEXT,        -- 'core'|'seasonal'
     available_from INT NULL, available_until INT NULL, sort INT)       -- NULL window = always on sale
critters(id TEXT PK, pack_id, name, rarity TEXT, vibe TEXT, art_url)     -- static catalog (seeded)
user_critters(user_id, critter_id, count INT, first_at, PRIMARY KEY(user_id, critter_id))
push_subs(id PK, user_id, endpoint, keys_json, created_at)
api_tokens(id PK, user_id, hash TEXT, label, scopes TEXT, created_at, last_used)
```
Pack shop shows packs where `now` is inside `[available_from, available_until)` (server-side check at purchase). Indexes: `packs(available_from, available_until)`, `card_state(due)`, `cards(set_id)`, `review_logs(card_id, review)`, `sets(topic_id)`.

**Queue builder:** due cards in scope, ordered by `due` ascending, then new cards up to the daily cap, interleaved. Once the queue runs dry the mode keeps going in **"bonus review"** using low-stability cards. These still log reviews but use FSRS's *short-term/preview* behaviour and give reduced tokens. This keeps the "endless" promise without wrecking the schedule.

## 6. Phased MVP
**Phase 0 – Scaffold (½ day):** monorepo (`apps/mobile` Expo, `apps/api` Worker, `packages/core`), expo-router shell, Hono Worker, D1 migrations, CI, API deploy to `*.workers.dev`.

**Phase 1 – First playable slice (target: 1 week)**
1. Set import (paste/CSV/JSON) → D1.
2. Scope picker: All / Topic / Set.
3. FSRS queue + grading (`packages/core`, unit-tested).
4. **Cast** mode (the fish-style one): question → 2 to 4 choices (the wrong answers the author wrote for that question), catch animation, a number-go-up counter.
5. **End** button → `POST /sessions/:id/end` → server payout → reward screen with tokens and one pack open.
6. Offline outbox + sync.
7. Pack system with seasonal availability windows; seed Starter pack + Halloween 2026 pack (ship before Nov 2).

**Phase 2 – Agents & habit:** MCP server on `/mcp` with bearer auth, push notifications (expo-notifications + Expo Push Service from a Cron Trigger), Thanksgiving pack, stats page (streak, retention, forecast), collection book.

**Phase 3 – More fun:** Café mode, Winter pack, short-answer cards (fuzzy match), math cards (KaTeX + numeric/expression checking), cloze, Anki import, FSRS parameter optimizer, ts-fsrs v6 upgrade.

**Phase 4 – Polish:** sounds and haptics, themes, **home screen widget** (Expo config plugin / native targets: a WidgetKit extension on iOS and a Glance widget on Android, reading due count & streak), optional sharing of sets.

## 7. GitHub issue breakdown
| # | Title | Phase | Labels |
|---|---|---|---|
| 1 | Scaffold monorepo: Expo app + Hono Worker + D1 + CI | 0 | infra |
| 2 | D1 schema + migrations (§5) + seed critter catalog | 0 | db |
| 3 | `packages/core`: FSRS wrapper (ts-fsrs 5.4.2), auto-rating, queue builder + tests | 1 | srs |
| 4 | Set CRUD API + import (paste/CSV/TSV/JSON) w/ validation | 1 | api |
| 5 | Web: set list, import screen, scope picker (All/Topic/Set) | 1 | web |
| 6 | Session API: start / review batch / end (idempotent) | 1 | api |
| 7 | Cast game mode (MC questions, own choices, catch anim, counter) | 1 | game |
| 8 | Payout calc + wallet/ledger + pack opening (server-authoritative) | 1 | rewards |
| 9 | End screen UI w/ reward reveal | 1 | web |
| 10 | Offline outbox (expo-sqlite) + `/sync` | 1 | mobile, api |
| 11 | Auth: Cloudflare Access gate + API tokens table | 1 | security |
| 12 | MCP server `/mcp` (createMcpHandler, SDK v2): create_set, add_cards, import_set, list_sets, get_stats | 2 | mcp |
| 13 | Push reminders (expo-notifications) via Cron Trigger + quiet hours | 2 | habit |
| 14 | Stats: streak, due forecast, retention | 2 | web |
| 15 | Collection book UI | 2 | rewards |
| 16 | Café game mode | 3 | game |
| 17 | Anki .apkg import | 3 | import |
| 18 | FSRS parameter optimization + v6 upgrade | 3 | srs |
| 19 | Learning-strategy tips + pre-test for new sets | 3 | learning |
| 20 | Pack system: `packs` table, availability windows, shop API (server-checked window + price) | 1 | rewards, db |
| 21 | Seed Starter "Brain Buddies" (12) + Halloween 2026 "Midterm Monsters" (8) + placeholder art | 1 | rewards, content |
| 22 | Thanksgiving 2026 seasonal pack | 2 | content |
| 23 | Winter 2026 seasonal pack | 3 | content |
| 24 | Card `type`/`render` columns (MC-only validation now, future-proof schema) | 0 | db |
| 25 | Short-answer cards (normalization + fuzzy match) | 3 | game, srs |
| 26 | Math cards: KaTeX rendering + numeric/expression answer checking | 3 | game |
| 27 | Push notification types: due nudge, streak-at-risk, new seasonal pack; permission prompt UX | 2 | habit |
| 28 | Home screen widget spike: Expo native targets + WidgetKit/Glance showing due count & streak | 4 | native |
| 29 | Custom domain `study.weatherboysuper.com` (see §8 DNS note) | 1 | infra |

## 8. Decisions (resolved Oct 21, 2026)
- **Client platform (changed Oct 21):** real native mobile app with Expo, not a PWA. Android first; builds in GitHub Actions (no EAS), distributed as a signed APK on GitHub Releases. Backend unchanged (Worker + Hono + D1 on workers.dev, plus MCP).
- **Critters:** Blooket-style themed packs bought with tokens; original Starter + Halloween 2026 packs above; Thanksgiving and Winter next; seasonal windows in the data model (Phase 1). Art style still open (leaning cute blob/pixel; placeholder art in MVP).
- **Question types:** multiple choice only for MVP; schema has `type`/`render`/`answer_json` so short answer and math (KaTeX) land in Phase 3 without a migration rewrite.
- **Domain:** Alex's personal domain, proposed **`study.weatherboysuper.com`**. DNS check (Oct 21): `weatherboysuper.com` is on **Hostinger DNS** (ns1/ns2.dns-parking.com), not Cloudflare, and `study.` doesn't exist yet. A Workers custom domain needs the zone on Cloudflare, so either (a) move the zone's nameservers to Cloudflare (free; must re-create existing records like `beta-gfc` first), or (b) ship on `*.workers.dev` first and add the subdomain later. Needs Alex's pick; not blocking Phase 0/1.
- **Engagement:** Push notifications via expo-notifications (Phase 2) and a home screen widget (Phase 4, Expo native targets). No Shortcut work: Alex will build his own.

## 9. First coding-agent prompt (self-contained)
```
FIRST: read docs/SPEC.md in this repo; it is the source of truth. Keep docs/SPEC.md as is and build alongside it.

Hard rules:
- MVP is MULTIPLE CHOICE ONLY. The schema may leave room for future question types (a `type` column defaulting to 'mc'), but implement no short-answer/math logic or UI.
- The client is a NATIVE mobile app built with Expo (React Native, TypeScript), NOT a PWA. No Vite, no service worker, no vite-plugin-pwa.
- The API deploy target is Cloudflare Workers on workers.dev (`workers_dev: true` in wrangler.jsonc, no custom domain). DO NOT deploy: do not run `wrangler deploy`, `wrangler login`, `eas build`, `eas login`, `gradlew`, or create any remote resources or accounts.
- You are on branch `feat/scaffold-core`. Don't switch branches, push, or touch main. Commit locally in logical steps, because the harness pushes and opens the PR.
- Before you finish, `pnpm install`, `pnpm -r typecheck`, `pnpm -r lint` and `pnpm -r test` must all pass. Commit pnpm-lock.yaml. No network calls in tests, no secrets in code, keep deps minimal.

Build Phase 0 + the FSRS core of a personal study app: a solo, untimed, Blooket-style study game. Spaced repetition (FSRS) picks the cards, game modes are cosmetic, and rewards (tokens + collectible "critters") are paid out server-side when the player taps End. Single user for now.

1. A pnpm workspace monorepo (Node >=22, TypeScript strict, pnpm-workspace.yaml):
   - apps/mobile: an Expo app (current stable Expo SDK, created to match `create-expo-app` default-template conventions; use `node-linker=hoisted` in .npmrc so Expo/Metro works with pnpm). It uses expo-router with a single placeholder Home screen (app/index.tsx) holding a "Study All" button. Add expo-sqlite, with a small `src/db/local.ts` that opens a local DB and creates `local_cards`, `local_card_state` and `outbox` (pending review logs) tables. Add expo-notifications as a dependency and config plugin only, with a stub `src/notifications.ts` (requestPermission + getExpoPushToken) that is not called on startup. Add expo-secure-store for a future API token. Set app.json/app.config.ts name "study-app" with ios.bundleIdentifier/android.package `com.wxboysuper.studyapp` (no eas.json; builds use expo prebuild + gradle in CI). Add the scripts `start`, `typecheck` (tsc --noEmit) and `lint`. The app imports from packages/core via the workspace.
   - apps/api: a Cloudflare Worker using Hono, with wrangler.jsonc holding a D1 binding named DB (database_id placeholder "TODO"), `workers_dev: true`, `GET /api/health` returning {ok:true}, and a commented placeholder route for `/mcp`. Include a Vitest test for /api/health (call app.fetch directly, no network).
   - packages/core: pure TypeScript with no React/RN/Worker dependencies.
2. A D1 migration `apps/api/migrations/0001_init.sql` with tables users, topics, sets, cards (with `type TEXT NOT NULL DEFAULT 'mc'`, `choices_json`), card_state (mirroring the ts-fsrs Card fields due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review), review_logs (with UNIQUE client_id for idempotent sync), sessions, wallet, ledger, critters, user_critters, push_tokens (Expo push tokens), and api_tokens. Index card_state(due), cards(set_id) and review_logs(card_id, review).
3. packages/core using `ts-fsrs` pinned to exactly 5.4.2:
   - `autoRating({correct, durationMs, streak}) -> Rating`: wrong=Again, correct & >15s=Hard, correct=Good, correct & <4s & streak>=3 = Easy. Thresholds are configurable.
   - `buildQueue(cards, states, now, {newCap, scope})`: due cards ascending by due, then up to newCap new cards interleaved across sets. When that is empty, return low-stability "bonus" cards flagged `bonus: true`.
   - `grade(card, state, rating, now)`, which wraps ts-fsrs `fsrs().next(...)` and returns the new state + log.
   - `computePayout({correct, graduated, dueCleared, modeScore, tokensToday})` with a soft daily cap.
   - Vitest tests for all of the above, with >=90% coverage on core.
4. GitHub Actions (.github/workflows/ci.yml): pnpm install --frozen-lockfile, then typecheck, lint (an ESLint flat config at the root), and test on Node 22, 24 and 26. No deploy or Android build steps (a separate android-release.yml is added by a maintainer).
5. A README with local dev commands (`pnpm --filter mobile start`, `pnpm --filter api dev`, `wrangler d1 migrations apply DB --local`, and a note that Android release APKs are built by GitHub Actions on `v*` tags; locally use `npx expo run:android`).

Finish by listing what was built, how to run it, and anything left TODO.
```

## Economy tuning (Alex, Oct 21 2026; revised Oct 21 2026 — Blooket scale)
- Benchmark: a ~10 min session at ~70% accuracy (~30 correct) should earn ~50 tokens (~1.5 tokens/correct, before mode bonuses).
- Pack prices: standard packs 20–25 tokens (Brain Buddies 20, seasonal packs like Midterm Monsters 25), so ~2 packs per solid session.
- Selling: duplicates only. Provide a "Sell all duplicates" button; the last copy of any critter can never be sold. Sell value scales with rarity.
- Soft daily cap should sit well above a normal day's play so it never feels punishing.

### The token economy (Blooket scale)

| Rarity | Sell value (tokens) |
|---|---|
| Common | 5 |
| Uncommon | 10 |
| Rare | 20 |
| Epic | 75 |
| Legendary | 200 |

- **Pack prices stay 20 and 25.** Brain Buddies is 20 tokens, the seasonal packs (Midterm Monsters) are 25.
- **Every price and every reward is a multiple of 5**: the sell values, the pack prices and every prize of the daily wheel (10, 20, 30, 50, 100, 250, 500, 1000).
- **No farming by opening and selling.** The expected value of one pack — the sum of the odds of its rarities times the sell value of the rarity — is 12.5 tokens, below the 20 (or 25) tokens the pack costs. Selling a duplicate is never a better deal than opening a pack.
- **A legendary is worth several packs.** One legendary duplicate sells for 200 tokens: ten packs of Brain Buddies. That is the payoff of a lucky pull.
- The rules are tested in `packages/core/test/collection.test.ts`.

Sources: [Blooket — Blooks](https://blooket.fandom.com/wiki/Blooks) and [Blooket — Packs](https://blooket.fandom.com/wiki/Packs) (sell values and pack prices).

## Daily spin + XP (Alex, Oct 21 2026; reference: Blooket wiki "Tokens and XP")
- Blooket reference: 2 tokens per correct answer in most solo modes, 500 token daily earning cap, Daily Wheel once per day (10–1,000 tokens, weighted low, does not count toward the cap), XP 300/day feeding a 100-level Class Pass of cosmetics.
- Ours: ~1.5–2 tokens per correct (keep the ~50 tokens per 10 min benchmark), soft daily earning cap ~500.
- Daily Spin: once per local day, server-side RNG, weighted wheel (most spins 10–50, rare 100–250, very rare jackpot), outside the daily cap. Table `daily_spins(user_id, local_date UNIQUE, reward)`. Phase 1 or 2.
- XP + level pass (later phase): XP per session, daily XP cap, levels unlock cosmetics/critter accessories.

## Economy principle (Alex, Oct 21 2026)
Tokens exist to keep Alex studying: rewarding but not too easy.
- Pay for learning, not grinding: correct answers on due/new cards and cards that graduate earn full value; bonus-review (nothing due) and rapid repeat answers earn reduced tokens.
- No farming: per-card diminishing returns within a session; guessing fast streaks don't pay extra.
- Keep the next pack ~1 session away: prices and payout tuned so a normal 10-15 min session buys about 1-2 packs, never 5.
- Daily spin weighted low; jackpots rare so the main source stays studying.
- Streak bonus for showing up daily (small, scales slowly) to reward consistency over marathon sessions.

## Game mode lineup (Alex, Oct 21 2026)
Build order: 1) Fishing Frenzy-style Cast (MVP), 2) Café, 3) Factory, 4) Gold Quest (major solo rework needed: no stealing from players; design solo chest events like doubles, swaps with a "rival" NPC or your own vault, bank-or-push-your-luck). Crazy Kingdom / Tower of Doom: parked.
Pack prices: Brain Buddies 20, seasonal 25 (supersedes 50/75). Add chroma + mystical rarities later; the "expected value of a pack is below its price" rule replaces the old "buy price > sell value" rule (a legendary duplicate now sells for 200 tokens, ten packs).
Visual reference: AI Studio "Blookless" prototype (dark navy + neon, 6-tab bottom nav, due badge, album grid); screenshots in /workspace/study-app/aistudio/.

## UX direction (Alex, Oct 21 2026)
The AI Studio "Blookless" prototype is NOT the UX reference; Alex disliked its UI/UX. Game modes must look and play like real game scenes, close to Blooket's Fishing Frenzy (animated lake, casting, fish reveal, weight/haul) and Café (counter, customers lining up, serving food, upgrades), not a quiz card with a themed skin. Do a dedicated game-feel/UX design pass (scene layout, animations, juice, sound) before building each mode.

## Visual design system (Alex, Oct 21 2026)
The app is a premium mobile game, not a React Native app with a theme. One design system for every screen (`apps/mobile/src/ui/`, tokens in `apps/mobile/src/theme.ts`):

- **Background:** deep layered dark gradient (`#111214` → `#181818`, indigo and navy washes), radial colored glows behind the focal elements, a field of stars and slow bokeh. Every screen has a variant: `home`, `packs`, `collection`, `spin`, `ocean`.
- **Cards:** glassy — a gradient border, a 1px inset top highlight and a soft large drop shadow.
- **Buttons:** chunky 3D — a gradient face on a darker base 6px below it; the face sinks into the base with a spring and the phone buzzes when it is pressed. No default `Pressable` look anywhere.
- **Accent:** a violet gradient at 135deg (`#7b61ff` → brand blue `#4f7dff`), gold for the tokens, pink for the shop, amber for the wheel, green for the collection.
- **Type:** Fredoka (600/700) for the titles, the buttons and the numbers, Nunito for the body. The fonts are loaded in `app/_layout.tsx` and the splash screen is held until they are there.
- **Motion:** Reanimated everywhere, springs for the presses, staggered `FadeInDown` entrances, count-up token counters, particle bursts and shine sweeps. When the player (or the system) asks for less motion, the loops stop and the screens stay still.
- The reference is Alex's GFC marketing page (layered dark gradients, radial glows, soft shadows, glassy cards) combined with the chunky, playful energy of Blooket.

## Session flow
Every mode is played in short sessions, not one endless game. All of it is one tap.
- **Start:** Home → pick a mode (Fishing, later Café, Factory, Gold Quest) → pick a set, a topic or **All** → **Go**. The last choice is remembered, so "Play again" from Home is a single tap.
- **Play:** untimed. Cards come from the FSRS queue (due, then new, then bonus review).
- **End:** one **End** button (with a light confirm) → `POST /sessions/:id/end` → **payout summary** with tokens earned, catches and score (e.g. haul lbs), and new or duplicate critters and pack tickets.
- **Restart:** the summary has **Play again** (same mode and set, one tap) and **Home**.
- Mode design rule: stay faithful to the Blooket original. Change only what solo, untimed play requires: no timer, no rivals or distractions, and the End payout.
