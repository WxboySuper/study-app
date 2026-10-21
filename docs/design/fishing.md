# Fishing mode ("Fish Frenzy") — game-feel design

Status: design, pre-build. Owner: Alex. Supersedes the AI Studio "Cast" prototype, which is **not** a UX reference.

> **Update (Oct 2026): the mode catches critters, not fish.** The tiers of the
> ladder are filled with the critters of the packs that are on sale, the
> bottom tier is junk and the "Special" slice is the table of the specials.
> The fish are gone: their registry (`packages/core/src/content/fish.ts`) is
> typed and empty, so the first fish is a data change. See §7 and
> `docs/ADDING-CONTENT.md`.

## 1. Goal
Look and play like Blooket's Fishing Frenzy, solo and untimed: an animated lake you fish in, where every catch is gated by answering one card. The card lives *inside* the scene (a speech bubble / note pinned to the line) — never a full-screen quiz card with a fishing label. The session ends only when you tap **End**, which triggers the server payout.

Design pillars:
1. **The scene is the screen.** Water, dock, sky, and fisher fill the screen at all times. UI is chrome around the scene.
2. **Every answer has a physical consequence.** Correct → the catch is reeled in. Wrong → the line snaps and the critter swims off.
3. **Number goes up.** The haul counter (lbs) ticks up visibly on each catch. Big catches get extra juice.
4. **Studying is the only throttle.** No timers. The pace is your own. Rewards follow the SPEC economy (≈1.5 tokens/correct, full rate only for due/new cards).

## 1b. Faithfulness and session flow
- **Stay faithful to Blooket's Fishing Frenzy.** Same loop, same HOOKED! moment, lure ranks reeled up during play, the 7-tier rarity ladder, the ~10× weight ladder, Frenzy, and the lbs haul as score. The only changes are what solo, untimed play needs: **no timer**, **no distractions** (Blooket solo has none either), FSRS card selection, and the End payout.
- **Additions Alex asked for, kept small:** powerups, persistent bait/lure upgrades, extra silly junk, and critter/pack-ticket catches.
- **Our twist:** the catches are **critters**, not fish. Every tier of the ladder holds the critters of the packs that are on sale, so the mode is another way to fill the collection (and to farm duplicates to sell).
- **Session flow** (see SPEC "Session flow"): Home → Fishing → set/topic/All → **Go** lands you on the dock, ready to cast. **End** → payout summary (tokens, haul lbs, catches by tier, biggest catch, new/dupe critters, pack tickets) → **Play again** (one tap, same set) or **Home**. Lure rank and Frenzy reset each session.

## 2. Research: how Blooket's Fishing Frenzy works
Sources: the [Fandom wiki](https://blooket.fandom.com/wiki/Fishing_Frenzy), the [Blooket help center overview](https://help.blooket.com/hc/en-us/articles/42439256581655-Game-Overview-Fishing-Frenzy), the Miraheze wiki and the blooketiq.com guide (all checked Oct 21, 2026).
- **Loop:** tap to cast → when a fish bites a big **"Hooked!"** banner appears → tap to start reeling → answer a question → correct lands the catch, wrong means "the fish got away" and you cast again. Wrong answers cost no lives, only the catch.
- **Score is total weight in lbs**, not the number of catches. One big catch beats a dozen small ones.
- **Lures, ranks 1–5:** you *reel up* lure upgrades as catches every few questions. Each rank shifts the pool from Trash/Easy toward Rare and above. Rank 5 is the first that can catch Angler's Legends like Swamp Monster.
- **Rarity ladder (7 tiers):** Trash (brown) → Easy One (Common) → Great Catch (green, Uncommon) → Rare Find (blue) → Epic Grab (red) → Catch of the Day (orange, Legendary) → Angler's Legend (purple, Mystical). There's also a "Special" Chroma-coloured tier for the Frenzy and New Lure catches.
- **Real catch table (examples):** Old Boot 15% / 1–10 lb, Waffle and Two of Spades 5% / 1–10 lb (junk). Jellyfish 10–25, Clownfish 20–45, Goldfish 30–65 and Frog 50–100 are Easy Ones. A Cat at 100–200 is a joke Great Catch. Crab 1k–2.5k, Pufferfish 2k–4k and Blobfish 3k–5k are Rare Finds. Octopus 10k–15k and Donut Blobfish 13k–25k are Epic Grabs. Narwhal 25k–50k, Baby Shark 50k–100k and Megalodon 250k–500k are Catch of the Day. UFO 1M–2M is an Angler's Legend, and Tim the Alien at 0.05% / 1.5M–2.5M is the rarest. Weights grow about 10× per tier, so the number goes up fast.
- **Fishing Frenzy event:** a rare catch that turns the sky and water rainbow, speeds up the music, and boosts rare odds for a short time.
- **Distractions** (hosted play only): catches that throw an animation over everyone's screen to slow them down. Solo has none.
- **Visuals** (gameplay screenshots and videos): a flat cartoon lake scene with a dock and the player's blook holding a rod. Bright sky, layered water, the bobber, a big bold "HOOKED!" pop, and a reveal of the catch with its rarity name in rarity colour and its weight. The leaderboard and haul live at the top. The look is chunky, outlined and cheerful.
- **Tokens:** 2 per question since the July 2026 rework. Solo has an optional timer of up to 30 min. **We drop the timer.**

## 3. Core loop (Alex's version, untimed)
```
IDLE ─tap Cast─▶ CASTING ─bobber lands─▶ WAITING ─bite 0.8–2.5s─▶ HOOKED!
HOOKED! ─tap Reel (or auto after 600ms)─▶ QUESTION  (next FSRS card, overlaid in-scene)
QUESTION ─correct─▶ REELING ─▶ REVEAL ─tap─▶ IDLE   (haul += lbs, effects applied)
QUESTION ─wrong──▶ GOT_AWAY (line snaps, fish swims off, right answer shown 1.5s) ─▶ IDLE
any ─End─▶ END_CONFIRM ─▶ PAYOUT
```
- **Card selection:** each HOOKED! pulls the next card from the FSRS queue in `@study-app/core` (due first, then new, then bonus review). The *catch is rolled when the fish is hooked*, before you answer. The silhouette size and the shimmer of the shadow hint at what's on the line (a big shadow, a rarity-coloured glow), so a wrong answer on a hinted Megalodon *hurts*. That's the Blooket tension, without a timer.
- **IDLE:** your equipped critter sits on the dock with a rod and idle animation. Big **Cast** button.
- **CASTING (~600ms):** rod swing, a bezier line arc, splash and ripples, *plop*.
- **WAITING:** the bobber bobs, shadows drift, and the bobber twitches on nibbles. The wait is always short (≤2.5s), since waiting isn't studying.
- **HOOKED!:** the bobber yanks under, and a giant tilted **"HOOKED!"** banner slams in with a screen shake and a heavy haptic. The shadow on the line shows its size. Tap **Reel** (auto-advances after 600ms if Alex prefers; it's a setting).
- **QUESTION:** the in-scene answer gate (§4). The line stays taut and the fish thrashes.
- **REELING (~900ms):** the reel spins, the line tightens, the fish is dragged up with spray, and bigger catches thrash harder.
- **REVEAL:** the catch flips out of the water onto a reveal card (§5).
- **GOT_AWAY:** a *twang*, the line goes slack, the shadow darts off, and the bubble reads **"It got away!"** with the right answer highlighted. You lose that catch, the streak resets, and the SRS grade is Again. That's the only penalty.

## 4. In-scene question overlay
- A **parchment note** unrolls from the taut line above the water, roughly the top 40% of the screen. The scene stays live behind it, dimmed 30%.
- The prompt is large (20sp min, auto-shrinks to 16sp, scrolls if longer).
- Answers are **4 wooden lure tags** hanging from a rope in a 2×2 grid at the bottom, each 56dp+ tall. Distractors come from the same set.
- Feedback: the tag presses in, then turns green with ✓ or red with a shake. Self-graded and typed cards (later) use the same gate with "Tap to flip" and ✓/✗ tags.
- There is no visible timer. Response time is tracked silently for Hard/Good/Easy, as in the SPEC.

## 5. Reveal card
- It springs in (scale 0.6→1.05→1) over a burst in the rarity colour.
- It shows the art, name, **rarity ribbon** using Blooket-style tier names (below), **weight** counting up, and a **NEW!** stamp the first time you catch something. Silly catches get a one-line joke caption ("Smells like detention"), critters show their vibe.
- Catch of the Day and Angler's Legend get a full-screen flash, a slow-mo leap, a fanfare and a triple haptic.
- The art of a catch comes from the art resolver of the app (`apps/mobile/src/content/art.ts`): the PNG of the critter (or of the junk item) when it exists, the placeholder of its type when it does not.

## 6. Catch tiers, odds and weights
Our tiers mirror Blooket's names, with a ~10× weight ladder so the number goes up:
| Tier | Colour | Weight range (lbs) |
|---|---|---|
| Trash | brown | 1–10 |
| Easy One | grey | 10–100 |
| Great Catch | green | 100–750 |
| Rare Find | blue | 500–5,000 |
| Epic Grab | red | 7,000–30,000 |
| Catch of the Day | orange | 25,000–500,000 |
| Angler's Legend | purple | 500,000–2,500,000 |
Odds per **lure rank** (%; the remaining slice is the "special" table in §8):
| Rank | Trash | Easy | Great | Rare | Epic | CotD | Legend | Special |
|---|---|---|---|---|---|---|---|---|
| 1 Worm | 30 | 45 | 16 | 4 | 0 | 0 | 0 | 5 |
| 2 Spinner | 20 | 40 | 22 | 10 | 2 | 0 | 0 | 6 |
| 3 Jig | 12 | 30 | 26 | 18 | 6 | 1 | 0 | 7 |
| 4 Golden Fly | 8 | 20 | 26 | 24 | 12 | 2.5 | 0.5 | 7 |
| 5 Legend Lure | 5 | 12 | 22 | 28 | 18 | 6 | 1 | 8 |
- **Lure rank rises within a session.** You *reel up* "New Lure!" as a special catch, guaranteed by 5, 12, 22 and 35 correct answers at the latest, as in Blooket. Rank resets each session. The **base lure** you start at is a persistent shop upgrade (§9), so progress carries over.
- **Bonus or repeat cards** (not due, not new) roll at rank 1 at best, mirroring the SPEC's lower token rate, so farming an easy deck stays boring.
- **Haul lbs is the score for bests and achievements. Tokens still come only from the SPEC payout formula** (~1.5/correct). Catches never mint tokens directly, apart from the capped specials in §8.
- **What a tier holds:** the bottom tier holds junk, every other tier holds the **critters of that rarity** of the packs that are on sale (Common → Easy One, Uncommon → Great Catch, Rare → Rare Find, Epic → Epic Grab, Legendary → Angler's Legend). A tier without any catch (the Catch of the Day tier has no critter yet) falls back to the closest tier that has one, so the game never dead ends.

## 7. Catch list
The mode catches **critters, junk and specials**. There is no fish left in the
catalogue: the fish registry is typed and empty (`packages/core/src/content/fish.ts`).
- **Trash (junk):** Old Sneaker, Soggy Waffle, Lost Homework (soaked), Two of Clubs, Rubber Duck, Tangled Earbuds, Half a Pencil, Mystery Tin Can, Expired Hall Pass, plus the seasonal Pumpkin Carving (Halloween) and Snowy Mittens (Winter). 1–10 lbs each.
- **Easy One (common critters):** every critter of the packs that are on sale with the rarity *common* — Nibbles the Notecard, Pip Pencil, Doodle Moth, Sir Highlighter (Brain Buddies) and Candy Corn Kid, Pumpkin Pupil, Bat-ter Up (Midterm Monsters, while that pack is on sale). 10–100 lbs.
- **Great Catch (uncommon critters):** Gummy Eraser, Captain Cram, Recall Raccoon, Ghost of Finals Past, Mummy Wrapped-Up. 100–750 lbs.
- **Rare Find (rare critters):** Synapse Sprite, Professor Hoot-n-Holler, Count Flashula. 500–5,000 lbs.
- **Epic Grab (epic critters):** Mnemo the Memory Jelly, The Spaced Ranger, The Witching Hour Owl. 7,000–30,000 lbs.
- **Catch of the Day:** no critter has that rarity yet: the tier falls back to the Angler's Legend (the fish registry will fill it).
- **Angler's Legend (legendary critters):** Gigabrain Golem and Headless Homework Horseman. 500,000–2,500,000 lbs.
- **Specials (§8):** New Lure!, FRENZY!, a powerup bottle and a Pack Ticket. They are not catches of the ladder: they change the session or give something.

A critter catch **is added to the collection at End** of the session (a duplicate
only bumps the count, so it can be sold). The critters of a pack that is not
on sale never swim up: the pool of a tier is built from the packs that are
available at the time of the session.

Data lives in the content registries (`packages/core/src/content/`): the
critters in `critters.ts`, the junk in `junk.ts`, the specials in
`specials.ts`. The logic that turns them into catches lives in
`packages/core/src/fishing/catches.ts`.

## 8. Special catches: lures, Frenzy, powerups, critters
The "Special" slice in §6 rolls on this table:
| Special | Share | Effect |
|---|---|---|
| **New Lure!** | 30% (plus guarantees) | lure rank +1 for this session (max 5), with a big reel-up and a lure-glow trail |
| **FRENZY!** | 15% | rainbow sky and water, music tempo up. The **next 5 catches** roll at rank +2 with ×2 weight. Counted in catches, not seconds, so it fits untimed play |
| **Powerup bottle** | 40% | one of: **Double Hook** (next correct lands 2 catches), **Lucky Charm** (next catch rerolls Trash/Easy once), **Second Chance** (next wrong answer lets the catch stay on, so you can retry the same card once; the SRS still logs the first miss as Again), **Heavy Sinker** (×3 weight on the next catch) |
| **Critter catch** | 12% | a bonus critter swims up, whatever the tier roll was. Rarity is rolled with the SPEC pack odds. It goes into the collection like any other critter catch |
| **Pack Ticket** | 3% | one free Brain Buddies pack, max 1 per session and 1 per day. It counts against the SPEC economy, so a ticket ≈ 20 tokens of value inside the daily cap |
The critter special and the ticket **only roll on due or new cards** (never bonus review) and are validated server-side at End, as tokens are, so they can't be farmed.

## 9. Lures and upgrades (shop, persistent)
| Item | Effect | Price (tokens) |
|---|---|---|
| Starting Lure II / III | start each session at rank 2 / 3 | 60 / 150 |
| Shiny Spinner (bait) | +10% weight | 30 |
| Glow Jig (bait) | +2% to Rare Find and above | 60 |
| Critter Chum (bait) | Critter catch share 12% → 16% | 80 |
| Rods: Bamboo → Carbon → Legend Reel | cosmetic swing, trail and reel sound | 40 / 90 / 200 |
| Dock skins: Dawn, Night, Halloween Swamp | palette swaps, seasonal | 50 each |
You equip one bait at a time on the pre-session screen. Prices stay below pack prices × 8 so packs stay the main sink. Powerups are found in play only and never sold, which keeps the game rewarding without being easy.

### HUD
- Top-left: **Haul: 123,456 lbs** with a roll-up and bounce. The digits glow at milestones (10k, 100k, 1M).
- Top-right: **End** (outlined, asks to confirm).
- Top-center: cards answered, 🔥 streak, due remaining, lure rank pips (1–5), and any held powerup icon.
- A catch log strip shows the last 5 catches.

## 10. End and payout
End → confirm sheet ("Pack up? 14 catches, 86,240 lbs") → `POST /sessions/:id/end` → the payout screen: the fisher holds the biggest catch, the haul total, the catches by rarity, the critters that were caught (new ones are stamped **NEW**), tokens earned (count-up, coin sfx) and a "Open pack" CTA. The critters are added to the collection when the session ends (a duplicate only bumps the count). The client works offline. The outbox syncs and the server stays the source of truth for tokens.

## 11. Rendering approach (lean MVP)
**Build it with plain React Native Views/Images and react-native-reanimated 4** (already installed). No Skia for v1.
- Layers are absolutely positioned `<Image>`s: background PNG (sky, lake, dock) → fish-shadow sprite → bobber + line → critter-with-rod sprite → RN overlay (HUD, question note, tags, reveal card).
- Water motion is two semi-transparent wave strips translating on loops, plus a bobbing bobber. The line is a rotated thin View, or a 2-point SVG via `react-native-svg` if it's already available. Splashes and ripples are scale/opacity tweens on a ring sprite.
- HOOKED!, the reveal spring, shakes and the counter roll-up are all Reanimated `withSpring`/`withSequence`.
- Frenzy is a rainbow-tinted background PNG crossfaded in, plus a `playbackRate` bump on the music.
- The state machine is a pure TS reducer (`machine.ts`), so it's testable.
- **Later polish (not MVP):** a Skia water shader, a bezier line, particles and caustics.
- Target 1–2 coding-agent runs: run 1 builds the core logic, the scene and the loop; run 2 adds the shop baits, powerups, critter catches, sound and payout polish.

## 12. Sound and haptics
- **Audio:** `expo-audio`. Short SFX are preloaded: cast whoosh, plop, nibble blip, bite splash, reel ratchet (loop), line snap twang, correct ding, wrong thunk, reveal fanfare (3 tiers), coin roll, and an ambient lake loop (water lap and birds, low volume). Mute toggle, ducked when other audio is playing.
- **Haptics:** `expo-haptics`. Cast is Light, bite is Heavy, correct is Success notification, wrong is Error notification, reel is rhythmic Light every 120ms, and Legendary is Heavy×3. All can be turned off in settings.

## 13. Art plan
Simple 2D sprites, **AI-generated in one batch** from the prompts in §13a. Transparent PNGs go in `apps/mobile/assets/fishing/` (the scene, the junk, the lures, the specials and the UI), named by asset id. The critters reuse the art of the pack system (`apps/mobile/assets/critters/`). Until an image exists, the art resolver of the app (`apps/mobile/src/content/art.ts`) falls back to the placeholder of the type of the entry (a critter, a junk item, a special or a fish), so it never blocks.
Sizes: catches and lures 512×512, background 1080×1920 (portrait), UI pieces as noted. Shared style suffix for every prompt:
> *"…, cute chunky cartoon game sprite, thick dark outline, flat bright colours, soft cel shading, centered, single object, transparent background, no text, mobile game asset, Blooket-like style"*

### 13a. Art list (one prompt each; append the style suffix)
**Scene**
- `bg_lake_day`: "portrait mobile game background, calm cartoon lake under a bright blue sky with puffy clouds, distant green hills and pine trees, a wooden dock jutting in from the bottom-left, empty water in the middle" (1080×1920, opaque, no transparency)
- `bg_lake_frenzy`: same scene as bg_lake_day but with a rainbow gradient sky and shimmering rainbow water, sparkles (1080×1920, opaque)
- `wave_strip`: "seamless horizontal strip of light cartoon water wave crests, white and pale blue" (2048×128)
- `fisher_rod`: "round blue blob critter mascot sitting and holding a fishing rod, cheerful" (512)
- `bobber`: "red and white fishing bobber" (128)
- `ripple_ring`: "white cartoon water ripple ring, top-down ellipse" (256)
- `splash`: "cartoon water splash burst" (256)
- `fish_shadow`: "dark blue-black fish silhouette seen from above underwater, soft edges" (512)
**Junk (Trash)**
- `junk_old_sneaker`: "soggy old sneaker dripping water"
- `junk_soggy_waffle`: "soggy waffle dripping water"
- `junk_lost_homework`: "crumpled wet homework paper with a red F"
- `junk_two_of_clubs`: "single wet playing card, two of clubs"
- `junk_rubber_duck`: "yellow rubber duck"
- `junk_tangled_earbuds`: "tangled white earbuds"
- `junk_half_pencil`: "broken half of a yellow pencil"
- `junk_tin_can`: "rusty dented tin can with no label"
- `junk_hall_pass`: "faded laminated school hall pass on a lanyard"
- `junk_pumpkin_carving`: "carved pumpkin with a triangle smile (Halloween)"
- `junk_snowy_mittens`: "pair of knitted mittens covered in snow (winter)"
**Lures and baits**
- `lure_r1_worm`: "pink wriggly worm on a hook"
- `lure_r2_spinner`: "shiny silver spinner fishing lure"
- `lure_r3_jig`: "glowing green jig fishing lure"
- `lure_r4_golden_fly`: "golden fly-fishing lure with feathers, sparkles"
- `lure_r5_legend`: "rainbow crystal legendary fishing lure, radiant glow"
- `bait_critter_chum`: "small bucket of colourful fish food with a critter face sticker"
**Specials and powerups**
- `special_new_lure`: "treasure box bursting open with a glowing fishing lure"
- `special_frenzy`: "rainbow swirl of water with sparkles and a lightning bolt"
- `pu_double_hook`: "double fishing hook glowing blue"
- `pu_lucky_charm`: "four-leaf clover charm"
- `pu_second_chance`: "fishing line knotted with a glowing heart"
- `pu_heavy_sinker`: "heavy iron fishing weight with a ×3 shine"
- `special_pack_ticket`: "golden ticket with a card pack symbol"
**UI**
- `ui_hooked_banner`: "bold tilted comic burst banner shape, yellow with red outline, empty middle for text" (1024×512)
- `ui_parchment_note`: "unrolled parchment paper note, empty" (1024×640)
- `ui_tag_wood`: "rectangular wooden hanging tag with a rope hole, empty" (512×192)
- `ui_reveal_rays`: "radial light rays burst, white, for tinting" (1024)
- `ui_tier_ribbon`: "blank ribbon banner, white, for tinting" (512×128)
- `ui_coin`: "gold token coin with a brain symbol" (256)
**Critters**
Critter catches reuse the existing critter art from the pack system
(`apps/mobile/assets/critters/`). There is **no fish art**: the mode catches
critters, junk and specials.

## 14. Out of scope (MVP)
Multiplayer, real distractions against other players, timers, an aquarium display, and quests.

## 15. Acceptance checklist
- [ ] The scene is always visible and runs smoothly on a mid-range Android phone. It works with the placeholder fallback art.
- [ ] The question shows as an in-scene note. There is never a full-screen quiz card.
- [ ] The full loop works: cast → wait → HOOKED! → answer → reel + reveal, or got away → cast again.
- [ ] The haul counter rolls up, and the End confirmation leads to the server payout screen.
- [ ] The HOOKED! banner, GOT_AWAY and the in-session lure ranks 1–5 work. Frenzy lasts 5 catches. Powerups, critter catches and the Pack Ticket caps all work.
- [ ] A critter catch is added to the collection when the session ends; a duplicate only bumps the count.
- [ ] Only the critters of the packs that are on sale swim up.
- [ ] Bonus cards roll at rank 1 at most and never roll the critter special or a ticket.
- [ ] Sound, haptics and Reduce Motion all have toggles.
- [ ] Unit tests cover the reducer, the tier odds per rank, the weight roll, the specials and their caps (seeded RNG).

---

## Coding-agent prompt

> You are implementing the Fishing ("Fish Frenzy") game mode in the `WxboySuper/study-app` monorepo (pnpm workspaces; Expo SDK 58 app in `apps/mobile`, expo-router; shared logic in `packages/core`; React Native 0.88, react-native-reanimated 4.7 + react-native-worklets already installed). Read `docs/SPEC.md` and `docs/design/fishing.md` first. The design doc is the source of truth for look and feel.
>
> Build:
> 1. `packages/core/src/fishing/`: `catches.ts` (the tiers from §6 and the catch list from §7: the junk of the bottom tier, the critters of the packs that are on sale in the other tiers and the specials), `roll.ts` (the per-lure-rank tier odds table, weight roll, the special table from §8 with Frenzy (5 catches, rank +2, ×2 weight), powerups, critter catches, Pack Ticket caps of 1/session and 1/day, the bonus-card rule (rank 1 at most, no critter special/tickets) and in-session lure guarantees at 5/12/22/35 correct; inject a seeded RNG), `machine.ts` (pure reducer for states IDLE, CASTING, WAITING, HOOKED, QUESTION, REELING, REVEAL, GOT_AWAY, END_CONFIRM with typed events; the catch is rolled on HOOKED and the next FSRS card is pulled then), `lures.ts` (shop items from §9). The content (the critters, the packs, the junk and the specials) lives in the registries of `packages/core/src/content/`: the logic only reads them. Export them from the package index. Write vitest tests for all of it, with ≥90% coverage on this folder. Do not change the existing payout or scheduler semantics. Tokens still come from `payout.ts`. Critter catches and Pack Tickets go into the session result and are validated by the API at End.
> 2. Add `expo-haptics` and `expo-audio` with `npx expo install`. **Do not add Skia.** Animate with react-native-reanimated (§11).
> 3. `apps/mobile/src/modes/fishing/`: `FishingScreen.tsx` (wires the machine to the existing FSRS queue from `@study-app/core`), `LakeScene.tsx` (layered Images: background, wave strips, shadow, bobber, line, fisher; Reanimated loops), `HookedBanner.tsx`, `QuestionNote.tsx` (an in-scene parchment note with 4 wooden-tag answers, at least 56dp each), `RevealCard.tsx`, `Hud.tsx` (haul lbs roll-up, streak, due count, lure pips, End with confirm), `PayoutScreen.tsx` (tokens, haul, catches by tier, critters, tickets; **Play again** with the same mode and set in one tap, and Home), `sfx.ts`, `haptics.ts`, and Reduce Motion support. Add a `app/fishing.tsx` route and a one-tap start from Home: mode → set/topic/All → Go.
> 4. Assets: the art resolver of the app (`apps/mobile/src/content/art.ts`) maps the art key of every entry to its PNG and falls back to the placeholder of its type, so the game runs with no art. Sound: CC0 SFX only (Kenney audio packs or Freesound CC0), credited in `assets/CREDITS.md`. Stay lean: if you're short on time, ship the core loop first (§3–6, 10) and leave the specials from §8–9 for run 2.
> 5. No timers anywhere in the mode. HOOKED! shows a big banner and a tap to Reel (with an auto-advance setting). A wrong answer means GOT_AWAY: the line snaps, the catch is lost, and the correct answer shows for 1.5s. The SRS grade is derived exactly as SPEC describes. Bite wait is 0.8–2.5s.
>
> Constraints: TypeScript strict, no `any`. `pnpm -r typecheck`, `pnpm -r lint` and `pnpm -r test` must pass. Don't touch `.github/workflows/android-release.yml`. Keep each animation on the UI thread (Reanimated shared values), with no setState per frame. Commit in small logical commits with conventional-commit messages. When finished, summarise what was built, what's placeholder, and any acceptance-checklist items (§15) not met.
