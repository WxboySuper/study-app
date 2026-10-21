/**
 * The critter catalogue (docs/SPEC.md §3, "Collectibles: packs & critters").
 *
 * Critters are the collectible characters of the app. They live in packs that
 * are bought with tokens and they can also swim up as a fishing catch (see
 * `src/fishing/catches.ts`).
 *
 * The catalogue lives in the core package because both the client (shop,
 * collection book, fishing catches) and the API (pack opening, server side
 * validation of a session) need exactly the same data.
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
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

/** A pack of critters. */
export interface CritterPackDef {
  id: string;
  name: string;
  /** `core` packs are always on sale, `seasonal` packs only inside their window. */
  kind: 'core' | 'seasonal';
  /** The price in tokens (SPEC "Economy tuning": 20 for core, 25 for seasonal). */
  priceTokens: number;
  /** Epoch milliseconds. `null` means "always on sale" (see SPEC §5). */
  availableFrom: number | null;
  /** Epoch milliseconds (exclusive). `null` means "always on sale". */
  availableUntil: number | null;
}

/** A single critter. */
export interface CritterDef {
  id: string;
  name: string;
  /** The pack the critter belongs to. */
  packId: string;
  rarity: CritterRarity;
  /** One line of flavour text. */
  vibe: string;
  /** The sprite id (see docs/design/fishing.md §13a). */
  assetId: string;
  /** Emoji used when the sprite is not available yet. */
  emoji: string;
}

/**
 * The starter pack: always available, 20 tokens (SPEC "Economy tuning").
 */
export const STARTER_PACK_ID = 'brain_buddies';

/**
 * The Halloween 2026 seasonal pack. It is only on sale from Oct 1 to Nov 2,
 * 2026 (US Central time), which is the window the SPEC announces.
 */
export const HALLOWEEN_PACK_ID = 'midterm_monsters';

export const CRITTER_PACKS: readonly CritterPackDef[] = [
  {
    id: STARTER_PACK_ID,
    name: 'Brain Buddies',
    kind: 'core',
    priceTokens: 20,
    availableFrom: null,
    availableUntil: null,
  },
  {
    id: HALLOWEEN_PACK_ID,
    name: 'Halloween 2026 — Midterm Monsters',
    kind: 'seasonal',
    priceTokens: 25,
    // Oct 1 2026 00:00 CDT (UTC-5) -> Nov 2 2026 00:00 CST (UTC-6).
    availableFrom: Date.UTC(2026, 9, 1, 5, 0, 0),
    availableUntil: Date.UTC(2026, 10, 2, 6, 0, 0),
  },
];

/** Every critter of the catalogue, starter pack first. */
export const CRITTERS: readonly CritterDef[] = [
  {
    id: 'nibbles_the_notecard',
    name: 'Nibbles the Notecard',
    packId: STARTER_PACK_ID,
    rarity: 'common',
    vibe: 'A folded index card that snacks on loose facts.',
    assetId: 'critter_nibbles_the_notecard',
    emoji: '🗂️',
  },
  {
    id: 'pip_pencil',
    name: 'Pip Pencil',
    packId: STARTER_PACK_ID,
    rarity: 'common',
    vibe: 'Tiny, eager, always first to raise its eraser.',
    assetId: 'critter_pip_pencil',
    emoji: '✏️',
  },
  {
    id: 'doodle_moth',
    name: 'Doodle Moth',
    packId: STARTER_PACK_ID,
    rarity: 'common',
    vibe: 'Flutters around your margins leaving little sketches.',
    assetId: 'critter_doodle_moth',
    emoji: '🦋',
  },
  {
    id: 'sir_highlighter',
    name: 'Sir Highlighter',
    packId: STARTER_PACK_ID,
    rarity: 'common',
    vibe: 'Marks everything important in blinding yellow.',
    assetId: 'critter_sir_highlighter',
    emoji: '🖍️',
  },
  {
    id: 'gummy_eraser',
    name: 'Gummy Eraser',
    packId: STARTER_PACK_ID,
    rarity: 'uncommon',
    vibe: 'Squishy; forgives every mistake you have ever made.',
    assetId: 'critter_gummy_eraser',
    emoji: '🧽',
  },
  {
    id: 'captain_cram',
    name: 'Captain Cram',
    packId: STARTER_PACK_ID,
    rarity: 'uncommon',
    vibe: 'Pulls all-nighters on purpose. Do not be like him.',
    assetId: 'critter_captain_cram',
    emoji: '⛵',
  },
  {
    id: 'recall_raccoon',
    name: 'Recall Raccoon',
    packId: STARTER_PACK_ID,
    rarity: 'uncommon',
    vibe: 'Digs through your memory trash and finds the good stuff.',
    assetId: 'critter_recall_raccoon',
    emoji: '🦝',
  },
  {
    id: 'synapse_sprite',
    name: 'Synapse Sprite',
    packId: STARTER_PACK_ID,
    rarity: 'rare',
    vibe: 'A crackling spark that zips between neurons.',
    assetId: 'critter_synapse_sprite',
    emoji: '⚡',
  },
  {
    id: 'professor_hoot_n_holler',
    name: 'Professor Hoot-n-Holler',
    packId: STARTER_PACK_ID,
    rarity: 'rare',
    vibe: 'An owl who lectures loudly and is always right.',
    assetId: 'critter_professor_hoot_n_holler',
    emoji: '🦉',
  },
  {
    id: 'mnemo_the_memory_jelly',
    name: 'Mnemo the Memory Jelly',
    packId: STARTER_PACK_ID,
    rarity: 'epic',
    vibe: 'A glowing jellyfish that never forgets a single card.',
    assetId: 'critter_mnemo_the_memory_jelly',
    emoji: '🪼',
  },
  {
    id: 'the_spaced_ranger',
    name: 'The Spaced Ranger',
    packId: STARTER_PACK_ID,
    rarity: 'epic',
    vibe: 'Shows up exactly when you are about to forget.',
    assetId: 'critter_the_spaced_ranger',
    emoji: '🧭',
  },
  {
    id: 'gigabrain_golem',
    name: 'Gigabrain Golem',
    packId: STARTER_PACK_ID,
    rarity: 'legendary',
    vibe: 'Built from every card you have ever mastered.',
    assetId: 'critter_gigabrain_golem',
    emoji: '🗿',
  },
  {
    id: 'candy_corn_kid',
    name: 'Candy Corn Kid',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'common',
    vibe: 'Divisive, sugary, and fully committed.',
    assetId: 'critter_candy_corn_kid',
    emoji: '🍭',
  },
  {
    id: 'pumpkin_pupil',
    name: 'Pumpkin Pupil',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'common',
    vibe: "A jack-o'-lantern that studies by its own candlelight.",
    assetId: 'critter_pumpkin_pupil',
    emoji: '🎃',
  },
  {
    id: 'bat_ter_up',
    name: 'Bat-ter Up',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'common',
    vibe: 'A bat who swings at every question, hits most of them.',
    assetId: 'critter_bat_ter_up',
    emoji: '🦇',
  },
  {
    id: 'ghost_of_finals_past',
    name: 'Ghost of Finals Past',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'uncommon',
    vibe: 'Haunts you with the questions you skipped.',
    assetId: 'critter_ghost_of_finals_past',
    emoji: '👻',
  },
  {
    id: 'mummy_wrapped_up',
    name: 'Mummy Wrapped-Up',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'uncommon',
    vibe: 'Wraps up every study session neat and tidy.',
    assetId: 'critter_mummy_wrapped_up',
    emoji: '🧟',
  },
  {
    id: 'count_flashula',
    name: 'Count Flashula',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'rare',
    vibe: 'Vants to quiz your flashcards. Ah-ah-ah!',
    assetId: 'critter_count_flashula',
    emoji: '🧛',
  },
  {
    id: 'the_witching_hour_owl',
    name: 'The Witching Hour Owl',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'epic',
    vibe: 'Only appears during late-night sessions. Spooky smart.',
    assetId: 'critter_the_witching_hour_owl',
    emoji: '🦉',
  },
  {
    id: 'headless_homework_horseman',
    name: 'Headless Homework Horseman',
    packId: HALLOWEEN_PACK_ID,
    rarity: 'legendary',
    vibe: 'Lost his head, never his GPA.',
    assetId: 'critter_headless_homework_horseman',
    emoji: '💀',
  },
];

/** Every critter of a pack, in catalogue order. */
export function crittersOfPack(packId: string): CritterDef[] {
  return CRITTERS.filter((critter) => critter.packId === packId);
}

/** Every critter of a rarity, optionally limited to one pack. */
export function crittersByRarity(rarity: CritterRarity, packId?: string): CritterDef[] {
  return CRITTERS.filter(
    (critter) => critter.rarity === rarity && (packId === undefined || critter.packId === packId),
  );
}

/** Looks a critter up by id. */
export function findCritter(id: string): CritterDef | undefined {
  return CRITTERS.find((critter) => critter.id === id);
}

/** Looks a pack up by id. */
export function findPack(id: string): CritterPackDef | undefined {
  return CRITTER_PACKS.find((pack) => pack.id === id);
}

/**
 * Whether a pack can be bought at `now` (epoch milliseconds).
 *
 * The window is `[availableFrom, availableUntil)` (SPEC §5) and a `null`
 * bound means "always".
 */
export function isPackAvailable(pack: CritterPackDef, now: number): boolean {
  if (pack.availableFrom !== null && now < pack.availableFrom) {
    return false;
  }
  if (pack.availableUntil !== null && now >= pack.availableUntil) {
    return false;
  }
  return true;
}
