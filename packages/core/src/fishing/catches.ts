/**
 * The catch catalogue of the fishing mode (docs/design/fishing.md §6 and §7).
 *
 * The tiers mirror the Blooket names and the weights grow about 10x per tier,
 * so the haul counter goes up fast. All names are original.
 */

import { CRITTERS, type CritterDef, type CritterRarity } from '../critters';

/** The seven rarity tiers of a catch, from the most common to the rarest. */
export type CatchTier = 'trash' | 'easy' | 'great' | 'rare' | 'epic' | 'cotd' | 'legend';

/** The seasons that unlock extra catches. */
export type FishingSeason = 'halloween' | 'winter';

/** The tiers in ladder order. */
export const CATCH_TIER_ORDER: readonly CatchTier[] = [
  'trash',
  'easy',
  'great',
  'rare',
  'epic',
  'cotd',
  'legend',
];

/** The colour of a tier. */
export interface CatchTierDef {
  id: CatchTier;
  /** The Blooket style name of the tier, shown on the reveal card. */
  name: string;
  /** Hex colour of the tier (used for the ribbon, the burst and the HUD). */
  color: string;
  /** The smallest weight of the tier, in lbs. */
  minLbs: number;
  /** The biggest weight of the tier, in lbs. */
  maxLbs: number;
}

/**
 * The tier ladder of §6. The weight ranges are the tier wide ranges; every
 * individual catch narrows them down.
 */
export const CATCH_TIERS: readonly CatchTierDef[] = [
  { id: 'trash', name: 'Trash', color: '#8d6e63', minLbs: 1, maxLbs: 10 },
  { id: 'easy', name: 'Easy One', color: '#9e9e9e', minLbs: 10, maxLbs: 100 },
  { id: 'great', name: 'Great Catch', color: '#43a047', minLbs: 100, maxLbs: 750 },
  { id: 'rare', name: 'Rare Find', color: '#1e88e5', minLbs: 500, maxLbs: 5_000 },
  { id: 'epic', name: 'Epic Grab', color: '#e53935', minLbs: 7_000, maxLbs: 30_000 },
  { id: 'cotd', name: 'Catch of the Day', color: '#fb8c00', minLbs: 25_000, maxLbs: 500_000 },
  { id: 'legend', name: "Angler's Legend", color: '#8e24aa', minLbs: 500_000, maxLbs: 2_500_000 },
];

/**
 * The colour of the "special" catches (Frenzy, New Lure). The design doc
 * calls it the Chroma tier.
 */
export const SPECIAL_COLOR = '#22d3ee';

/** A catch. */
export interface CatchDef {
  /** Stable id, used in the session log and in the catch log strip. */
  id: string;
  name: string;
  tier: CatchTier;
  /** The lightest possible weight, in lbs. */
  minLbs: number;
  /** The heaviest possible weight, in lbs. */
  maxLbs: number;
  /** The sprite id (see docs/design/fishing.md §13a). */
  assetId: string;
  /** Emoji shown when the sprite is not available yet. */
  emoji: string;
  /** A one line joke for the silly catches. */
  joke?: string;
  /** The season this catch is only available in. */
  seasonal?: FishingSeason;
  /** The critter this catch is (critter catches only). */
  critterId?: string;
}

/** The tier a critter rarity shows up as when it swims onto the line. */
export const CRITTER_TIER: Readonly<Record<CritterRarity, CatchTier>> = {
  common: 'easy',
  uncommon: 'great',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legend',
};

function critterCatch(critter: CritterDef): CatchDef {
  const tier = CRITTER_TIER[critter.rarity];
  const tierDef = tierDefinition(tier);
  return {
    id: `critter_${critter.id}`,
    name: critter.name,
    tier,
    minLbs: tierDef.minLbs,
    maxLbs: tierDef.maxLbs,
    assetId: critter.assetId,
    emoji: critter.emoji,
    critterId: critter.id,
  };
}

/**
 * Every catch of the game.
 *
 * The critter catches are part of the list (so the reveal card can show them
 * like any other catch) but they never show up in the normal tier pools:
 * they are only rolled by the special table (§8).
 */
export const CATCHES: readonly CatchDef[] = [
  // --- Trash (junk) ------------------------------------------------------
  {
    id: 'old_sneaker',
    name: 'Old Sneaker',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_old_sneaker',
    emoji: '👟',
    joke: 'Smells like detention.',
  },
  {
    id: 'soggy_waffle',
    name: 'Soggy Waffle',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_soggy_waffle',
    emoji: '🧇',
    joke: 'Breakfast, mostly.',
  },
  {
    id: 'lost_homework',
    name: 'Lost Homework',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_lost_homework',
    emoji: '📄',
    joke: 'The F is now decorative.',
  },
  {
    id: 'two_of_clubs',
    name: 'Two of Clubs',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_two_of_clubs',
    emoji: '🃏',
    joke: 'Still the wrong card.',
  },
  {
    id: 'rubber_duck',
    name: 'Rubber Duck',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_rubber_duck',
    emoji: '🦆',
    joke: 'Quacks under pressure.',
  },
  {
    id: 'tangled_earbuds',
    name: 'Tangled Earbuds',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_tangled_earbuds',
    emoji: '🎧',
    joke: 'One for each ear, none for music.',
  },
  {
    id: 'half_pencil',
    name: 'Half a Pencil',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_half_pencil',
    emoji: '✏️',
    joke: 'Pointless.',
  },
  {
    id: 'mystery_tin_can',
    name: 'Mystery Tin Can',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_tin_can',
    emoji: '🥫',
    joke: 'Contents: unclear.',
  },
  {
    id: 'expired_hall_pass',
    name: 'Expired Hall Pass',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_hall_pass',
    emoji: '🎫',
    joke: 'No longer valid.',
  },

  // --- Easy One ----------------------------------------------------------
  {
    id: 'minnow_memo',
    name: 'Minnow Memo',
    tier: 'easy',
    minLbs: 10,
    maxLbs: 25,
    assetId: 'fish_minnow_memo',
    emoji: '🐟',
  },
  {
    id: 'flashcard_flounder',
    name: 'Flashcard Flounder',
    tier: 'easy',
    minLbs: 15,
    maxLbs: 40,
    assetId: 'fish_flashcard_flounder',
    emoji: '🐠',
  },
  {
    id: 'bluegill_bookmark',
    name: 'Bluegill Bookmark',
    tier: 'easy',
    minLbs: 20,
    maxLbs: 45,
    assetId: 'fish_bluegill_bookmark',
    emoji: '🐟',
  },
  {
    id: 'goldfish_cracker',
    name: 'Goldfish Cracker',
    tier: 'easy',
    minLbs: 30,
    maxLbs: 65,
    assetId: 'fish_goldfish_cracker',
    emoji: '🍘',
    joke: 'Cheese or crackers? Crackers.',
  },
  {
    id: 'lilypad_frog',
    name: 'Lilypad Frog',
    tier: 'easy',
    minLbs: 50,
    maxLbs: 100,
    assetId: 'fish_lilypad_frog',
    emoji: '🐸',
  },

  // --- Great Catch -------------------------------------------------------
  {
    id: 'highlighter_trout',
    name: 'Highlighter Trout',
    tier: 'great',
    minLbs: 100,
    maxLbs: 150,
    assetId: 'fish_highlighter_trout',
    emoji: '🐡',
    joke: 'Permanently neon.',
  },
  {
    id: 'wet_cat',
    name: 'Wet Cat',
    tier: 'great',
    minLbs: 100,
    maxLbs: 200,
    assetId: 'fish_wet_cat',
    emoji: '🐈',
    joke: 'Deeply unhappy.',
  },
  {
    id: 'sticky_note_sunfish',
    name: 'Sticky-Note Sunfish',
    tier: 'great',
    minLbs: 150,
    maxLbs: 350,
    assetId: 'fish_sticky_note_sunfish',
    emoji: '🐠',
  },
  {
    id: 'cram_carp',
    name: 'Cram Carp',
    tier: 'great',
    minLbs: 250,
    maxLbs: 750,
    assetId: 'fish_cram_carp',
    emoji: '🐟',
    joke: 'Crammed for the exam.',
  },

  // --- Rare Find ---------------------------------------------------------
  {
    id: 'quizzical_catfish',
    name: 'Quizzical Catfish',
    tier: 'rare',
    minLbs: 500,
    maxLbs: 1_000,
    assetId: 'fish_quizzical_catfish',
    emoji: '🐱',
  },
  {
    id: 'seal_of_approval',
    name: 'Seal of Approval',
    tier: 'rare',
    minLbs: 700,
    maxLbs: 2_200,
    assetId: 'fish_seal_of_approval',
    emoji: '🦭',
    joke: 'Signed, sealed, delivered.',
  },
  {
    id: 'margin_note_crab',
    name: 'Margin-Note Crab',
    tier: 'rare',
    minLbs: 1_000,
    maxLbs: 2_500,
    assetId: 'fish_margin_note_crab',
    emoji: '🦀',
  },
  {
    id: 'pop_quiz_pufferfish',
    name: 'Pop-Quiz Pufferfish',
    tier: 'rare',
    minLbs: 2_000,
    maxLbs: 4_000,
    assetId: 'fish_pop_quiz_puffer',
    emoji: '🐡',
  },
  {
    id: 'blobfish_of_burnout',
    name: 'Blobfish of Burnout',
    tier: 'rare',
    minLbs: 3_000,
    maxLbs: 5_000,
    assetId: 'fish_blobfish_burnout',
    emoji: '🫧',
    joke: 'Running on fumes.',
  },

  // --- Epic Grab ---------------------------------------------------------
  {
    id: 'lantern_of_lore',
    name: 'Lantern of Lore',
    tier: 'epic',
    minLbs: 7_000,
    maxLbs: 10_000,
    assetId: 'fish_lantern_of_lore',
    emoji: '🐟',
  },
  {
    id: 'octo_tutor',
    name: 'Octo-Tutor',
    tier: 'epic',
    minLbs: 10_000,
    maxLbs: 15_000,
    assetId: 'fish_octo_tutor',
    emoji: '🐙',
  },
  {
    id: 'thesis_tuna',
    name: 'Thesis Tuna',
    tier: 'epic',
    minLbs: 12_000,
    maxLbs: 20_000,
    assetId: 'fish_thesis_tuna',
    emoji: '🐠',
  },
  {
    id: 'donut_blobfish',
    name: 'Donut Blobfish',
    tier: 'epic',
    minLbs: 13_000,
    maxLbs: 25_000,
    assetId: 'fish_donut_blobfish',
    emoji: '🍩',
  },

  // --- Catch of the Day --------------------------------------------------
  {
    id: 'synapse_narwhal',
    name: 'Synapse Narwhal',
    tier: 'cotd',
    minLbs: 25_000,
    maxLbs: 50_000,
    assetId: 'fish_synapse_narwhal',
    emoji: '🐳',
  },
  {
    id: 'scholar_sturgeon',
    name: 'Scholar Sturgeon',
    tier: 'cotd',
    minLbs: 50_000,
    maxLbs: 100_000,
    assetId: 'fish_scholar_sturgeon',
    emoji: '🐟',
  },
  {
    id: 'megalodon_of_midterms',
    name: 'Mega-Lodon of Midterms',
    tier: 'cotd',
    minLbs: 250_000,
    maxLbs: 500_000,
    assetId: 'fish_megalodon_midterms',
    emoji: '🦈',
  },

  // --- Angler's Legend ----------------------------------------------------
  {
    id: 'spaced_leviathan',
    name: 'The Spaced Leviathan',
    tier: 'legend',
    minLbs: 500_000,
    maxLbs: 700_000,
    assetId: 'fish_spaced_leviathan',
    emoji: '🐉',
  },
  {
    id: 'golden_grade_koi',
    name: 'Golden Grade Koi',
    tier: 'legend',
    minLbs: 750_000,
    maxLbs: 1_000_000,
    assetId: 'fish_golden_grade_koi',
    emoji: '🐠',
  },
  {
    id: 'teachers_ufo',
    name: "Teacher's UFO",
    tier: 'legend',
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
    assetId: 'fish_teachers_ufo',
    emoji: '🛸',
  },
  {
    id: 'pumpkin_kraken',
    name: 'Pumpkin Kraken',
    tier: 'legend',
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
    assetId: 'fish_pumpkin_kraken',
    emoji: '🎃',
    seasonal: 'halloween',
  },
  {
    id: 'frost_whale',
    name: 'Frost Whale',
    tier: 'legend',
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
    assetId: 'fish_frost_whale',
    emoji: '❄️',
    seasonal: 'winter',
  },

  ...CRITTERS.map(critterCatch),
];

/** The definition of a tier. */
export function tierDefinition(tier: CatchTier): CatchTierDef {
  const definition = CATCH_TIERS.find((entry) => entry.id === tier);
  if (definition === undefined) {
    throw new Error(`Unknown catch tier: ${tier}`);
  }
  return definition;
}

/** Options for {@link catchesOfTier}. */
export interface CatchPoolOptions {
  /** The season; seasonal catches are only included when it matches. */
  season?: FishingSeason | null;
  /** Whether critter catches are part of the pool. Default `false`. */
  includeCritters?: boolean;
}

/**
 * Every catch of a tier.
 *
 * Critter catches are excluded by default because they are only rolled by
 * the special table (§8), and seasonal catches only show up in their season.
 */
export function catchesOfTier(tier: CatchTier, options: CatchPoolOptions = {}): CatchDef[] {
  const season = options.season ?? null;
  const includeCritters = options.includeCritters ?? false;

  return CATCHES.filter((entry) => {
    if (entry.tier !== tier) {
      return false;
    }
    if (entry.critterId !== undefined && !includeCritters) {
      return false;
    }
    if (entry.seasonal !== undefined && entry.seasonal !== season) {
      return false;
    }
    return true;
  });
}

/** Looks a catch up by id. */
export function findCatch(id: string): CatchDef | undefined {
  return CATCHES.find((entry) => entry.id === id);
}

/** Looks a catch up by the critter it belongs to. */
export function findCritterCatch(critterId: string): CatchDef | undefined {
  return CATCHES.find((entry) => entry.critterId === critterId);
}

/** Formats a weight the way the HUD and the reveal card show it. */
export function formatLbs(lbs: number): string {
  return `${Math.round(lbs).toLocaleString('en-US')} lbs`;
}
