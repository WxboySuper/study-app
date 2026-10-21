# Fishing mode ("Fish Frenzy") — game-feel design

Status: design, pre-build. Owner: Alex. Supersedes the AI Studio "Cast" prototype, which is **not** a UX reference.

## 1. Goal
Look and play like Blooket's Fishing Frenzy, solo and untimed: an animated lake you fish in, where every catch is gated by answering one card. The card lives *inside* the scene (a speech bubble / note pinned to the line) — never a full-screen quiz card with a fishing label. The session ends only when you tap **End**, which triggers the server payout.

Design pillars:
1. **The scene is the screen.** Water, dock, sky, and fisher fill the screen at all times. UI is chrome around the scene.
2. **Every answer has a physical consequence.** Correct → the fish is reeled in. Wrong → the line snaps and the fish swims off.
3. **Number goes up.** The haul counter (lbs) ticks up visibly on each catch. Big catches get extra juice.
4. **Studying is the only throttle.** No timers. The pace is your own. Rewards follow the SPEC economy (≈1.5 tokens/correct, full rate only for due/new cards).

## 2. Core loop (state machine)
```
IDLE ──tap/hold Cast──▶ CASTING ──bobber lands──▶ WAITING ──bite (0.8–2.5s)──▶ BITE
BITE ──auto (300ms)──▶ QUESTION (answer gate, scene dimmed 30%, fish tugging)
QUESTION ──correct──▶ REELING ──▶ REVEAL ──tap Keep──▶ IDLE (haul += weight)
QUESTION ──wrong────▶ SNAP (line breaks, correct answer shown 1.5s) ──▶ IDLE
any state ──End──▶ END_CONFIRM ──▶ PAYOUT screen
```
- **IDLE:** fisher on the dock, rod raised, gentle idle bob. Big "Cast" button bottom-center. Optional *hold-to-power* cast: a power arc fills while held and sets how far the bobber lands. Purely cosmetic (distance does not affect rarity) so there is no skill gate on studying.
- **CASTING (≈600ms):** rod swing, line arcs along a bezier, bobber splashes, ripple rings, *plop* sfx.
- **WAITING:** the bobber bobs. Fish shadows drift under the surface. A small nibble twitch adds suspense. The wait is short and randomised. Never more than 2.5s, because waiting isn't studying.
- **BITE:** bobber yanks under, "!" pops above it, splash, heavy haptic. Then the question appears automatically.
- **QUESTION (the answer gate):** see §3.
- **REELING (≈900ms):** the reel spins, the line tightens and the fish silhouette is dragged toward the dock, with a water spray at the surface. Bigger fish shake more.
- **REVEAL:** the fish leaps out and lands on a reveal card (§4).
- **SNAP:** the line goes slack with a *twang*, the fish shadow darts away and the bubble flips to show the right answer, highlighted. There's no penalty beyond the lost catch, and the SRS grade is Again.

## 3. In-scene question overlay
- A **parchment note** unrolls from the taut line above the water, roughly the top 40% of the screen. The scene stays visible and animated behind it, dimmed 30%. The fish keeps tugging the bobber.
- The prompt text is large (min 20sp, auto-shrinks to 16sp for long text, and scrolls if longer).
- The answers are **4 wooden "lure tags"** hanging from a rope along the bottom third. Each is 56dp+ tall and full-width in a 2×2 grid. Distractors come from the same set, as the SPEC says.
- Tap feedback: the tag presses in, then turns green with a check or red with a shake.
- Typed and reveal-style answers (later): the note shows "Tap to flip", then self-grade with ✓/✗ tags. Same gate.
- Grade mapping follows the SPEC. There's no visible timer. Response time is measured silently for Hard/Good/Easy.

## 4. Fish reveal card
- The card springs in (scale 0.6→1.05→1, 350ms) over a rarity-coloured burst: radial rays plus a particle ring.
- It shows the fish art (big), name, **rarity ribbon** (Common grey, Uncommon green, Rare blue, Epic purple, Legendary gold, Chroma rainbow shimmer), **weight in lbs** (counts up from 0 over 500ms), and a "NEW!" stamp the first time you catch that species.
- Buttons: **Keep** (default; tapping anywhere also works). There are no catch-and-release decisions in the MVP.
- Legendary and Chroma catches get a full-screen flash, a slow-mo leap, a bigger haptic pattern and a fanfare.

## 5. HUD
- Top-left: **Haul: 123.4 lbs**. Rolls up with a bounce on each catch, and the digits glow when a catch crosses a milestone (100, 250, 500 lbs…).
- Top-right: **End** button (outlined, so it's never tapped by accident; asks to confirm).
- Top-center: small pills with cards answered, the current streak 🔥, and the remaining due count.
- Bottom: the Cast button in IDLE, and the lure-tag answers in QUESTION.
- A collapsible **catch log** strip: the last 5 fish as tiny icons.

## 6. Weight, rarity and streaks
- Rarity roll per catch (base): Common 55 / Uncommon 25 / Rare 12 / Epic 6 / Legendary 1.8 / Chroma 0.2 %.
- The streak raises rarity odds a little (+1% Rare+ per 3-streak, capped at +6%). A wrong answer resets the streak.
- Weight is `species.baseLbs × rand(0.7–1.4)`, multiplied by the lure multiplier.
- **Haul is cosmetic score, and tokens come from the SPEC payout formula.** Haul feeds personal bests and achievements only, so lbs can't be used to farm tokens.
- Bonus or repeat cards (not due, not new) still catch fish but use the Common/Uncommon table only. This mirrors the reduced token rate.

## 7. Lures and upgrades
Bought with tokens in the shop and kept between sessions. Prices stay modest and never rival packs.
| Item | Effect | Price |
|---|---|---|
| Basic Worm | default | free |
| Shiny Spinner | +10% weight | 30 |
| Glow Jig | +3% Rare+ odds | 60 |
| Golden Fly | +25% weight, gold line trail | 120 |
| Rods (Bamboo → Carbon → Legendary Reel) | cosmetic swing/trail, reel-sound variants | 40 / 90 / 200 |
| Dock skins (Dawn, Night, Halloween Swamp) | scene palette swaps | 50 each, seasonal |
One lure is equipped at a time, chosen on a pre-session screen. No consumables in the MVP.

## 8. End and payout
End → confirm sheet ("Pack up? 14 fish, 86.2 lbs") → `POST /sessions/:id/end` → the payout screen: the fisher holds the biggest catch, the haul total, the fish caught by rarity, tokens earned (count-up, coin sfx) and a "Open pack" CTA. The client works offline. The outbox syncs and the server stays the source of truth for tokens.

## 9. Rendering approach (React Native)
Recommendation: **@shopify/react-native-skia** for the scene canvas, driven by **react-native-reanimated 4** shared values (already a dependency, with react-native-worklets). Regular RN views sit on top for the HUD, question note and answer tags, for accessibility and text layout.
- Why Skia: water needs shader effects. A RuntimeEffect handles the wave displacement and caustics, Paths draw the bezier fishing line, and particles (splash, sparkles, rarity rays) and sprite atlases all run on the UI thread at 60fps. Pure Reanimated plus Views can't do convincing water or a line cheaply.
- Not a game engine (no Phaser/WebView or react-native-game-engine). The scene is a few layers plus a state machine, and a WebView would hurt startup, haptics and offline use.
- Layers, back to front: sky gradient → far shore parallax → water (shader + wave bands) → fish shadows (sprites under a water mask) → bobber/line/ripples → dock + fisher (sprite sheet) → particles → RN overlay.
- A pure TS reducer (`fishingMachine.ts`) drives the state machine, which keeps it testable. Animations listen to the state and call `runOnJS` back on completion.
- Performance budget: one Skia Canvas, fewer than 200 draw ops, textures in a single atlas of 2048² or smaller, and Reduce Motion support (shaders off, crossfades instead).

## 10. Sound and haptics
- **Audio:** `expo-audio`. Short SFX are preloaded: cast whoosh, plop, nibble blip, bite splash, reel ratchet (loop), line snap twang, correct ding, wrong thunk, reveal fanfare (3 tiers), coin roll, and an ambient lake loop (water lap and birds, low volume). Mute toggle, ducked when other audio is playing.
- **Haptics:** `expo-haptics`. Cast is Light, bite is Heavy, correct is Success notification, wrong is Error notification, reel is rhythmic Light every 120ms, and Legendary is Heavy×3. All can be turned off in settings.

## 11. Art plan
Phase 1 uses placeholder art, all **CC0**, credited in `assets/CREDITS.md` even though CC0 doesn't require it:
- **Kenney.nl** (CC0): "Fish Pack" (fish sprites), "Pixel Platformer"/"Nature Kit" (dock, trees), and UI packs for the tags, ribbons and buttons.
- **OpenGameArt.org**, filtered to CC0 only, for water tiles, splash and particle sprites.
- **Freesound.org**, filtered to CC0 only, plus **Kenney audio packs** (CC0) for the SFX.
- The fisher is a simple Kenney character recoloured. Rarity tints use a shader colour matrix, so one sprite can make a Chroma variant.
Phase 2 is custom art: commissioned or generated critter-style fish in one consistent chunky, outlined style matching the Brain Buddies critters, delivered as 512² PNGs in an atlas. Seasonal skins come later.

## 12. Fish list (MVP, 18 species)
| Fish | Rarity | Base lbs |
|---|---|---|
| Minnow Memo | Common | 0.3 |
| Flashcard Flounder | Common | 1.2 |
| Bluegill Bookmark | Common | 0.8 |
| Perch of Recall | Common | 1.0 |
| Sticky-Note Sunfish | Common | 0.6 |
| Cram Carp | Uncommon | 6 |
| Quizzical Catfish | Uncommon | 9 |
| Highlighter Trout | Uncommon | 4 |
| Margin-Note Mackerel | Uncommon | 3 |
| Synapse Salmon | Rare | 12 |
| Mnemonic Pike | Rare | 15 |
| Footnote Swordfish | Rare | 40 |
| Thesis Tuna | Epic | 120 |
| Lantern of Lore (anglerfish) | Epic | 25 |
| Scholar Sturgeon | Epic | 90 |
| The Spaced Leviathan | Legendary | 600 |
| Golden Grade Koi | Legendary | 18 |
| Chroma: any species (rainbow variant) | Chroma | ×2 base |
Seasonal: **Pumpkin Pufferfish** and **Ghostly Gar**, Halloween only (Epic). Species data lives in `packages/core/src/fishing/fish.ts`.

## 13. Out of scope (MVP)
Multiplayer, timers, fish selling, aquarium display, quests, and catch-and-release choices.

## 14. Acceptance checklist
- [ ] The scene is always visible and animates at 60fps on a mid-range Android phone (Pixel 6a class).
- [ ] The question shows as an in-scene note. There is never a full-screen quiz card.
- [ ] The full loop works: cast → wait → bite → answer → reel/snap → reveal → idle.
- [ ] The haul counter rolls up, and the End confirmation leads to the server payout screen.
- [ ] Lure effects are applied, and bonus cards are limited to Common/Uncommon.
- [ ] Sound, haptics and Reduce Motion all have toggles.
- [ ] Unit tests cover the reducer, rarity roll, weight roll and streak modifiers (seeded RNG).

---

## Coding-agent prompt

> You are implementing the Fishing ("Fish Frenzy") game mode in the `WxboySuper/study-app` monorepo (pnpm workspaces; Expo SDK 58 app in `apps/mobile`, expo-router; shared logic in `packages/core`; React Native 0.88, react-native-reanimated 4.7 + react-native-worklets already installed). Read `docs/SPEC.md` and `docs/design/fishing.md` first. The design doc is the source of truth for look and feel.
>
> Build:
> 1. `packages/core/src/fishing/`: `fish.ts` (the species table from §12, with seasonal flags), `roll.ts` (rarity roll with streak and lure modifiers, weight roll, bonus-card Common/Uncommon restriction; inject a seeded RNG), `machine.ts` (pure reducer for states IDLE, CASTING, WAITING, BITE, QUESTION, REELING, REVEAL, SNAP, END_CONFIRM with typed events), `lures.ts` (§7). Export them from the package index. Write vitest tests for all of it, with ≥90% coverage on this folder. Do not change the existing payout or scheduler semantics. Tokens still come from `payout.ts`.
> 2. Add `@shopify/react-native-skia`, `expo-haptics` and `expo-audio` to `apps/mobile` using `npx expo install`.
> 3. `apps/mobile/src/modes/fishing/`: `FishingScreen.tsx` (wires the machine to the existing card queue/scheduler from `@study-app/core`), `LakeScene.tsx` (a single Skia Canvas: sky gradient, parallax shore, water RuntimeEffect shader with waves, fish shadow sprites, bezier line + bobber + ripples, dock + fisher, particles), `QuestionNote.tsx` (an in-scene parchment note plus 4 lure-tag answer buttons, as RN Views over the canvas, accessible, at least 56dp touch targets), `RevealCard.tsx`, `Hud.tsx` (haul lbs roll-up, streak, due count, End button with a confirm sheet), `PayoutScreen.tsx`, `sfx.ts` and `haptics.ts` (§10, with settings toggles), and Reduce Motion support. Add an expo-router route `app/fishing.tsx` and a "Fish" entry on the home screen.
> 4. Assets: use only CC0 placeholders (Kenney.nl Fish Pack / Nature Kit / UI and audio packs, OpenGameArt or Freesound items explicitly marked CC0). If you can't download them, generate simple vector placeholders in Skia (coloured fish shapes tinted by rarity) and leave TODOs. Record every asset's source and licence in `apps/mobile/assets/CREDITS.md`.
> 5. No timers anywhere in the mode. A wrong answer snaps the line and shows the correct answer for 1.5s. The SRS grade is derived exactly as SPEC describes. Bite wait is 0.8–2.5s.
>
> Constraints: TypeScript strict, no `any`. `pnpm -r typecheck`, `pnpm -r lint` and `pnpm -r test` must pass. Don't touch `.github/workflows/android-release.yml`. Keep each animation on the UI thread (Reanimated shared values and Skia), with no setState per frame. Commit in small logical commits with conventional-commit messages. When finished, summarise what was built, what's placeholder, and any acceptance-checklist items (§14) not met.
