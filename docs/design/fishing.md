# Fishing mode ("Fish Frenzy") — game-feel design

Status: design, pre-build. Owner: Alex. Supersedes the AI Studio "Cast" prototype, which is **not** a UX reference.

## 1. Goal
Look and play like Blooket's Fishing Frenzy, solo and untimed: an animated lake you fish in, where every catch is gated by answering one card. The card lives *inside* the scene (a speech bubble / note pinned to the line) — never a full-screen quiz card with a fishing label. The session ends only when you tap **End**, which triggers the server payout.

Design pillars:
1. **The scene is the screen.** Water, dock, sky, and fisher fill the screen at all times. UI is chrome around the scene.
2. **Every answer has a physical consequence.** Correct → the fish is reeled in. Wrong → the line snaps and the fish swims off.
3. **Number goes up.** The haul counter (lbs) ticks up visibly on each catch. Big catches get extra juice.
4. **Studying is the only throttle.** No timers. The pace is your own. Rewards follow the SPEC economy (≈1.5 tokens/correct, full rate only for due/new cards).

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
- **IDLE:** your equipped critter sits on the dock with a rod and idle animation. Big **Cast** button. Hold-to-power cast distance is cosmetic only.
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
- It shows the art, name, **rarity ribbon** using Blooket-style tier names (below), **weight** counting up, and a **NEW!** stamp the first time you catch something. Silly catches get a one-line joke caption ("Smells like detention").
- Catch of the Day and Angler's Legend get a full-screen flash, a slow-mo leap, a fanfare and a triple haptic.

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

## 7. Catch list
Original names (no Blooket IP), with silly ones encouraged. Each line shows tier and lbs.
- **Trash (junk):** Old Sneaker, Soggy Waffle, Lost Homework (soaked), Two of Clubs, Rubber Duck, Tangled Earbuds, Half a Pencil, Mystery Tin Can, Expired Hall Pass. 1–10 lbs each.
- **Easy One:** Minnow Memo 10–25, Flashcard Flounder 15–40, Bluegill Bookmark 20–45, Goldfish Cracker (the fish) 30–65, Lilypad Frog 50–100.
- **Great Catch:** Highlighter Trout 100–150, Wet Cat (deeply unhappy) 100–200, Sticky-Note Sunfish 150–350, Cram Carp 250–750.
- **Rare Find:** Quizzical Catfish 500–1k, Seal of Approval 700–2.2k, Margin-Note Crab 1k–2.5k, Pop-Quiz Pufferfish 2k–4k, Blobfish of Burnout 3k–5k.
- **Epic Grab:** Lantern of Lore (anglerfish) 7k–10k, Octo-Tutor 10k–15k, Thesis Tuna 12k–20k, Donut Blobfish 13k–25k.
- **Catch of the Day:** Synapse Narwhal 25k–50k, Scholar Sturgeon 50k–100k, Mega-Lodon of Midterms 250k–500k.
- **Angler's Legend:** The Spaced Leviathan 500k–700k, Golden Grade Koi 750k–1M, Teacher's UFO 1M–2M, and a seasonal slot (Pumpkin Kraken for Halloween, Frost Whale for Winter) at 1M–2M.
- **Critter catches:** any **Brain Buddies critter** from the SPEC (Mnemo the Memory Jelly, The Spaced Ranger, Gigabrain Golem…) can show up as a catch at its own rarity's tier. See §8.
Data lives in `packages/core/src/fishing/catches.ts` with `{id, name, tier, minLbs, maxLbs, joke?, seasonal?, critterId?}`.

## 8. Special catches: powerups, Frenzy, mishaps, critters
The "Special" slice in §6 rolls on this table:
| Special | Share | Effect |
|---|---|---|
| **New Lure!** | 30% (plus guarantees) | lure rank +1 for this session (max 5), with a big reel-up and a lure-glow trail |
| **FRENZY!** | 15% | rainbow sky and water, music tempo up. The **next 5 catches** roll at rank +2 with ×2 weight. Counted in catches, not seconds, so it fits untimed play |
| **Powerup bottle** | 25% | one of: **Double Hook** (next correct lands 2 catches), **Lucky Charm** (next catch rerolls Trash/Easy once), **Second Chance** (next wrong answer lets the fish stay on, so you can retry the same card once; the SRS still logs the first miss as Again), **Heavy Sinker** (×3 weight on the next catch) |
| **Mishap** (solo "distraction") | 15% | a harmless 1.5s gag: an octopus ink splat you swipe off, a seagull steals your hat, a duck armada paddles across. Pure fun, no penalty, since solo has no rivals to slow down |
| **Critter catch** | 12% | a Brain Buddies critter swims up. Rarity is rolled with SPEC pack odds. A **new** critter is added to the collection, and a **duplicate** counts as a dupe (sellable, as in the SPEC) |
| **Pack Ticket** | 3% | one free Brain Buddies pack, max 1 per session and 1 per day. It counts against the SPEC economy, so a ticket ≈ 20 tokens of value inside the daily cap |
Critter and ticket catches **only roll on due or new cards** (never bonus review) and are validated server-side at End, as tokens are, so they can't be farmed.

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
End → confirm sheet ("Pack up? 14 catches, 86,240 lbs") → `POST /sessions/:id/end` → the payout screen: the fisher holds the biggest catch, the haul total, the fish caught by rarity, tokens earned (count-up, coin sfx) and a "Open pack" CTA. The client works offline. The outbox syncs and the server stays the source of truth for tokens.

## 11. Rendering approach (React Native)
Recommendation: **@shopify/react-native-skia** for the scene canvas, driven by **react-native-reanimated 4** shared values (already a dependency, with react-native-worklets). Regular RN views sit on top for the HUD, question note and answer tags, for accessibility and text layout.
- Why Skia: water needs shader effects. A RuntimeEffect handles the wave displacement and caustics, Paths draw the bezier fishing line, and particles (splash, sparkles, rarity rays) and sprite atlases all run on the UI thread at 60fps. Pure Reanimated plus Views can't do convincing water or a line cheaply.
- Not a game engine (no Phaser/WebView or react-native-game-engine). The scene is a few layers plus a state machine, and a WebView would hurt startup, haptics and offline use.
- Layers, back to front: sky gradient → far shore parallax → water (shader + wave bands) → fish shadows (sprites under a water mask) → bobber/line/ripples → dock + fisher (sprite sheet) → particles → RN overlay.
- A pure TS reducer (`fishingMachine.ts`) drives the state machine, which keeps it testable. Animations listen to the state and call `runOnJS` back on completion.
- Performance budget: one Skia Canvas, fewer than 200 draw ops, textures in a single atlas of 2048² or smaller, and Reduce Motion support (shaders off, crossfades instead).

## 12. Sound and haptics
- **Audio:** `expo-audio`. Short SFX are preloaded: cast whoosh, plop, nibble blip, bite splash, reel ratchet (loop), line snap twang, correct ding, wrong thunk, reveal fanfare (3 tiers), coin roll, and an ambient lake loop (water lap and birds, low volume). Mute toggle, ducked when other audio is playing.
- **Haptics:** `expo-haptics`. Cast is Light, bite is Heavy, correct is Success notification, wrong is Error notification, reel is rhythmic Light every 120ms, and Legendary is Heavy×3. All can be turned off in settings.

## 13. Art plan
Phase 1 uses placeholder art (junk items, fish and the duck armada can mostly come from Kenney packs), all **CC0**, credited in `assets/CREDITS.md` even though CC0 doesn't require it:
- **Kenney.nl** (CC0): "Fish Pack" (fish sprites), "Pixel Platformer"/"Nature Kit" (dock, trees), and UI packs for the tags, ribbons and buttons.
- **OpenGameArt.org**, filtered to CC0 only, for water tiles, splash and particle sprites.
- **Freesound.org**, filtered to CC0 only, plus **Kenney audio packs** (CC0) for the SFX.
- The fisher is a simple Kenney character recoloured. Rarity tints use a shader colour matrix, so one sprite can make a Chroma variant.
Phase 2 is custom art: commissioned or generated critter-style fish in one consistent chunky, outlined style matching the Brain Buddies critters, delivered as 512² PNGs in an atlas. Seasonal skins come later.

## 14. Out of scope (MVP)
Multiplayer, real distractions against other players, timers, fish selling, an aquarium display, and quests.

## 15. Acceptance checklist
- [ ] The scene is always visible and animates at 60fps on a mid-range Android phone (Pixel 6a class).
- [ ] The question shows as an in-scene note. There is never a full-screen quiz card.
- [ ] The full loop works: cast → wait → HOOKED! → answer → reel + reveal, or got away → cast again.
- [ ] The haul counter rolls up, and the End confirmation leads to the server payout screen.
- [ ] The HOOKED! banner, GOT_AWAY and the in-session lure ranks 1–5 work. Frenzy lasts 5 catches. Powerups, mishaps, critter catches and the Pack Ticket caps all work.
- [ ] Bonus cards roll at rank 1 at most and never roll critters or tickets.
- [ ] Sound, haptics and Reduce Motion all have toggles.
- [ ] Unit tests cover the reducer, the tier odds per rank, the weight roll, the specials and their caps (seeded RNG).

---

## Coding-agent prompt

> You are implementing the Fishing ("Fish Frenzy") game mode in the `WxboySuper/study-app` monorepo (pnpm workspaces; Expo SDK 58 app in `apps/mobile`, expo-router; shared logic in `packages/core`; React Native 0.88, react-native-reanimated 4.7 + react-native-worklets already installed). Read `docs/SPEC.md` and `docs/design/fishing.md` first. The design doc is the source of truth for look and feel.
>
> Build:
> 1. `packages/core/src/fishing/`: `catches.ts` (the tiers from §6 and catch list from §7, including junk, jokes, seasonal flags and critter links to the existing critter data), `roll.ts` (the per-lure-rank tier odds table, weight roll, the special table from §8 with Frenzy (5 catches, rank +2, ×2 weight), powerups, mishaps, critter catches, Pack Ticket caps of 1/session and 1/day, the bonus-card rule (rank 1 at most, no critters/tickets) and in-session lure guarantees at 5/12/22/35 correct; inject a seeded RNG), `machine.ts` (pure reducer for states IDLE, CASTING, WAITING, HOOKED, QUESTION, REELING, REVEAL, GOT_AWAY, END_CONFIRM with typed events; the catch is rolled on HOOKED and the next FSRS card is pulled then), `lures.ts` (shop items from §9). Export them from the package index. Write vitest tests for all of it, with ≥90% coverage on this folder. Do not change the existing payout or scheduler semantics. Tokens still come from `payout.ts`. Critter catches and Pack Tickets go into the session result and are validated by the API at End.
> 2. Add `@shopify/react-native-skia`, `expo-haptics` and `expo-audio` to `apps/mobile` using `npx expo install`.
> 3. `apps/mobile/src/modes/fishing/`: `FishingScreen.tsx` (wires the machine to the existing card queue/scheduler from `@study-app/core`), `LakeScene.tsx` (a single Skia Canvas: sky gradient, parallax shore, water RuntimeEffect shader with waves, fish shadow sprites, bezier line + bobber + ripples, dock + fisher, particles), `QuestionNote.tsx` (an in-scene parchment note plus 4 lure-tag answer buttons, as RN Views over the canvas, accessible, at least 56dp touch targets), `HookedBanner.tsx`, `RevealCard.tsx`, `FrenzyFx` (rainbow shader palette and music rate), `MishapFx` (ink splat, seagull, duck armada), `Hud.tsx` (haul lbs roll-up, streak, due count, End button with a confirm sheet), `PayoutScreen.tsx`, `sfx.ts` and `haptics.ts` (§10, with settings toggles), and Reduce Motion support. Add an expo-router route `app/fishing.tsx` and a "Fish" entry on the home screen.
> 4. Assets: use only CC0 placeholders (Kenney.nl Fish Pack / Nature Kit / UI and audio packs, OpenGameArt or Freesound items explicitly marked CC0). If you can't download them, generate simple vector placeholders in Skia (coloured fish shapes tinted by rarity) and leave TODOs. Record every asset's source and licence in `apps/mobile/assets/CREDITS.md`.
> 5. No timers anywhere in the mode. HOOKED! shows a big banner and a tap to Reel (with an auto-advance setting). A wrong answer means GOT_AWAY: the line snaps, the catch is lost, and the correct answer shows for 1.5s. The SRS grade is derived exactly as SPEC describes. Bite wait is 0.8–2.5s.
>
> Constraints: TypeScript strict, no `any`. `pnpm -r typecheck`, `pnpm -r lint` and `pnpm -r test` must pass. Don't touch `.github/workflows/android-release.yml`. Keep each animation on the UI thread (Reanimated shared values and Skia), with no setState per frame. Commit in small logical commits with conventional-commit messages. When finished, summarise what was built, what's placeholder, and any acceptance-checklist items (§14) not met.
