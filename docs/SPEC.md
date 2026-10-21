# Study App ("working title: Blookless") — Spec & MVP Plan
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
- **Phone first.** One-thumb play, installable PWA, works offline.
- **Agent friendly.** AI agents can create and import sets over MCP.

## 3. Features
| Area | MVP | Later |
|---|---|---|
| Modes | **Fish Frenzy-like** "Cast": correct answer → catch a fish, weight/multiplier number goes up | "Café" food serving (combos, customer queue), idle/tower, ambient garden |
| Scope | Study **All / Topic(tag) / Set** | Custom filters (due only, leeches, new only) |
| SRS | ts-fsrs, 4-button grade auto-derived (wrong=Again, slow=Hard, correct=Good, fast streak=Easy); per-card state | Parameter optimization from review logs, desired retention slider |
| Rewards | Tokens = f(correct, new learned, due cleared); End payout screen; buy **packs** → random critter (rarity tiers) | Collection book, more seasonal packs (Thanksgiving, Winter), cosmetics for modes, streak shields |
| Question types | **Multiple choice only** (4 choices, distractors from the same set) | Short answer (fuzzy match), math (KaTeX rendering + numeric/expression answers), cloze |
| Import | Paste/CSV/TSV (Quizlet export format), JSON | Anki .apkg, image cards, cloze |
| MCP | — (Phase 2) | `create_set`, `add_cards`, `import_set`, `list_sets`, `search_cards`, `get_stats` |
| Engagement | — | Web Push (Phase 2) daily "due count" nudge, streak-at-risk, new seasonal pack; quiet hours. Home screen widget (Phase 4, needs a native wrapper) |
| Learning science | Retrieval practice, spacing (FSRS), interleaving in "All" | Elaboration prompts, dual coding (images), pre-test on new sets, "explain it" self-check, daily new-card cap |

### Collectibles: packs & critters
Blooket-style themed **packs** bought with tokens. Opening a pack gives one random critter from that pack, weighted by rarity: **Common 60% · Uncommon 25% · Rare 10% · Epic 4% · Legendary 1%**. Duplicates convert to bonus tokens. All names and characters are original.

**Starter Pack: "Brain Buddies"** (always available, 50 tokens)
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

**Seasonal: "Halloween 2026 — Midterm Monsters"** (available Oct 1–Nov 2, 2026 CT, 75 tokens; critters stay in your collection forever)
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

**Next seasonal packs:** Thanksgiving (Nov 2026: e.g. "Gobble Scholars") and Winter (Dec–Jan). Packs are data, not code: adding a season is a seed/migration plus art, with no deploy logic changes.

### End-of-session payout
`tokens = 10·correct + 25·newCardsGraduated + 5·dueCleared + modeBonus(score)`, with a soft cap per day (diminishing returns after ~N tokens) so grinding doesn't beat spacing. You get one free pack each day you clear your due queue. **The payout is computed on the server** from the review logs, so the client can't pay itself.

## 4. Stack (Cloudflare free tier)
- **Frontend:** React + TypeScript + Vite PWA (`vite-plugin-pwa`), Tailwind, Zustand. Served as Workers static assets. This is the same muscle memory as GFC.
- **API:** a single Cloudflare **Worker** built on **Hono**.
- **DB:** **D1** (SQLite) for everything. Durable Objects aren't needed for the MVP because it's single user. Add them later only if there's realtime or multiplayer.
- **Offline:** IndexedDB (Dexie) outbox. Reviews are queued locally and synced in batches via `POST /sync`. Review logs are append-only, so merging is trivial.
- **SRS:** `ts-fsrs` **5.4.2** (stable). v6 is at 6.0.0-beta.15 and stable is planned for ~Oct 28, 2026. Start on 5.x and upgrade later. Scheduling runs on the client for snappiness and is re-validated on the server at sync.
- **Auth:** single user to start. Use Cloudflare Access (Google SSO) in front of the app, or a simple passkey later. The MCP server uses a bearer token in a Worker secret, with OAuth (`workers-oauth-provider`) later.
- **MCP:** in the same Worker on `/mcp`, using `createMcpHandler` from `agents/mcp/server` plus `@modelcontextprotocol/server` (SDK v2). It's **stateless Streamable HTTP**. **Don't use `McpAgent`**, because it's deprecated and feature-frozen per the Cloudflare docs (Oct 2026).
- **Push:** Web Push with VAPID from a Worker **Cron Trigger**. iOS needs the PWA to be installed to the home screen.
- **CI:** GitHub Actions on Node 22/24/26, Vitest, Playwright smoke, and `wrangler deploy` on main.

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
**Phase 0 – Scaffold (½ day):** monorepo (`apps/web`, `apps/worker`, `packages/core`), Vite PWA, Hono Worker, D1 migrations, CI, deploy to `*.workers.dev`.

**Phase 1 – First playable slice (target: 1 week)**
1. Set import (paste/CSV/JSON) → D1.
2. Scope picker: All / Topic / Set.
3. FSRS queue + grading (`packages/core`, unit-tested).
4. **Cast** mode (the fish-style one): question → 4 choices (distractors drawn from the same set), catch animation, a number-go-up counter.
5. **End** button → `POST /sessions/:id/end` → server payout → reward screen with tokens and one pack open.
6. Offline outbox + sync.
7. Pack system with seasonal availability windows; seed Starter pack + Halloween 2026 pack (ship before Nov 2).

**Phase 2 – Agents & habit:** MCP server on `/mcp` with bearer auth, Web Push notifications (VAPID + Cron; iOS 16.4+ supports it for PWAs installed to the home screen), Thanksgiving pack, stats page (streak, retention, forecast), collection book.

**Phase 3 – More fun:** Café mode, Winter pack, short-answer cards (fuzzy match), math cards (KaTeX + numeric/expression checking), cloze, Anki import, FSRS parameter optimizer, ts-fsrs v6 upgrade.

**Phase 4 – Polish:** sounds and haptics, themes, **home screen widget** (a PWA can't create native iOS/Android widgets; options: Capacitor wrapper + a small WidgetKit/Glance extension reading due count, or a minimal native wrapper app), optional sharing of sets.

## 7. GitHub issue breakdown
| # | Title | Phase | Labels |
|---|---|---|---|
| 1 | Scaffold monorepo: Vite React TS PWA + Hono Worker + D1 + CI | 0 | infra |
| 2 | D1 schema + migrations (§5) + seed critter catalog | 0 | db |
| 3 | `packages/core`: FSRS wrapper (ts-fsrs 5.4.2), auto-rating, queue builder + tests | 1 | srs |
| 4 | Set CRUD API + import (paste/CSV/TSV/JSON) w/ validation | 1 | api |
| 5 | Web: set list, import screen, scope picker (All/Topic/Set) | 1 | web |
| 6 | Session API: start / review batch / end (idempotent) | 1 | api |
| 7 | Cast game mode (MC questions, distractors, catch anim, counter) | 1 | game |
| 8 | Payout calc + wallet/ledger + pack opening (server-authoritative) | 1 | rewards |
| 9 | End screen UI w/ reward reveal | 1 | web |
| 10 | Offline outbox (Dexie) + `/sync` | 1 | web, api |
| 11 | Auth: Cloudflare Access gate + API tokens table | 1 | security |
| 12 | MCP server `/mcp` (createMcpHandler, SDK v2): create_set, add_cards, import_set, list_sets, get_stats | 2 | mcp |
| 13 | Web Push reminders via Cron Trigger + quiet hours | 2 | habit |
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
| 27 | Push notification types: due nudge, streak-at-risk, new seasonal pack; iOS install prompt | 2 | habit |
| 28 | Home screen widget spike: Capacitor + WidgetKit/Glance showing due count & streak | 4 | native |
| 29 | Custom domain `study.weatherboysuper.com` (see §8 DNS note) | 1 | infra |

## 8. Decisions (resolved Oct 21, 2026)
- **Critters:** Blooket-style themed packs bought with tokens; original Starter + Halloween 2026 packs above; Thanksgiving and Winter next; seasonal windows in the data model (Phase 1). Art style still open (leaning cute blob/pixel; placeholder art in MVP).
- **Question types:** multiple choice only for MVP; schema has `type`/`render`/`answer_json` so short answer and math (KaTeX) land in Phase 3 without a migration rewrite.
- **Domain:** Alex's personal domain, proposed **`study.weatherboysuper.com`**. DNS check (Oct 21): `weatherboysuper.com` is on **Hostinger DNS** (ns1/ns2.dns-parking.com), not Cloudflare, and `study.` doesn't exist yet. A Workers custom domain needs the zone on Cloudflare, so either (a) move the zone's nameservers to Cloudflare (free; must re-create existing records like `beta-gfc` first), or (b) ship on `*.workers.dev` first and add the subdomain later. Needs Alex's pick; not blocking Phase 0/1.
- **Engagement:** Web Push notifications (Phase 2) and a home screen widget (Phase 4, native wrapper required). No Shortcut work: Alex will build his own.

## 9. First coding-agent prompt (self-contained)
```
You are building Phase 0 + the FSRS core of a new personal study app. Work in an EMPTY git repo
(already cloned at the current directory). Do not deploy, do not create remote resources, do not
push to main; work on branch `feat/scaffold-core` and open a PR when done.

Product context: solo, untimed Blooket-style study game. Spaced repetition (FSRS) picks the cards;
game modes are cosmetic; rewards (tokens + collectible "critters") are paid out server-side when
the player taps End. Mobile-first PWA. Single user for now.

Build:
1. pnpm monorepo, Node >=22, TypeScript strict:
   - apps/web: React 19 + Vite + vite-plugin-pwa + Tailwind. One placeholder Home screen
     ("Study All" button). Installable manifest, offline app shell.
   - apps/worker: Cloudflare Worker using Hono, wrangler.jsonc with a D1 binding named DB
     (database_id placeholder "TODO"), serves apps/web build as static assets, `GET /api/health`.
   - packages/core: pure TS, no DOM/Worker deps.
2. D1 migration `apps/worker/migrations/0001_init.sql` with tables: users, topics, sets, cards,
   card_state (mirrors ts-fsrs Card fields: due, stability, difficulty, elapsed_days,
   scheduled_days, reps, lapses, state, last_review), review_logs (with UNIQUE client_id for
   idempotent sync), sessions, wallet, ledger, critters, user_critters, push_subs, api_tokens.
   Add indexes on card_state(due), cards(set_id), review_logs(card_id, review).
3. packages/core using `ts-fsrs@5.4.2` (pin exact version):
   - `autoRating({correct, durationMs, streak}) -> Rating` (wrong=Again; correct & >15s=Hard;
     correct=Good; correct & <4s & streak>=3 = Easy). Make thresholds configurable.
   - `buildQueue(cards, states, now, {newCap, scope})`: due cards ascending by due, then up to
     newCap new cards, interleaved across sets; when empty return "bonus" low-stability cards
     flagged `bonus: true`.
   - `grade(card, state, rating, now)` wrapping ts-fsrs `fsrs().next(...)`, returning new state + log.
   - `computePayout({correct, graduated, dueCleared, modeScore, tokensToday})` with soft daily cap.
   - Vitest tests for all of the above (≥90% coverage on core).
4. GitHub Actions: install, typecheck, lint (eslint flat config), test on Node 22, 24, 26; build web.
5. README with local dev commands (`pnpm dev`, `wrangler d1 migrations apply DB --local`).

Constraints: no secrets in code; no network calls in tests; keep deps minimal; commit in logical
steps. Finish by listing what was built, how to run it, and anything left TODO.
```
