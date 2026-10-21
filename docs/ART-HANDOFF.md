# Art handoff for Codex / ChatGPT (study-app)

Paste this whole file to Codex (or ChatGPT image gen). Task:

> Generate every asset below as a PNG using image generation. Use ONE consistent style for all of them (append the style suffix to every prompt). Catches, lures, powerups and critters are 512×512 with a transparent background unless a size is noted. Backgrounds are opaque. Save each file as `apps/mobile/assets/fishing/<asset_id>.png` (critters go in `apps/mobile/assets/critters/<asset_id>.png`) in the repo WxboySuper/study-app, then commit and push to main. Do not change any code. If transparency isn't supported, use a flat pure #FF00FF background and say so.

**Style suffix (append to every prompt):**
"cute chunky cartoon game sprite, thick dark outline, flat bright colours, soft cel shading, centered, single object, transparent background, no text, mobile game asset, Blooket-like style"

> **The fishing mode catches critters, junk and specials — there is no fish
> art.** The critters reuse the art of the pack system (the last section of
> this file), the junk and the specials need their own sprites, and every
> missing image falls back to the placeholder of its type (a critter, a junk
> item, a special or a fish), so the game runs with or without this batch.

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

**Critters (apps/mobile/assets/critters/, 512×512, transparent)** — round cute study-themed mascot creatures, same style:
Brain Buddies: `critter_nibbles_the_notecard`, `critter_pip_pencil`, `critter_doodle_moth`, `critter_sir_highlighter`, `critter_gummy_eraser`, `critter_captain_cram`, `critter_recall_raccoon`, `critter_synapse_sprite`, `critter_professor_hoot_n_holler`, `critter_mnemo_the_memory_jelly`, `critter_the_spaced_ranger`, `critter_gigabrain_golem`
Midterm Monsters (Halloween): `critter_candy_corn_kid`, `critter_pumpkin_pupil`, `critter_bat_ter_up`, `critter_ghost_of_finals_past`, `critter_mummy_wrapped_up`, `critter_count_flashula`, `critter_the_witching_hour_owl`, `critter_headless_homework_horseman`
(Prompt each as "<name as a cute cartoon creature>, <one-line vibe from its name>".)

**No fish art.** The catches of the fishing mode are critters, junk and
specials, so the `fish_*` sprites of the first version of this list are not
needed. The fish registry of the game (`packages/core/src/content/fish.ts`) is
typed and empty: when the first fish is added, it gets its own prompt and its
own PNG then.
