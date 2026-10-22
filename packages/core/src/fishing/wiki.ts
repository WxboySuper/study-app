/**
 * The Blooket Fishing Frenzy catch table (docs/design/fishing.md §6).
 *
 * The wiki table is the source of the weights, the tier availability and the
 * chance of every catch:
 *
 * https://blooket.fandom.com/wiki/Fishing_Frenzy (checked Oct 22, 2026)
 *
 * Our catches are mapped onto the rows of the table:
 *
 * - junk -> Trash;
 * - critters by rarity -> Easy One, Great Catch, Rare Find, Epic Grab and
 *   Catch of the Day;
 * - heavy catches -> Angler's Legend.
 *
 * A tier is only catchable with the lures the wiki lists for it. The lure
 * ranks of the game are F, D, C, B and A/S (1-5); the Frenzy is S+ (rank 6).
 */

import type { CatchTier } from '../content/types';

/** The tiers of the wiki table. */
export type WikiTier =
  | 'Trash'
  | 'Easy One'
  | 'Great Catch'
  | 'Rare Find'
  | 'Epic Grab'
  | 'Catch of the Day'
  | "Angler's Legend";

/** One row of the wiki table. */
export interface WikiRow {
  /** The Blook of the row. */
  name: string;
  tier: WikiTier;
  /** The lures that can catch the Blook, as written on the wiki. */
  lures: string;
  /** The chance of fishing at the first lure that can catch it, in percent. */
  chance: number;
  /** The lightest weight of the row, in lbs. */
  minLbs: number;
  /** The heaviest weight of the row, in lbs. */
  maxLbs: number;
}

/** The wiki table, row by row, exactly as the wiki lists it. */
export const WIKI_TABLE: readonly WikiRow[] = [
  { name: 'Old Boot', tier: 'Trash', lures: 'F,D,C', chance: 15, minLbs: 1, maxLbs: 10 },
  { name: 'Waffle', tier: 'Trash', lures: 'F,D,C', chance: 5, minLbs: 1, maxLbs: 10 },
  { name: 'Two of Spades', tier: 'Trash', lures: 'F,D,C', chance: 5, minLbs: 1, maxLbs: 10 },

  { name: 'Jellyfish', tier: 'Easy One', lures: 'D,C,B', chance: 15, minLbs: 10, maxLbs: 25 },
  { name: 'Clownfish', tier: 'Easy One', lures: 'D,C,B', chance: 15, minLbs: 20, maxLbs: 45 },
  { name: 'Goldfish', tier: 'Easy One', lures: 'D,C,B', chance: 10, minLbs: 30, maxLbs: 65 },
  { name: 'Frog', tier: 'Easy One', lures: 'D,C,B', chance: 15, minLbs: 50, maxLbs: 100 },

  { name: 'Blizzard Clownfish', tier: 'Great Catch', lures: 'D,C,B', chance: 5, minLbs: 75, maxLbs: 125 },
  { name: 'Turtle', tier: 'Great Catch', lures: 'D-A', chance: 5, minLbs: 100, maxLbs: 150 },
  { name: 'Cat', tier: 'Great Catch', lures: 'D-A', chance: 5, minLbs: 100, maxLbs: 200 },
  { name: 'Lovely Frog', tier: 'Great Catch', lures: 'D-A', chance: 2, minLbs: 150, maxLbs: 350 },
  { name: 'Lucky Frog', tier: 'Great Catch', lures: 'D-A', chance: 2, minLbs: 150, maxLbs: 350 },
  { name: 'Poison Dart Frog', tier: 'Great Catch', lures: 'D-A', chance: 1, minLbs: 250, maxLbs: 750 },

  { name: 'Seal', tier: 'Rare Find', lures: 'D-A', chance: 7, minLbs: 500, maxLbs: 1_000 },
  { name: 'Walrus', tier: 'Rare Find', lures: 'D-A', chance: 7, minLbs: 700, maxLbs: 2_200 },
  { name: 'Crab', tier: 'Rare Find', lures: 'D-A', chance: 10, minLbs: 1_000, maxLbs: 2_500 },
  { name: 'Fairy', tier: 'Rare Find', lures: 'D-A', chance: 2, minLbs: 1_500, maxLbs: 3_000 },
  { name: 'Pufferfish', tier: 'Rare Find', lures: 'D-A', chance: 7, minLbs: 2_000, maxLbs: 4_000 },
  { name: 'Lemon Crab', tier: 'Rare Find', lures: 'D-A', chance: 5, minLbs: 3_000, maxLbs: 5_000 },
  { name: 'Blobfish', tier: 'Rare Find', lures: 'D-A', chance: 5, minLbs: 3_000, maxLbs: 5_000 },

  { name: 'Rainbow Jellyfish', tier: 'Epic Grab', lures: 'C,B,A', chance: 8, minLbs: 7_000, maxLbs: 10_000 },
  { name: 'Octopus', tier: 'Epic Grab', lures: 'C,B,A', chance: 15, minLbs: 10_000, maxLbs: 15_000 },
  { name: 'Pirate Pufferfish', tier: 'Epic Grab', lures: 'C,B,A', chance: 8, minLbs: 12_000, maxLbs: 20_000 },
  { name: 'Donut Blobfish', tier: 'Epic Grab', lures: 'C,B,A', chance: 8, minLbs: 13_000, maxLbs: 25_000 },
  { name: 'Crimson Octopus', tier: 'Epic Grab', lures: 'B,A', chance: 5, minLbs: 15_000, maxLbs: 30_000 },

  { name: 'Narwhal', tier: 'Catch of the Day', lures: 'B,A,S', chance: 8, minLbs: 25_000, maxLbs: 50_000 },
  { name: 'Baby Shark', tier: 'Catch of the Day', lures: 'B,A,S', chance: 7, minLbs: 50_000, maxLbs: 100_000 },
  { name: 'Megalodon', tier: 'Catch of the Day', lures: 'B,A,S', chance: 6, minLbs: 250_000, maxLbs: 500_000 },

  { name: 'Alien', tier: "Angler's Legend", lures: 'A,S', chance: 1.2, minLbs: 500_000, maxLbs: 700_000 },
  {
    name: 'Rainbow Narwhal',
    tier: "Angler's Legend",
    lures: 'A,S,S+',
    chance: 4.25,
    minLbs: 750_000,
    maxLbs: 1_000_000,
  },
  { name: 'UFO', tier: "Angler's Legend", lures: 'A,S,S+', chance: 1, minLbs: 1_000_000, maxLbs: 2_000_000 },
  {
    name: 'Santa Claus',
    tier: "Angler's Legend",
    lures: 'A,S,S+',
    chance: 0.1,
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
  },
  {
    name: 'Swamp Monster',
    tier: "Angler's Legend",
    lures: 'A,S,S+',
    chance: 0.1,
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
  },
  {
    name: 'Red Astronaut',
    tier: "Angler's Legend",
    lures: 'A,S,S+',
    chance: 0.1,
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
  },
  {
    name: 'Spooky Pumpkin',
    tier: "Angler's Legend",
    lures: 'A,S,S+',
    chance: 0.1,
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
  },
  {
    name: 'Dragon',
    tier: "Angler's Legend",
    lures: 'A,S,S+',
    chance: 0.1,
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
  },
  {
    name: 'Tim the Alien',
    tier: "Angler's Legend",
    lures: 'A,S,S+',
    chance: 0.05,
    minLbs: 1_500_000,
    maxLbs: 2_500_000,
  },
];

/** The game tier of every wiki tier. */
export const WIKI_TIER_TO_CATCH_TIER: Readonly<Record<WikiTier, CatchTier>> = {
  Trash: 'trash',
  'Easy One': 'easy',
  'Great Catch': 'great',
  'Rare Find': 'rare',
  'Epic Grab': 'epic',
  'Catch of the Day': 'cotd',
  "Angler's Legend": 'legend',
};

/**
 * The lure ranks a tier is catchable with.
 *
 * Rank 1-5 are the lures F, D, C, B and A/S. Rank 6 is the Frenzy (S+).
 */
export const TIER_LURE_RANKS: Readonly<Record<CatchTier, readonly number[]>> = {
  trash: [1, 2, 3],
  easy: [2, 3, 4],
  great: [2, 3, 4, 5, 6],
  rare: [2, 3, 4, 5, 6],
  epic: [3, 4, 5, 6],
  cotd: [4, 5, 6],
  legend: [5, 6],
};

/** The highest rank a catch can be rolled at (the Frenzy is rank 6). */
export const MAX_ROLL_RANK = 6;

/** Whether a tier can be caught at a lure rank. */
export function isTierAvailableAt(tier: CatchTier, rank: number): boolean {
  const ranks = TIER_LURE_RANKS[tier];
  return ranks.includes(clampRollRank(rank));
}

/** Clamps a rank into the range of the table. */
export function clampRollRank(rank: number): number {
  if (!Number.isFinite(rank)) {
    return 1;
  }
  return Math.min(MAX_ROLL_RANK, Math.max(1, Math.round(rank)));
}

/** Every row of a tier, in wiki order. */
export function wikiRowsOfTier(tier: CatchTier): WikiRow[] {
  return WIKI_TABLE.filter((row) => WIKI_TIER_TO_CATCH_TIER[row.tier] === tier);
}

/**
 * The weight of a tier: the sum of the chances of its wiki rows.
 *
 * The tier odds are derived from these weights, so they follow the table
 * instead of a hand-written table that drifts away from it.
 */
export function wikiTierWeight(tier: CatchTier): number {
  return wikiRowsOfTier(tier).reduce((sum, row) => sum + row.chance, 0);
}

/** Every tier that can be caught at a lure rank, in ladder order. */
export function wikiTiersForRank(rank: number): CatchTier[] {
  const order: CatchTier[] = ['trash', 'easy', 'great', 'rare', 'epic', 'cotd', 'legend'];
  return order.filter((tier) => isTierAvailableAt(tier, rank));
}

/**
 * The row a catch of a tier takes when catches are assigned in order.
 *
 * The wiki has fewer rows than we have catches (and more, for some tiers),
 * so the rows are cycled. A catch always keeps the weight range of the row
 * it was assigned to.
 */
export function wikiRowForIndex(tier: CatchTier, index: number): WikiRow {
  const rows = wikiRowsOfTier(tier);
  const row = rows[index % rows.length];
  /* v8 ignore next -- every tier of the catalogue has at least one row */
  if (row === undefined) {
    throw new Error(`The wiki has no row for the tier: ${tier}`);
  }
  return row;
}

/** The row of a heavy catch, by id. */
export const HEAVY_WIKI_ROWS: Readonly<Record<string, string>> = {
  galaxy_fish: 'Alien',
  golden_koi: 'Rainbow Narwhal',
  ice_fish: 'UFO',
  skeleton_fish: 'Swamp Monster',
  swamp_monster: 'Swamp Monster',
  treasure_chest: 'Tim the Alien',
  void_fish: 'UFO',
};

/** Looks a wiki row up by the name of its Blook. */
export function wikiRowByName(name: string): WikiRow {
  const row = WIKI_TABLE.find((entry) => entry.name === name);
  if (row === undefined) {
    throw new Error(`Unknown wiki row: ${name}`);
  }
  return row;
}
