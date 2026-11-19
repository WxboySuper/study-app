/**
 * The critter registry (docs/SPEC.md §3, "Collectibles: packs & critters").
 *
 * Critters are the collectible characters of the app. They live in packs that
 * are bought with tokens and they also swim up as a fishing catch (see
 * `src/fishing/catches.ts`).
 *
 * The catalogue lives in the core package because both the client (shop,
 * collection book, fishing catches) and the API (pack opening, server side
 * validation of a session) need exactly the same data.
 *
 * Adding a critter is a data change: one entry here plus one image in
 * `apps/mobile/assets/critters/`. See `docs/ADDING-CONTENT.md`.
 */

/** How rare a critter is. The order is from least to most rare. */
export type CritterRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** All rarities, from the most common to the rarest. */
export const CRITTER_RARITIES: readonly CritterRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/**
 * The odds a pack uses when it picks a critter (SPEC §3):
 * "Common 60% · Uncommon 25% · Rare 10% · Epic 4% · Legendary 1%".
 */
export const CRITTER_RARITY_ODDS: Readonly<Record<CritterRarity, number>> = {
  common: 65,
  uncommon: 24,
  rare: 8,
  epic: 2.5,
  legendary: 0.5,
};

/** A single critter. */
export interface CritterDef {
  id: string;
  name: string;
  /** The pack the critter belongs to. */
  packId: string;
  rarity: CritterRarity;
  /** One line of flavour text. */
  vibe: string;
  /** The art key of the critter (the file name of the PNG). */
  assetId: string;
  /** Emoji used when the art is not available yet. */
  emoji: string;
  /**
   * Epoch milliseconds; `null` (or missing) means "always".
   *
   * A critter of a seasonal pack follows the window of its pack, so this is
   * only needed for a critter that is on sale for a shorter time.
   */
  availableFrom?: number | null;
  /** Epoch milliseconds (exclusive); `null` (or missing) means "always". */
  availableUntil?: number | null;
}

/** Every critter of the catalogue, starter pack first. */
export const CRITTERS: readonly CritterDef[] = [
  {
    id: 'nibbles_the_notecard',
    name: 'Nibbles the Notecard',
    packId: 'brain_buddies',
    rarity: 'common',
    vibe: 'A neat index card that snacks on loose facts.',
    assetId: 'critter_nibbles_the_notecard',
    emoji: '🗂️',
  },
  {
    id: 'pip_pencil',
    name: 'Pip Pencil',
    packId: 'brain_buddies',
    rarity: 'common',
    vibe: 'Tiny, eager, always first to raise its eraser.',
    assetId: 'critter_pip_pencil',
    emoji: '✏️',
  },
  {
    id: 'doodle_moth',
    name: 'Doodle Moth',
    packId: 'brain_buddies',
    rarity: 'common',
    vibe: 'Flutters around your margins leaving little sketches.',
    assetId: 'critter_doodle_moth',
    emoji: '🦋',
  },
  {
    id: 'sir_highlighter',
    name: 'Sir Highlighter',
    packId: 'brain_buddies',
    rarity: 'common',
    vibe: 'Marks everything important in blinding yellow.',
    assetId: 'critter_sir_highlighter',
    emoji: '🖍️',
  },
  {
    id: 'gummy_eraser',
    name: 'Gummy Eraser',
    packId: 'brain_buddies',
    rarity: 'uncommon',
    vibe: 'Squishy; forgives every mistake you have ever made.',
    assetId: 'critter_gummy_eraser',
    emoji: '🧽',
  },
  {
    id: 'captain_cram',
    name: 'Captain Cram',
    packId: 'brain_buddies',
    rarity: 'uncommon',
    vibe: 'Pulls all-nighters on purpose. Do not be like him.',
    assetId: 'critter_captain_cram',
    emoji: '⛵',
  },
  {
    id: 'recall_raccoon',
    name: 'Recall Raccoon',
    packId: 'brain_buddies',
    rarity: 'uncommon',
    vibe: 'Digs through your memory trash and finds the good stuff.',
    assetId: 'critter_recall_raccoon',
    emoji: '🦝',
  },
  {
    id: 'synapse_sprite',
    name: 'Synapse Sprite',
    packId: 'brain_buddies',
    rarity: 'rare',
    vibe: 'A crackling spark that zips between neurons.',
    assetId: 'critter_synapse_sprite',
    emoji: '⚡',
  },
  {
    id: 'professor_hoot_n_holler',
    name: 'Professor Hoot-n-Holler',
    packId: 'brain_buddies',
    rarity: 'rare',
    vibe: 'An owl who lectures loudly and is always right.',
    assetId: 'critter_professor_hoot_n_holler',
    emoji: '🦉',
  },
  {
    id: 'mnemo_the_memory_jelly',
    name: 'Mnemo the Memory Jelly',
    packId: 'brain_buddies',
    rarity: 'epic',
    vibe: 'A glowing jellyfish that never forgets a single card.',
    assetId: 'critter_mnemo_the_memory_jelly',
    emoji: '🪼',
  },
  {
    id: 'the_spaced_ranger',
    name: 'The Spaced Ranger',
    packId: 'brain_buddies',
    rarity: 'epic',
    vibe: 'Shows up exactly when you are about to forget.',
    assetId: 'critter_the_spaced_ranger',
    emoji: '🧭',
  },
  {
    id: 'gigabrain_golem',
    name: 'Gigabrain Golem',
    packId: 'brain_buddies',
    rarity: 'legendary',
    vibe: 'Built from every card you have ever mastered.',
    assetId: 'critter_gigabrain_golem',
    emoji: '🗿',
  },
  {
    id: 'candy_corn_kid',
    name: 'Candy Corn Kid',
    packId: 'midterm_monsters',
    rarity: 'common',
    vibe: 'Divisive, sugary, and fully committed.',
    assetId: 'critter_candy_corn_kid',
    emoji: '🍭',
  },
  {
    id: 'pumpkin_pupil',
    name: 'Pumpkin Pupil',
    packId: 'midterm_monsters',
    rarity: 'common',
    vibe: "A jack-o'-lantern that studies by its own candlelight.",
    assetId: 'critter_pumpkin_pupil',
    emoji: '🎃',
  },
  {
    id: 'bat_ter_up',
    name: 'Bat-ter Up',
    packId: 'midterm_monsters',
    rarity: 'common',
    vibe: 'A bat who swings at every question, hits most of them.',
    assetId: 'critter_bat_ter_up',
    emoji: '🦇',
  },
  {
    id: 'ghost_of_finals_past',
    name: 'Ghost of Finals Past',
    packId: 'midterm_monsters',
    rarity: 'uncommon',
    vibe: 'Haunts you with the questions you skipped.',
    assetId: 'critter_ghost_of_finals_past',
    emoji: '👻',
  },
  {
    id: 'mummy_wrapped_up',
    name: 'Mummy Wrapped-Up',
    packId: 'midterm_monsters',
    rarity: 'uncommon',
    vibe: 'Wraps up every study session neat and tidy.',
    assetId: 'critter_mummy_wrapped_up',
    emoji: '🧟',
  },
  {
    id: 'count_flashula',
    name: 'Count Flashula',
    packId: 'midterm_monsters',
    rarity: 'rare',
    vibe: 'Vants to quiz your flashcards. Ah-ah-ah!',
    assetId: 'critter_count_flashula',
    emoji: '🧛',
  },
  {
    id: 'the_witching_hour_owl',
    name: 'The Witching Hour Owl',
    packId: 'midterm_monsters',
    rarity: 'epic',
    vibe: 'Only appears during late-night sessions. Spooky smart.',
    assetId: 'critter_the_witching_hour_owl',
    emoji: '🦉',
  },
  {
    id: 'headless_homework_horseman',
    name: 'Headless Homework Horseman',
    packId: 'midterm_monsters',
    rarity: 'legendary',
    vibe: 'Lost his head, never his GPA.',
    assetId: 'critter_headless_homework_horseman',
    emoji: '💀',
  },
  {
    id: 'gravy_gremlin',
    name: 'Gravy Gremlin',
    packId: 'gobble_scholars',
    rarity: 'common',
    vibe: 'Slurps up loose facts, extra gravy.',
    assetId: 'critter_gravy_gremlin',
    emoji: '🍲',
  },
  {
    id: 'pie_chart_pup',
    name: 'Pie Chart Pup',
    packId: 'gobble_scholars',
    rarity: 'common',
    vibe: 'Cuts every topic into equal slices.',
    assetId: 'critter_pie_chart_pup',
    emoji: '🥧',
  },
  {
    id: 'cranberry_can_do',
    name: 'Cranberry Can-Do',
    packId: 'gobble_scholars',
    rarity: 'common',
    vibe: 'Holds the shape of the can. Knows the answer.',
    assetId: 'critter_cranberry_can_do',
    emoji: '🥫',
  },
  {
    id: 'turkey_trot_tutor',
    name: 'Turkey Trot Tutor',
    packId: 'gobble_scholars',
    rarity: 'uncommon',
    vibe: 'Runs laps around the syllabus.',
    assetId: 'critter_turkey_trot_tutor',
    emoji: '🦃',
  },
  {
    id: 'mashed_potato_mentor',
    name: 'Mashed Potato Mentor',
    packId: 'gobble_scholars',
    rarity: 'uncommon',
    vibe: 'Lumpy, warm, and surprisingly helpful.',
    assetId: 'critter_mashed_potato_mentor',
    emoji: '🥔',
  },
  {
    id: 'corn_maze_cartographer',
    name: 'Corn Maze Cartographer',
    packId: 'gobble_scholars',
    rarity: 'rare',
    vibe: 'Finds the way through any tangled chapter.',
    assetId: 'critter_corn_maze_cartographer',
    emoji: '🌽',
  },
  {
    id: 'cornucopia_sage',
    name: 'The Cornucopia Sage',
    packId: 'gobble_scholars',
    rarity: 'epic',
    vibe: 'Pours out more flashcards than you can carry.',
    assetId: 'critter_cornucopia_sage',
    emoji: '🌾',
  },
  {
    id: 'gobble_scholar_supreme',
    name: 'Gobble Scholar Supreme',
    packId: 'gobble_scholars',
    rarity: 'legendary',
    vibe: "Struts in at the final hour and fills your plate with A's.",
    assetId: 'critter_gobble_scholar_supreme',
    emoji: '🦃',
  },
  {
    id: 'mitten_mnemonic',
    name: 'Mitten Mnemonic',
    packId: 'frostbitten_finals',
    rarity: 'common',
    vibe: 'Remembers everything by heart. Two hearts, actually.',
    assetId: 'critter_mitten_mnemonic',
    emoji: '🧤',
  },
  {
    id: 'hot_cocoa_highlighter',
    name: 'Hot Cocoa Highlighter',
    packId: 'frostbitten_finals',
    rarity: 'common',
    vibe: 'Marks the important parts and keeps you warm.',
    assetId: 'critter_hot_cocoa_highlighter',
    emoji: '☕',
  },
  {
    id: 'snowball_scribe',
    name: 'Snowball Scribe',
    packId: 'frostbitten_finals',
    rarity: 'common',
    vibe: 'Rolls every note into one big idea.',
    assetId: 'critter_snowball_scribe',
    emoji: '⛄',
  },
  {
    id: 'icicle_index',
    name: 'Icicle Index',
    packId: 'frostbitten_finals',
    rarity: 'uncommon',
    vibe: 'Points at the right answer. Melts under pressure.',
    assetId: 'critter_icicle_index',
    emoji: '🧊',
  },
  {
    id: 'scarf_scholar',
    name: 'Scarf Scholar',
    packId: 'frostbitten_finals',
    rarity: 'uncommon',
    vibe: 'Wraps every concept together, then wraps it again.',
    assetId: 'critter_scarf_scholar',
    emoji: '🧣',
  },
  {
    id: 'snowdrift_strategist',
    name: 'Snowdrift Strategist',
    packId: 'frostbitten_finals',
    rarity: 'rare',
    vibe: 'Plans the whole study week from a warm burrow.',
    assetId: 'critter_snowdrift_strategist',
    emoji: '🦊',
  },
  {
    id: 'yeti_librarian',
    name: 'The Yeti Librarian',
    packId: 'frostbitten_finals',
    rarity: 'epic',
    vibe: 'Shh. Everything is filed under cold.',
    assetId: 'critter_yeti_librarian',
    emoji: '📚',
  },
  {
    id: 'aurora_valedictorian',
    name: 'Aurora Valedictorian',
    packId: 'frostbitten_finals',
    rarity: 'legendary',
    vibe: 'Graduates with honors under the northern lights.',
    assetId: 'critter_aurora_valedictorian',
    emoji: '🐧',
  },
];
