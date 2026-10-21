# Blooket Remaster Notes

Research from the Blooket Fandom wiki (blooket.fandom.com), Oct 21, 2026. Pages read: Gamemodes, Fishing Frenzy, Café, Crazy Kingdom, Tower of Doom, Tower Defense, Factory, Monster Brawl, Deceptive Dinos, Gold Quest, Study, Blooks (rarities), Market, Class Pass, Achievements, Banners.

Our constraints: solo, **untimed**, Android-first (Expo), FSRS picks every card, tokens are paid when the player taps **End**, collectible critters come in themed packs, there's a daily spin, and the economy exists to keep Alex studying.

**Universal adaptation rule:** in every mode the game state only moves forward when a card is answered. Nothing happens in real time, there's no timer and no fail state that ends a session early. Any "game over" becomes a soft reset or an "ending" screen, and the mode keeps going until End. Wrong answers never hurt the run much. They just mean the card comes back sooner (FSRS Again). The mode's score feeds only a small `modeBonus`. The base payout stays tied to cards studied, so no mode is a better grind than the others.

Fit key: **must** / **nice** / **skip**. Phases follow SPEC.md (P1 first playable, P2 agents & habit, P3 more fun, P4 polish, P5+ later).

---

## 1. Game modes

Wiki context: Blooket's solo modes are Café, Crazy Kingdom, Factory, Fishing Frenzy, Monster Brawl, Pirate Pool, Plushie Panic, Snake Escape, Study, Tower Defense 1 & 2 and Zorblitz. Tower of Doom was **retired Aug 9, 2025**. Deceptive Dinos and Gold Quest are host-only (multiplayer). Since 2025 the reworks have been **removing timers** (Café's customer timer, Factory's timer), so Blooket itself is moving toward our design.

| Mode | Blooket core loop (one line) | Remaster idea (untimed, End button) | Fit | Phase |
|---|---|---|---|---|
| **Fishing Frenzy** (baseline "Cast") | Answer to reel in a catch that has a weight. The 7 catch tiers run Trash → Easy One → Great Catch → Rare Find → Epic Grab → Catch of the Day → Angler's Legend. Lure upgrades every few answers improve the odds, and a rare "Frenzy" event turns the scene rainbow and boosts rare catches. | Already the MVP. Steal: **lure level goes up with your correct streak** and drops back one level on a miss, weight ranges per tier, and a **"Frenzy" proc** (~2% per correct answer) that lasts 5 cards with boosted odds and a rainbow sky. Add a Trash tier (an old boot) for comedy. Seasonal catches like a Spooky Pumpkin during Halloween. | must | P1 |
| **Café** | Correct answers add +1 stock of every food. You serve customers, and between "days" you spend cash upgrading foods (5 levels each), café level (×1 to ×3 profit) and plate colors. Since the Aug 2025 rework there's **no customer timer**. | Customers are your **critters** (owned ones show up, rarer ones tip more, which gives the collection a use). Each correct answer restocks. A "day" is 10 cards, then the upgrade shop opens. The café level persists across sessions as a slow meta-progression, with cosmetic levels only and no token multiplier. | must | P3 |
| **Crazy Kingdom** | A Sort-the-Court ruler sim. Guests make requests, you answer Yes or No, and four stats (Materials, People, Happiness, Gold) move. A stat hitting 0 ends the game. The castle background grows at guest milestones (1, 3, 5 … 70). A Tax Toucan comes every 11 turns. Since the rework, **you must get a card right before you're allowed to decide**. | It's a perfect turn-based fit with nothing to make untimed. Each card is one guest: get it right and you choose Yes or No, get it wrong and the guest asks again with the next card. Write original critter guest dialogue (e.g. Captain Cram wants an all-nighter festival). A stat at 0 = "the kingdom falls", you see an ending card and start a new reign in the same session. **The kingdom visually grows** across sessions. Branching story chains need only data (JSON events). | must | P3 |
| **Tower of Doom** (retired) | A Slay-the-Spire-like run. Earn cards by answering correctly, then pick a path on a map (enemy, mini-boss, shop, rest, ? risk, boss). Battles compare one stat (Strength, Charisma or Wisdom). **Answer right and you pick the stat, answer wrong and the enemy picks.** Win streaks multiply damage. 3 maps, with Evil Unicorn, Evil Santa and Evil King as bosses. | **Big opportunity**, because Blooket killed it and fans miss it. It's turn-based already. Your **owned critters become your deck**, each with STR/CHA/WIS stats, so collecting matters for gameplay. Rest stops = "answer 3 to heal". Shop prices are in run-coins, never tokens. The run saves at End and resumes next session. Spell-like relics (Lucky Feather, Coupon) carry over. | must | P3 |
| **Tower Defense** | A Bloons-style game. Earn upgrade tokens from questions between waves, place critter towers with 3 upgrade tiers of 2 paths each, and survive waves that split (Blue ← Pink ← Purple … Slime Monster). | Make it **wave-on-demand**. Answer 3 cards to bank currency, then tap "Send wave" when you're ready, and the wave auto-plays as a short animation. Nothing advances while you're answering. Towers are your critters. It's a heavier build (pathing and sim), but you can deterministically sim the wave and just animate the result. Saves between sessions, like Blooket's save slots. | nice | P4 |
| **Factory** | Every 3 correct answers gives you a new unit (10 slots). Units produce cash on a timer, you upgrade them, and matching categories give a synergy bonus of ×1.5 per match, up to ×5.5. | An idle game that suits untimed play if production ticks **per card answered** rather than per second. The fun is in building **synergy sets** from your critter packs ("3 Brain Buddies = ×1.5"). It overlaps with Café, so it's a cheap second mode once Café's upgrade UI exists. | nice | P4 |
| **Monster Brawl** | A Vampire Survivors clone. You move around and auto-attack, enemies drop XP crystals, and each level up = answer a question → pick 1 of 3 weapon upgrades. Two maxed weapons can form a **hidden Level 11 combo**. Victory at level 60. | Real-time movement fights "untimed", so make it a **pause-on-level-up hybrid**. The arena is frozen until you answer, then plays a 10–15 s burst. Or skip the movement and auto-battle. Keep **hidden combos** as a discovery mechanic. Risky on mobile performance and for focus (action skill instead of study). | nice | P5+ |
| **Deceptive Dinos** (host only) | Answer to either Excavate (pick 1 of 3 rocks, which hold fossils or ×1.5/×2 multipliers) or use **Cheat** to peek inside every rock, at the risk of losing a big share of your fossils if someone investigates you. | Solo version: a "dig site" pick-a-rock loop with a **risk-it Cheat button**. A peek costs a gamble: "the inspector" (an NPC) checks you with a 30% chance, and if caught you lose half your fossils. That's a fun press-your-luck beat. It works as a **mini-event** inside Cast or as a light mode. The Dino achievement "Rocks Opened Without Cheats" is a cute honesty badge. | nice | P4 |
| **Gold Quest** (host only) | Answer → pick 1 of 3 chests: +gold, ×2, ×3, lose 10/25% to a Dragon, steal or SWAP with other players, and since the July 2026 rework a Dragon's Treasure jackpot. | Solo it becomes "chest after each correct answer" press-your-luck: **Bank** your gold or keep opening. The Dragon steals into a pot you can win back later. The steal and swap effects need rivals, so use **ghost rivals** (your own past sessions, or NPC critters). Very cheap to build. It also makes a great **reskin template** (Candy Quest for Halloween, Shamrock Quest for St. Patrick's Day), exactly like Blooket does. | must | P2–P3 |
| **Study** | Plain questions with no game, 2 tokens/XP each, endless until you stop. It's Blooket's **best token grind**, which became a problem: 250 spam-set questions took 3 min 36 s. | We need a plain "Focus" mode for exam cramming. **Lesson learned:** pay the same per card as the game modes, keep the FSRS-driven bonus-review rate low, and use the daily cap. Never let the no-game mode be the optimal grind. | must | P1–P2 |
| Pirate Pool / Plushie Panic / Snake Escape / Zorblitz | Solo skill minigames (pool trick shots, a claw-style rescue, snake, a breakout-style level campaign) gated by questions. | Level-based campaigns like Zorblitz (48 levels released in phases) are a good **content cadence** idea, but they're skill games. Pick at most one as a "break" minigame later. | skip (for now) | P5+ |
| Classic / Racing / Battle Royale / Laser Tag etc. | Multiplayer and real-time. | Needs other players, and the spec is solo. | skip | — |

### Top 5 modes to build after Fishing Frenzy (ranked)
1. **Crazy Kingdom.** It's natively turn-based, has the cheapest art (one throne room and a guest queue), and is pure data-driven content (event JSON = infinite story). The "right answer unlocks the decision" rule is exactly our design. The kingdom growing across sessions is a strong reason to come back.
2. **Café.** Blooket's rework already made it untimed. It's the best showcase for **owned critters as customers**, and it gives a cross-session upgrade progression. The spec already planned it.
3. **Tower of Doom.** It's turn-based and roguelike, and Blooket retired it, so this is the "they took it away, we brought it back" mode. It turns the critter collection into a **deck with stats**, which gives packs a gameplay purpose and makes dupes less purely sell-fodder. Highest depth per line of code.
4. **Gold Quest (solo, press-your-luck).** It's very cheap, and the 3-chest flip is exciting. Its built-in **seasonal reskin** pattern (Candy Quest) fits our seasons-are-data model. Ghost rivals fill in for the multiplayer effects.
5. **Factory.** Idle production ticks per card, and critter-set synergies are another reason to collect full packs. It reuses Café's upgrade UI.

Runners-up: Deceptive Dinos (better as a Cast mini-event), Tower Defense (great but a heavy build), Monster Brawl (fights untimed play).

---

## 2. Market, packs, rarities, selling

| Item | Blooket (one line) | Remaster idea | Fit | Phase |
|---|---|---|---|---|
| Pack prices | Always-on packs cost **20–25 tokens**. Seasonal packs (Spooky, Autumn, Blizzard) cost 25. | Matches Alex's numbers. Update SPEC §3 (still says 50 for the starter and 75 for Halloween) to **20–25**. | must | P1 |
| Pack quantity picker | The Apr 2026 redesign removed instant open and now asks how many packs to buy. Opening animates by flashing rarity colors (green→blue→red→orange→light blue) and stopping on the result. | Buy ×1/×5/×10 and use the **color-flash reveal** for each pull. It's cheap and very satisfying. | must | P1 |
| Shopkeeper NPC | "Mark" runs the Market stand. | An original shopkeeper critter with a quip line per visit. | nice | P2 |
| Rarity ladder | Common (free, can't sell) · Uncommon 12.5–19.6% · Rare 4–10% · Epic ~2–5% · Legendary 0.2–1% · **Chroma 0.01–0.08%** · Unique (one-time, can't be re-obtained if sold) · **Mystical** (event winners only, **animated**). | Keep 5 pack tiers, plus add **Chroma** as an ultra-rare alt-color variant of an existing critter (~0.05%), and **Mystical** only as event/milestone rewards with **animated art** (Lottie). Skip Unique, which only makes sense for real-world events. | must (Chroma), nice (Mystical) | P2 / P3 |
| Sell values | Uncommon 5 · Rare 20 · Epic 75 · Legendary 200 (Megalodon 250) · Chroma 300 · Unique 500 · Mystical 1000. Commons can't be sold. | At 20–25-token packs these ratios work as-is. **Dupes only** (Alex's rule): a "sell all dupes" button, and the last copy is always kept. Suggested: U 2 · R 8 · E 30 · L 100 · Chroma 150. Lower than Blooket's because Alex earns less per session. | must | P1–P2 |
| Anti-farm price rule | Wiki: "One Day Only" buy prices are always set above sell prices, to stop token farming. | Codify an invariant test: `sell_value < buy_price` for any directly-buyable critter. | must | P2 |
| Blook Score | Each rarity has a score (U5, R10, E20, L35, Chroma 25–50, Mystical 75). Your collection total is shown. | A **"Collection Score"** on the profile, which gives a clean number-go-up for collecting without paying tokens. | nice | P2 |
| Drop-rate math | The wiki explains 1−(1−D)^P. | Show "chance in your next 10 packs" on the pack page. It's honest and teaches probability. | nice | P3 |
| Day-of-week variants | Seven colored Astronaut Chromas, each obtainable only on its day of the week. Snow Globes rotate the same way. | One "critter of the day" variant that rotates daily, which is a gentle daily-login hook and costs only data. | nice | P3 |
| Secret pack | The Color Pack appears only in host games with more than 49 players. | Hidden critters unlocked by weird study feats (e.g. a 100-card streak with no misses) and never sold. | nice | P3 |

## 3. Seasonal & event blooks

| Item | Blooket (one line) | Remaster idea | Fit | Phase |
|---|---|---|---|---|
| Seasonal pack windows | Spooky Oct→Nov 5 · Autumn Nov→Dec · Blizzard Dec→Jan 7. New critters are added each year, and old ones get rarity-demoted to make room (Zombie went from Rare to Uncommon). | Already in the spec (packs as data with windows). Add **yearly additions** to returning packs ("Midterm Monsters 2027" adds 2 new critters) rather than a whole new pack every year. | must | P1+ |
| One-day/one-week 100% Chromas | Valentine's, St. Patrick's and Easter sell a single guaranteed Chroma for 500–2,000 tokens (prices fall each year). | Holiday **direct-buy** critters at about 1 week of study's worth of tokens. They're a savings goal and a reason to study steadily before the holiday. | must | P2–P3 |
| Event contests | Contest of Candy (collect toy sets), Blooket Holidays (sticker sets), guild/club leaderboards. Prizes are Chromas at milestone thresholds, and Mysticals go to the top finishers. | Solo version: a **seasonal event track** where answering cards during the event drops event items (candy, stickers). Completing sets awards event Chromas, and finishing everything gives a **Mystical**. This is the best long-term engagement hook found. | must | P3 |
| Seasonal mode reskins | Candy Quest/Shamrock Quest for Gold Quest, Cocoa Cottage for Coco Cabana, Spooky Plains for Monster Brawl, plus seasonal catches in Fishing Frenzy. | Modes read a `season` theme key (background, music, catch table). Halloween Cast swaps in spooky catches. | nice | P2 |

## 4. Class Pass, XP and cosmetics

| Item | Blooket (one line) | Remaster idea | Fit | Phase |
|---|---|---|---|---|
| XP | XP is earned per correct answer, with a **300 XP/day cap**. | XP = cards reviewed (due/new weighted), separate from tokens. Use a daily cap or diminishing returns so streak days beat marathons. | must | P2 |
| Class Pass | **100 tiers per yearly season**. Every 10 tiers the XP cost per tier goes up (5→10→…→100, about 4,580 XP total), and each tier unlocks a custom-avatar part. | A **"Study Pass"** that resets each school year (Aug/Sep). 100 tiers, sized so that steady daily study finishes it near finals (~4,500 XP at about 25 XP/day). It rewards cosmetics only, never tokens. | must | P3 |
| Custom avatar | 10 part slots (clothing, hair, glasses, cheeks, eyes, hat, eyebrows, nose, mouth, item), about 4.6 quintillion combinations. Pass parts are exclusive to their season. | A custom **"study buddy"** critter built from layered SVG parts. Start with 4 slots (base, hat, glasses, item) and expand later. Pass-season-exclusive parts make the collection feel personal. | nice | P3–P4 |
| Weekly Shop | A rotating weekly shop for banners, titles and avatar parts, bought with tokens. | A token sink for cosmetics, which keeps the spending loop going after the collection fills up. | nice | P3 |

## 5. Stats, badges, banners, titles

| Item | Blooket (one line) | Remaster idea | Fit | Phase |
|---|---|---|---|---|
| Achievements | Season 8 added **90 achievements, each with 5 tiers** (e.g. Questions Correct 10/2.5k/10k/25k/50k), with per-mode ones like Megalodons Caught and Hidden Combos Activated. **Spam-set farming doesn't count toward the study achievements.** | A tiered badge system: general (cards reviewed, streak days, retention %, packs opened, Chromas found), study-science (cards **mastered** = stability > 30 days, leeches cured), and per-mode badges. Count only FSRS-logged real reviews (bonus review counts at a reduced rate), the same anti-spam idea. | must | P2 |
| Banners | A profile background with rarities Common (starter), Uncommon (100 tokens), Rare and Epic (750 tokens). Seasonal shops each have their own banners. | Profile/stats-page banners as a token sink, with seasonal banners in the event shop. | nice | P3 |
| Titles | A text title shown under your name, bought in the Weekly Shop. | Titles earned from achievements ("Leech Slayer", "Night Owl", "Spaced Ranger") rather than bought. They cost nothing to make and feel earned. | must | P2 |
| Stats page | Your top blook, tokens, games played and (now) achievements. | The spec's P2 stats page. Add a "most-used critter" avatar, **Collection Score**, retention, forecast and badges. | must | P2 |

## 6. Anything else worth stealing

| Item | Blooket (one line) | Remaster idea | Fit | Phase |
|---|---|---|---|---|
| Daily token cap | 500 tokens/day from games. The Study mode alone could hit it in about 4 minutes on a spam set. | Keep the spec's soft cap and diminishing returns. The Study mode lesson is to keep bonus review pay low. | must | P1 |
| Wrong answer = try another | The Café and Crazy Kingdom reworks make you answer a *new* question until one is correct before the game action fires. | Adopt this everywhere. The game action requires a correct answer, so a wrong one just makes FSRS reschedule the card and serve the next one. | must | P1 |
| Confetti on correct | Every 2025 rework added confetti on correct answers. | Haptic + confetti burst (Expo Haptics + Reanimated). | must | P1 |
| Save slots | Café and both Tower Defense games keep save slots. | Persist mode state per mode in D1 (`mode_saves`), so End means "pause and pay", not "lose progress". | must | P3 |
| Hidden combos | Monster Brawl's secret Level 11 when two specific weapons are maxed. | Secret critter-pair synergies in Factory and Tower of Doom, plus a discovery badge. | nice | P4 |
| Rotating featured mode | Zorblitz released 48 levels in 4 phases over 9 months. | A monthly "featured mode" with a +10% mode bonus, and timed content drops. | nice | P4 |
| Distractions/glitches | Host-only sabotage (screen flip, dance party). | Multiplayer sabotage doesn't fit a solo study app. | skip | — |
| Stealing/swapping between players | The Gold Quest SWAP meme. | Only with ghost rivals, and lightly. | skip | — |

---

## Spec follow-ups suggested
- SPEC §3 pack prices still say 50 (starter) / 75 (Halloween). Change them to 20 and 25 to match the Oct 21 economy notes.
- Add `chroma` and `mystical` to `critters.rarity`. Add `critters.stats_json` (STR/CHA/WIS for Tower of Doom), a `mode_saves` table, and an `achievements`/`user_achievements` pair.
- Add a test for the invariant `sell_value < buy_price`.
