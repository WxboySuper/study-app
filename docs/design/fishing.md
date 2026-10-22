# Fishing mode ("Fish Frenzy") — game-feel design

Status: design, pre-build. Owner: Alex. Supersedes the AI Studio "Cast" prototype, which is **not** a UX reference.

> **Update (Oct 2026): the mode catches critters, not fish.** The tiers of the
> ladder are filled with the critters of the packs that are on sale, the
> bottom tier is junk and the "Special" slice is the table of the specials.
> The fish are gone: their registry (`packages/core/src/content/fish.ts`) is
> typed and empty, so the first fish is a data change. See §7 and
> `docs/ADDING-CONTENT.md`.
>
> **Update (Oct 2026): a catch never grants a critter.** The critters of the
> collection come from the **packs** alone. A critter that swims up in the
> lake is a catch: it counts for the haul, it is shown on the reveal card and
> on the payout screen, and that is all it does. The session end never
> touches the collection. See §7, §10 and §15.

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
- **Our twist:** the catches are **critters**, not fish. Every tier of the ladder holds the critters of the packs that are on sale. They are catches, **not** collectibles: only the packs fill the collection.
- **Session flow** (see SPEC "Session flow"): Home → Fishing → set/topic/All → **Go** lands you on the dock, ready to cast. **End** → payout summary (tokens, haul lbs, catches by tier, biggest catch, the critters that were caught, pack tickets) → **Play again** (one tap, same set) or **Home**. Lure rank and Frenzy reset each session.

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
IDLE ─tap Cast─▶ CASTING ─bobber lands (0.6s)─▶ WAITING ─bite (0.7s)─▶ HOOKED!
HOOKED! ─tap Reel─▶ QUESTION  (next FSRS card, overlaid in-scene)
QUESTION ─answer─▶ ANSWERED
ANSWERED (correct) ─tap─▶ REELING ─the catch comes out of the water─▶ REVEAL ─tap to claim─▶ IDLE
ANSWERED (wrong) ─wait 3s, then tap─▶ GOT_AWAY ("Fish Lost!", 0.9s)─▶ IDLE
any ─End─▶ END_CONFIRM ─▶ PAYOUT
```
- **Card selection:** each HOOKED! pulls the next card from the **session queue** of `@study-app/core` (`sessionQueue.ts`). The queue is pure: it decides *what* is asked and *in which order*, and it knows two modes. **Endless** (the default) never ends by itself: the questions are picked with a weight (the due ones first, then the ones with a weak memory, then the others) and the same question is never asked twice in a row. **Mastery** lasts until every question of the scope is mastered (three right answers in a row, a miss starts over) and ends with the "MASTERED!" celebration. The scope is the one the player picked on the home screen: **all**, a **class** (a pile of decks), a **topic** or a **deck**. The catch is rolled when the fish is hooked, before you answer. The silhouette size and the shimmer of the shadow hint at what's on the line (a big shadow, a rarity-coloured glow), so a wrong answer on a hinted Megalodon *hurts*. That's the Blooket tension, without a timer. Every answer is still written to FSRS (the reviews of the session), so the scheduler knows the cards for the next time.
- **IDLE:** your equipped critter sits on the dock with a rod and idle animation. Big **Cast** button. One tap casts; there is no second cast tap.
- **CASTING (~600ms):** rod swing, a bezier line arc, splash and ripples, *plop*.
- **WAITING (~700ms):** the bobber bobs and twitches on a nibble. The bite lands about **1.3 seconds after the cast tap**, so the game never keeps the player waiting.
- **HOOKED!:** the bobber yanks under and a giant tilted **"HOOKED!"** sign slams in with a screen shake and a heavy haptic. The sign says **TAP TO REEL** and waits for the player: it never advances by itself.
- **QUESTION:** the in-scene answer gate (§4). The line stays taut and the fish thrashes.
- **ANSWERED:** the feedback stays on the screen and waits for a tap. A **correct** answer shows a green banner, keeps the picked tile green with ✓ and greys the other tiles with ✗ (with confetti). A **wrong** answer shows a red banner, keeps the right answer green and counts a **3 second lockout** down ("WAIT 3 SECONDS") before a tap is accepted.
- **REELING (the lead-up, 2.5s):** the bobber dips and jerks on the water with ripples and small splashes, the fish pulls on the line and the catch comes out of the water with a big splash. A junk catch gets the short version (1s).
- **REVEAL:** the scene dims, the catch flies out of the water, and a centred claim card shows the category, the name, the art, the tier badge and the weight with **TAP TO CLAIM**. The haul ticks up on the claim, not before.
- **GOT_AWAY:** a *twang*, the line goes slack, the shadow darts off, and the bubble reads **"Fish Lost!"** for 0.9s with the right answer highlighted. You lose that catch, the streak resets, and the SRS grade is Again. That's the only penalty.

## 4. In-scene question overlay
- A **parchment note** sits above the water, roughly the top 40% of the screen. The scene stays live behind it and the rest of the screen stays clear: the note, the feedback banner and the tiles are one normal column, never overlapping each other or the HUD.
- The prompt is large (19sp min, auto-shrinks to 12sp, scrolls if longer). A prompt with math gets a smaller size again, and the math is drawn with KaTeX.
- Answers are **four chunky tiles in Blooket's colours** — orange, blue, green, red — each with a darker bottom edge and white text. They make a **2×2 grid** when every answer is short. An answer longer than 24 characters switches the board to a **single column**, and the font shrinks so the whole answer wraps instead of being cut off.
- **Math is drawn with KaTeX.** A prompt or an answer that holds LaTeX (`$...$` or `$$...$$`) is typeset, not printed: the tiles show the real fractions, roots and vectors. A dollar sign that is not math is escaped (`\$5`), so a price stays a price.
- A card **without wrong answers** is not a multiple choice question: the note shows the question alone, the player taps **"Show the answer"** and then grades itself (**"Got it"** = Good, **"Missed it"** = Again).
- **Correct feedback:** green banner ("CORRECT! TAP TO REEL"), the picked tile is green with ✓, the other tiles are grey with ✗, confetti fires, and nothing advances until the tap.
- **Wrong feedback:** red banner, the right answer stays green, the picked answer turns red, and the banner counts the **3 second lockout** down. Taps during the lockout are ignored; after it, the next tap shows the "Fish Lost!" bubble and the mode returns to the dock.
- A small **mastery badge** sits above the note: **Unknown** (no scheduling state yet), **Familiar** (learning/relearning, or a review card with stability under 21 days) or **Mastered** (a review card with stability of at least 21 days). It comes from the session/FSRS state of the card that is on the screen.
- There is no visible timer. Response time is tracked silently for Hard/Good/Easy, as in the SPEC.

## 5. Claim card
- The card never comes out of nowhere: the **lead-up** comes first (§3): the bobber dips and jerks, the fish pulls on the line and the catch comes out of the water with a big splash. A critter (or a heavy catch) gets the full 2.5s, a junk catch gets 1s.
- The scene **dims** and the card springs in (scale 0.6→1.05→1) over a burst in the rarity colour.
- It shows the **category** (CRITTER CATCH, JUNK CATCH, HEAVY CATCH or CATCH), the **name**, the **art**, the **tier badge** using Blooket-style tier names and the **weight** in a compact form (`3.3k lbs`, `1.2M lbs`). Silly catches get a one-line joke caption ("Smells like detention"); critters show their vibe.
- The card waits for a **TAP TO CLAIM** (a tap anywhere on the dimmed scene). The haul, the catch log, the critter list and any pack ticket only change at that moment.
- **No "NEW!" stamp:** a catch never grants a critter to the collection, so there is nothing to stamp. The stamp stays on the pack opening, where the critter really is granted.
- Catch of the Day and Angler's Legend get a full-screen flash, a slow-mo leap, a fanfare and a triple haptic. A **heavy catch** (`kind: 'heavy'`, Angler's Legend tier) gets its own deep sea theme: gold accents, extra rays, a bigger splash and a heavier haptic of its own.
- The art of a catch comes from the art resolver of the app (`apps/mobile/src/content/art.ts`): the PNG of the critter (or of the junk item) when it exists, the placeholder of its type when it does not.

## 6. Catch tiers, odds and weights
The seven tiers and their tier-wide weight ranges:
| Tier | Colour | Weight range (lbs) |
|---|---|---|
| Trash | brown | 1–10 |
| Easy One | grey | 10–100 |
| Great Catch | green | 75–750 |
| Rare Find | blue | 500–5,000 |
| Epic Grab | red | 7,000–30,000 |
| Catch of the Day | orange | 25,000–500,000 |
| Angler's Legend | purple | 500,000–2,500,000 |

There is **no separate Heavy Catch tier** any more: a heavy catch is a
`kind: 'heavy'` catch of the **Angler's Legend** tier. It keeps its own deep
sea theme, its own haptic and its **15 token** end-of-session bonus.

### 6a. The wiki table is the source of truth
Source: [Blooket Fandom — Fishing Frenzy](https://blooket.fandom.com/wiki/Fishing_Frenzy), table "Blooks in Fishing Frenzy" (checked **Oct 22, 2026**).

- The wiki lists **37 Blooks** with a rarity, the lures that can catch them,
  their chance at the **first** lure that can catch them, and their minimum
  and maximum weight.
- Our catches are mapped onto the rows **in order** by tier: junk cycles
  through the three Trash rows, critters cycle through the rows of their
  rarity tier, and every heavy catch maps to the named Angler's Legend row
  (`packages/core/src/fishing/wiki.ts`).
- **Every catch keeps the exact weight range of its row.** That is why
  `Swamp Monster` is 1,000,000–2,000,000 lbs and the Treasure Chest takes the
  top row (`Tim the Alien`, 1,500,000–2,500,000 lbs).
- The **tier** of a rank is derived from the wiki as well: the weight of a
  tier is the sum of the chances of its rows, and the tier odds are those
  weights renormalized over the tiers the rank can catch. A per-catch roll
  then uses the wiki chance of the row as its weight inside the tier.
- A tier is only rolled at the lure ranks of its wiki lures: **F/D/C/B/A/S**
  are ranks 1–5 and the **Frenzy (S+)** is rank 6. Trash is rank 1–3, Easy
  2–4, Great/Rare 2–6, Epic 3–6, Catch of the Day 4–6 and Angler's Legend
  5–6.
- The Legend tier is capped at **2%** of a rank's catches. Without the cap
  the wiki Legend rows would take about 5% at the best lure; the cap keeps
  the heavy catches rare and spreads the rest over the other tiers.

| Rank | Trash | Easy | Great | Rare | Epic | CotD | Legend | Special |
|---|---|---|---|---|---|---|---|---|
| 1 (F) | 95 | — | — | — | — | — | — | 5 |
| 2 (D) | 16.43 | 36.15 | 13.15 | 28.27 | — | — | — | 6 |
| 3 (C) | 12.43 | 27.35 | 9.95 | 21.39 | 21.88 | — | — | 7 |
| 4 (B) | — | 27.95 | 10.16 | 21.85 | 22.36 | 10.67 | — | 7 |
| 5 (A/S) | — | — | 14.06 | 30.23 | 30.94 | 14.77 | 2 | 8 |
| 6 (S+, Frenzy) | — | — | 14.06 | 30.23 | 30.94 | 14.77 | 2 | 8 |

The **Special** slice is the table of §8. Bonus/repeat cards roll at rank 1
at best, mirroring the SPEC's lower token rate, so farming an easy deck stays
boring.

### 6b. Catch mapping (our id → wiki row)
The chance is the wiki chance at the row's **first** lure; the lbs are the
wiki minimum and maximum of the row.

| Our id | Name | Wiki Blook | Tier | Weight | Chance |
|---|---|---|---|---|---|
| `old_sneaker` | Old Sneaker | Old Boot | Trash | 1–10 lbs | 15% |
| `soggy_waffle` | Soggy Waffle | Waffle | Trash | 1–10 lbs | 5% |
| `lost_homework` | Lost Homework | Two of Spades | Trash | 1–10 lbs | 5% |
| `two_of_clubs` | Two of Clubs | Old Boot | Trash | 1–10 lbs | 15% |
| `rubber_duck` | Rubber Duck | Waffle | Trash | 1–10 lbs | 5% |
| `tangled_earbuds` | Tangled Earbuds | Two of Spades | Trash | 1–10 lbs | 5% |
| `half_pencil` | Half a Pencil | Old Boot | Trash | 1–10 lbs | 15% |
| `mystery_tin_can` | Mystery Tin Can | Waffle | Trash | 1–10 lbs | 5% |
| `expired_hall_pass` | Expired Hall Pass | Two of Spades | Trash | 1–10 lbs | 5% |
| `pumpkin_carving` | Pumpkin Carving | Old Boot | Trash | 1–10 lbs | 15% |
| `snowy_mittens` | Snowy Mittens | Waffle | Trash | 1–10 lbs | 5% |
| `heavy_galaxy_fish` | Galaxy Fish | Alien | Angler's Legend | 500k–700k lbs | 1.2% |
| `heavy_golden_koi` | Golden Koi | Rainbow Narwhal | Angler's Legend | 750k–1M lbs | 4.25% |
| `heavy_ice_fish` | Ice Fish | UFO | Angler's Legend | 1M–2M lbs | 1% |
| `heavy_skeleton_fish` | Skeleton Fish | Swamp Monster | Angler's Legend | 1M–2M lbs | 0.1% |
| `heavy_swamp_monster` | Swamp Monster | Swamp Monster | Angler's Legend | 1M–2M lbs | 0.1% |
| `heavy_treasure_chest` | Treasure Chest | Tim the Alien | Angler's Legend | 1.5M–2.5M lbs | 0.05% |
| `heavy_void_fish` | Void Fish | UFO | Angler's Legend | 1M–2M lbs | 1% |
| `critter_nibbles_the_notecard` | Nibbles the Notecard | Jellyfish | Easy One | 10–25 lbs | 15% |
| `critter_pip_pencil` | Pip Pencil | Clownfish | Easy One | 20–45 lbs | 15% |
| `critter_doodle_moth` | Doodle Moth | Goldfish | Easy One | 30–65 lbs | 10% |
| `critter_sir_highlighter` | Sir Highlighter | Frog | Easy One | 50–100 lbs | 15% |
| `critter_gummy_eraser` | Gummy Eraser | Blizzard Clownfish | Great Catch | 75–125 lbs | 5% |
| `critter_captain_cram` | Captain Cram | Turtle | Great Catch | 100–150 lbs | 5% |
| `critter_recall_raccoon` | Recall Raccoon | Cat | Great Catch | 100–200 lbs | 5% |
| `critter_synapse_sprite` | Synapse Sprite | Seal | Rare Find | 500–1k lbs | 7% |
| `critter_professor_hoot_n_holler` | Professor Hoot-n-Holler | Walrus | Rare Find | 700–2.2k lbs | 7% |
| `critter_mnemo_the_memory_jelly` | Mnemo the Memory Jelly | Rainbow Jellyfish | Epic Grab | 7k–10k lbs | 8% |
| `critter_the_spaced_ranger` | The Spaced Ranger | Octopus | Epic Grab | 10k–15k lbs | 15% |
| `critter_gigabrain_golem` | Gigabrain Golem | Narwhal | Catch of the Day | 25k–50k lbs | 8% |
| `critter_candy_corn_kid` | Candy Corn Kid | Jellyfish | Easy One | 10–25 lbs | 15% |
| `critter_pumpkin_pupil` | Pumpkin Pupil | Clownfish | Easy One | 20–45 lbs | 15% |
| `critter_bat_ter_up` | Bat-ter Up | Goldfish | Easy One | 30–65 lbs | 10% |
| `critter_ghost_of_finals_past` | Ghost of Finals Past | Lovely Frog | Great Catch | 150–350 lbs | 2% |
| `critter_mummy_wrapped_up` | Mummy Wrapped-Up | Lucky Frog | Great Catch | 150–350 lbs | 2% |
| `critter_count_flashula` | Count Flashula | Crab | Rare Find | 1k–2.5k lbs | 10% |
| `critter_the_witching_hour_owl` | The Witching Hour Owl | Pirate Pufferfish | Epic Grab | 12k–20k lbs | 8% |
| `critter_headless_homework_horseman` | Headless Homework Horseman | Baby Shark | Catch of the Day | 50k–100k lbs | 7% |

The table is checked by `packages/core/test/fishing/catches.test.ts`: every
catch has to sit inside the range of its row and carry its chance, and every
rank-1 pool has to add up to 100%.

- **Lure rank rises within a session.** You *reel up* "New Lure!" as a special catch, guaranteed by 5, 12, 22 and 35 correct answers at the latest, as in Blooket. Rank resets each session. The **base lure** you start at is a persistent shop upgrade (§9), so progress carries over.
- **Haul lbs is the score for bests and achievements. Tokens still come only from the SPEC payout formula** (~1.5/correct). Catches never mint tokens directly, apart from the capped specials in §8 and the heavy-catch bonus in §10.
- **What a tier holds:** the bottom tier holds junk, every other tier holds the **critters of that rarity** of the packs that are on sale (Common → Easy One, Uncommon → Great Catch, Rare → Rare Find, Epic → Epic Grab, Legendary → Catch of the Day). A tier without any catch falls back to the closest tier that has one, so the game never dead ends.
- **Weights are shown compactly** for the big catches: `3.3k lbs`, `1.2M lbs`. The HUD, the catch log, the claim card and the payout screen all use the same formatter.

## 7. Catch list
The mode catches **critters, junk and specials**. There is no fish left in the
catalogue: the fish registry is typed and empty (`packages/core/src/content/fish.ts`).
- **Trash (junk):** Old Sneaker, Soggy Waffle, Lost Homework (soaked), Two of Clubs, Rubber Duck, Tangled Earbuds, Half a Pencil, Mystery Tin Can, Expired Hall Pass, plus the seasonal Pumpkin Carving (Halloween) and Snowy Mittens (Winter). **1–10 lbs each.**
- **Easy One (common critters):** every critter of the packs that are on sale with the rarity *common* — Nibbles the Notecard, Pip Pencil, Doodle Moth, Sir Highlighter (Brain Buddies) and Candy Corn Kid, Pumpkin Pupil, Bat-ter Up (Midterm Monsters, while that pack is on sale). Their row ranges are 10–25, 20–45, 30–65 and 50–100 lbs.
- **Great Catch (uncommon critters):** Gummy Eraser, Captain Cram, Recall Raccoon, Ghost of Finals Past, Mummy Wrapped-Up. Their row ranges run from 75–125 to 150–350 lbs.
- **Rare Find (rare critters):** Synapse Sprite, Professor Hoot-n-Holler, Count Flashula. Their row ranges run from 500–1k to 1k–2.5k lbs.
- **Epic Grab (epic critters):** Mnemo the Memory Jelly, The Spaced Ranger, The Witching Hour Owl. Their row ranges run from 7k–10k to 12k–20k lbs.
- **Catch of the Day (legendary critters):** Gigabrain Golem and Headless Homework Horseman. Their row ranges are 25k–50k and 50k–100k lbs.
- **Angler's Legend (heavy catches):** Galaxy Fish, Golden Koi, Ice Fish, Skeleton Fish, Swamp Monster, Treasure Chest and Void Fish. **500k–2.5M lbs**, mapped to the wiki Legend rows. They live in their own registry (`packages/core/src/content/heavy.ts`), they are **not** the gameplay specials of §8 and every one of them pays 15 tokens at the end of the session.
- **Specials (§8):** New Lure!, FRENZY!, a powerup bottle and a Pack Ticket. They are not catches of the ladder: they change the session or give something.

A critter catch is **a catch, not a collectible**: it counts for the haul, it
is shown on the claim card and on the payout screen, and it is **never added
to the collection**. The critters of the collection come from the packs alone
(`buyAndOpenPack` is the only thing that writes to the collection), so a
session can never fill it and can never farm duplicates to sell. The critters
of a pack that is not on sale never swim up: the pool of a tier is built from
the packs that are available at the time of the session.

Data lives in the content registries (`packages/core/src/content/`): the
critters in `critters.ts`, the junk in `junk.ts`, the heavy catches in
`heavy.ts`, the specials in `specials.ts`. The logic that turns them into
catches lives in `packages/core/src/fishing/catches.ts`, and the wiki table
lives in `packages/core/src/fishing/wiki.ts`.

## 8. Special catches: lures, Frenzy, powerups, critters
The "Special" slice in §6 rolls on this table:
| Special | Share | Effect |
|---|---|---|
| **New Lure!** | 30% (plus guarantees) | lure rank +1 for this session (max 5), with a big reel-up and a lure-glow trail |
| **FRENZY!** | 15% | rainbow sky and water, music tempo up. The **next 5 catches** roll at rank +2 with ×2 weight. Counted in catches, not seconds, so it fits untimed play |
| **Powerup bottle** | 40% | one of: **Double Hook** (next correct lands 2 catches), **Lucky Charm** (next catch rerolls Trash/Easy once), **Second Chance** (next wrong answer lets the catch stay on, so you can retry the same card once; the SRS still logs the first miss as Again), **Heavy Sinker** (×3 weight on the next catch) |
| **Critter catch** | 12% | a bonus critter swims up, whatever the tier roll was. Rarity is rolled with the SPEC pack odds. It is a catch like any other (haul, reveal, payout): it does **not** go into the collection |
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
- Top-center: cards answered, 🔥 streak, due remaining, the art of the current lure with its rank pips (1–5), and the art of any held powerup.
- A catch log strip shows the last 5 catches.
- **Mastery mode:** the bottom bar counts the mastered questions (**"3/12 mastered"**) and every question of the scope gets its own dots (one per right answer it still needs, three of them). A miss empties the dots of that question again. A deck that is too big for the screen shows the questions of the moment and hides the rest behind a counter.

## 10. End and payout
End → confirm sheet ("Pack up? 14 catches, 86,240 lbs") → `POST /sessions/:id/end` → the payout screen: the fisher holds the biggest catch, the haul total, the catches by rarity, the critters that were caught (they are catches: they are listed, never stamped **NEW**), tokens earned (count-up, coin sfx) and a "Open pack" CTA. **The critters are not added to the collection when the session ends: only a pack grants a critter.** The client works offline. The outbox syncs and the server stays the source of truth for tokens.

Every **heavy catch** of the session pays **15 tokens** on top of the payout of the SPEC (a multiple of 5, like every other price of the game). The rule lives in `packages/core/src/payout.ts` (`tokensPerHeavyCatch`); every other payout rule is unchanged.

## 11. Rendering approach (lean MVP)
**Build it with plain React Native Views/Images and react-native-reanimated 4** (already installed). No Skia for v1.
- Layers are absolutely positioned `<Image>`s: background PNG (sky, lake, dock) → fish-shadow sprite → bobber + line → critter-with-rod sprite → RN overlay (HUD, question note, tags, reveal card).
- Water motion is two semi-transparent wave strips translating on loops, plus a bobbing bobber. The line is a rotated thin View, or a 2-point SVG via `react-native-svg` if it's already available. Splashes and ripples are scale/opacity tweens on a ring sprite.
- HOOKED!, the reveal spring, shakes and the counter roll-up are all Reanimated `withSpring`/`withSequence`.
- Frenzy is a rainbow-tinted background PNG crossfaded in, plus a `playbackRate` bump on the music.
- The state machine is a pure TS reducer (`machine.ts`), so it's testable.
- **Later polish (not MVP):** a Skia water shader, a bezier line, particles and caustics.
- Target 1–2 coding-agent runs: run 1 builds the core logic, the scene and the loop; run 2 adds the shop baits, powerups, critter catches, sound and payout polish.

### 11a. The lake scene as it is drawn today (`LakeScene.tsx`)
The scene is **drawn with `react-native-svg`**, not assembled from PNGs, so the boat, the fisher and the rod stay crisp on every screen:
- **Layers, back to front:** sky gradient → sun → far shore and hills → water gradient → glitter of the sun → four wave bands (the parallax) → the big splash of the catch → the boat with the fisher and the rod → the frenzy tint → the shadow of the catch → the ripples → the fishing line → the splash → the bobber → the catch → the overlays (HUD, note, reveal card).
- **The boat floats in the lake:** the hull is drawn in two halves (the part above the water and the part below it, tinted like the water) and it rocks and bobs with the phase of the waves, so the boat never "sits on" the water.
- **The line sags:** it is a quadratic curve from the tip of the rod to the bobber; the sag grows with the length of the line and it goes tight when a fish is hooked. The line is drawn piece by piece (each piece is turned along the curve) so it follows the bobber on the UI thread.
- **The bobber floats on the water** at a distance (on the water line at its own x), it bobs with the waves and it makes rings. During a cast it flies over the water on a parabola, from the tip of the rod to the spot where it lands. **It stays in the water during the lead-up**: it dips under it (and fades a little), it is pulled towards the boat and it never leaves the lake.
- **The rod bends:** the rod is drawn in two halves and the tip turns on its joint while the fish pulls on the line, so the tip of the rod (and the line that hangs from it) follows the pull.
- **The lead-up before the reveal card** (`REELING`): the bobber dips and jerks with ripples and small splashes, the fish pulls on the line (the rod bends, the line goes tight, the bobber comes closer to the boat) and the catch leaps out of the water with a big splash. A wrong answer gets the short version: the line snaps, the rod springs back and the shadow swims off.
- **Reduce Motion:** the waves, the bobbing, the rocking and the flight of the cast stop; the scene stays in one pose.
- **Demo states of the web build:** `/fishing` (idle), `/fishing?demo=cast` (the bobber in the air), `?demo=question`, `?demo=reveal` and `?demo=payout`. The frames of the catch have a demo of their own: `?demo=seq-highlight` (the answer that is held on the screen), `?demo=seq-dip`, `?demo=seq-tug`, `?demo=seq-breach` and `?demo=seq-reveal`. The pass-2 flow has `?demo=ff2-cast`, `?demo=ff2-hooked`, `?demo=ff2-question`, `?demo=ff2-correct`, `?demo=ff2-wrong` and `?demo=ff2-reveal`. `scripts/screenshots.mjs` photographs them (`docs/screenshots/fishing-seq-*.png` and `docs/screenshots/ff2-*.png`, the latter at 390×844).

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
**Heavy catches (the Angler's Legend tier)**
- `catch_heavy_galaxy_fish`: "a cosmic fish with a galaxy inside its body, glowing stars"
- `catch_heavy_golden_koi`: "a big golden koi with shimmering gold scales"
- `catch_heavy_ice_fish`: "a big fish made of clear blue ice, frosted"
- `catch_heavy_skeleton_fish`: "the skeleton of a huge fish, bleached white"
- `catch_heavy_swamp_monster`: "a huge swamp monster with algae and glowing eyes"
- `catch_heavy_treasure_chest`: "a barnacle covered treasure chest, slightly open, gold inside"
- `catch_heavy_void_fish`: "a fish made of dark void, edges dissolving into nothing"
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
- [ ] The full loop works: one-tap cast → ~1.3s → HOOKED! waits for a tap → question → correct feedback waits for a tap → reel + claim card, or wrong answer → 3s lockout → tap → "Fish Lost!" → cast again.
- [ ] A correct answer shows a green banner, the picked tile green with ✓, the other tiles grey with ✗ and confetti, and does not advance until the tap. A wrong answer shows a red banner, keeps the right answer green and counts the 3 second lockout down.
- [ ] The claim card dims the scene, shows the category, name, art, tier badge and compact weight, and only adds the catch to the haul when the player taps to claim.
- [ ] The small mastery badge above the note says Unknown, Familiar or Mastered from the session/FSRS state of the card.
- [ ] The lead-up before the reveal card plays on the water: the bobber dips and jerks, the rod bends, the bobber is pulled towards the boat and the catch comes out of the water with a big splash (2.5s for a critter or a heavy catch, 1s for junk and for a wrong answer).
- [ ] The haul counter rolls up, and the End confirmation leads to the server payout screen.
- [ ] The scope of the session is honoured: **all**, a **class** (a pile of decks), a **topic** or a **deck**. The session queue asks the questions of that scope only.
- [ ] **Mastery mode** ends the session by itself when every question of the scope is mastered (three right answers in a row, a miss starts over) and says it with the "MASTERED!" celebration.
- [ ] The math of a prompt or of an answer is drawn with KaTeX (`$...$`, `$$...$$`) and an escaped dollar sign stays a price.
- [ ] The four answer tiles are orange, blue, green and red with a darker bottom edge; a long answer is never cut off: it gets the full width (one column) and a smaller font.
- [ ] The HOOKED! banner, GOT_AWAY and the in-session lure ranks 1–5 work. Frenzy lasts 5 catches. Powerups, critter catches and the Pack Ticket caps all work.
- [ ] A critter catch is a catch: it counts for the haul and it is shown on the reveal and on the payout screen, but it **never** enters the collection. Only a pack grants a critter (a duplicate only bumps the count there).
- [ ] Only the critters of the packs that are on sale swim up.
- [ ] Bonus cards roll at rank 1 at most and never roll the critter special or a ticket.
- [ ] About 2 % of the catches are heavy catches at the best lure: they use the Angler's Legend tier, sit inside their wiki row's weight range and pay 15 tokens each at the end of the session.
- [ ] Sound, haptics and Reduce Motion all have toggles.
- [ ] Unit tests cover the reducer, the tier odds per rank, the weight roll, the specials and their caps (seeded RNG), and that a simulated session leaves the collection unchanged.

---

## Coding-agent prompt

> You are implementing the Fishing ("Fish Frenzy") game mode in the `WxboySuper/study-app` monorepo (pnpm workspaces; Expo SDK 58 app in `apps/mobile`, expo-router; shared logic in `packages/core`; React Native 0.88, react-native-reanimated 4.7 + react-native-worklets already installed). Read `docs/SPEC.md` and `docs/design/fishing.md` first. The design doc is the source of truth for look and feel.
>
> Build:
> 1. `packages/core/src/fishing/`: `catches.ts` (the tiers from §6 and the catch list from §7: the junk of the bottom tier, the critters of the packs that are on sale in the other tiers and the specials), `roll.ts` (the per-lure-rank tier odds table, weight roll, the special table from §8 with Frenzy (5 catches, rank +2, ×2 weight), powerups, critter catches, Pack Ticket caps of 1/session and 1/day, the bonus-card rule (rank 1 at most, no critter special/tickets) and in-session lure guarantees at 5/12/22/35 correct; inject a seeded RNG), `machine.ts` (pure reducer for states IDLE, CASTING, WAITING, HOOKED, QUESTION, REELING, REVEAL, GOT_AWAY, END_CONFIRM with typed events; the catch is rolled on HOOKED and the next FSRS card is pulled then), `lures.ts` (shop items from §9). The content (the critters, the packs, the junk and the specials) lives in the registries of `packages/core/src/content/`: the logic only reads them. Export them from the package index. Write vitest tests for all of it, with ≥90% coverage on this folder. Do not change the existing payout or scheduler semantics. Tokens still come from `payout.ts`. Critter catches and Pack Tickets go into the session result and are validated by the API at End. A critter catch never grants a critter to the collection: only a pack does.
> 2. Add `expo-haptics` and `expo-audio` with `npx expo install`. **Do not add Skia.** Animate with react-native-reanimated (§11).
> 3. `apps/mobile/src/modes/fishing/`: `FishingScreen.tsx` (wires the machine to the existing FSRS queue from `@study-app/core`), `LakeScene.tsx` (layered Images: background, wave strips, shadow, bobber, line, fisher; Reanimated loops), `HookedBanner.tsx`, `QuestionNote.tsx` (an in-scene parchment note with 2 to 4 wooden-tag answers, at least 56dp each), `RevealCard.tsx`, `Hud.tsx` (haul lbs roll-up, streak, due count, lure pips, End with confirm), `PayoutScreen.tsx` (tokens, haul, catches by tier, critters, tickets; **Play again** with the same mode and set in one tap, and Home), `sfx.ts`, `haptics.ts`, and Reduce Motion support. Add a `app/fishing.tsx` route and a one-tap start from Home: mode → set/topic/All → Go.
> 4. Assets: the art resolver of the app (`apps/mobile/src/content/art.ts`) maps the art key of every entry to its PNG and falls back to the placeholder of its type, so the game runs with no art. Sound: CC0 SFX only (Kenney audio packs or Freesound CC0), credited in `assets/CREDITS.md`. Stay lean: if you're short on time, ship the core loop first (§3–6, 10) and leave the specials from §8–9 for run 2.
> 5. No timers anywhere in the mode. HOOKED! shows a big banner and a tap to Reel (with an auto-advance setting). A wrong answer means GOT_AWAY: the line snaps, the catch is lost, and the correct answer shows for 1.5s. The SRS grade is derived exactly as SPEC describes. Bite wait is 0.8–2.5s.
>
> Constraints: TypeScript strict, no `any`. `pnpm -r typecheck`, `pnpm -r lint` and `pnpm -r test` must pass. Don't touch `.github/workflows/android-release.yml`. Keep each animation on the UI thread (Reanimated shared values), with no setState per frame. Commit in small logical commits with conventional-commit messages. When finished, summarise what was built, what's placeholder, and any acceptance-checklist items (§15) not met.
