/**
 * The catch catalogue of the fishing mode (docs/design/fishing.md §6 and §7).
 *
 * The mode catches **critters**, not fish: every tier of the ladder is
 * filled with the critters of the packs that are on sale, mapped by their
 * rarity (a common critter is an "Easy One", a legendary one is an
 * "Angler's Legend"). The bottom of the ladder is junk and the "Special"
 * slice is the table of the specials (a new lure, the frenzy, a powerup, a
 * pack ticket).
 *
 * The data lives in the content registries (`src/content/critters.ts`,
 * `src/content/junk.ts`, `src/content/fish.ts`, `src/content/heavy.ts`),
 * this module only turns it into the catches of the mode. See
 * `docs/ADDING-CONTENT.md`.
 */

import { CRITTERS, type CritterDef, type CritterRarity } from '../content/critters';
import { FISHES, type FishDef } from '../content/fish';
import { HEAVY, type HeavyDef } from '../content/heavy';
import { JUNK, type JunkDef } from '../content/junk';
import {
  isAvailable,
  CATCH_TIER_ORDER,
  type CatchTier,
  type ContentSeason,
  type ContentType,
} from '../content/types';
import { findPack, isPackAvailable } from '../critters';
import {
  HEAVY_WIKI_ROWS,
  WIKI_TABLE,
  WIKI_TIER_TO_CATCH_TIER,
  isTierAvailableAt,
  wikiRowByName,
  wikiRowForIndex,
  type WikiRow,
} from './wiki';

/** The seven rarity tiers of a catch, from the most common to the rarest. */
export type { CatchTier } from '../content/types';

/** The tiers in ladder order. */
export { CATCH_TIER_ORDER };

/** The seasons that unlock extra catches. */
export type FishingSeason = ContentSeason;

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
 * The tier ladder of §6, taken from the Blooket wiki table.
 *
 * The weight ranges are the tier wide ranges; every individual catch narrows
 * them down to the row it was assigned to. The heavy catches are the Legend
 * row: there is no separate "Heavy Catch" tier any more.
 */
export const CATCH_TIERS: readonly CatchTierDef[] = [
  { id: 'trash', name: 'Trash', color: '#8d6e63', minLbs: 1, maxLbs: 10 },
  { id: 'easy', name: 'Easy One', color: '#9e9e9e', minLbs: 10, maxLbs: 100 },
  { id: 'great', name: 'Great Catch', color: '#43a047', minLbs: 75, maxLbs: 750 },
  { id: 'rare', name: 'Rare Find', color: '#1e88e5', minLbs: 500, maxLbs: 5_000 },
  { id: 'epic', name: 'Epic Grab', color: '#e53935', minLbs: 7_000, maxLbs: 30_000 },
  { id: 'cotd', name: 'Catch of the Day', color: '#fb8c00', minLbs: 25_000, maxLbs: 500_000 },
  { id: 'legend', name: "Angler's Legend", color: '#8e24aa', minLbs: 500_000, maxLbs: 2_500_000 },
];

/**
 * The biggest share of the catalogue the Legend tier may take, in percent.
 *
 * The wiki's Legend rows are rarer than the rest; the cap keeps the heavy
 * catches rare (at most ~2 %) even at the highest lure rank.
 */
export const LEGEND_MAX_SHARE = 2;

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
  /** The art key of the catch (the file name of the PNG). */
  assetId: string;
  /** Emoji shown when the sprite is not available yet. */
  emoji: string;
  /** The Blook of the wiki row the catch is mapped to. */
  wikiName: string;
  /** The chance of fishing of the wiki row, at the first lure that can catch it. */
  chance: number;
  /** The kind of content the catch is (a critter, junk, a fish or a heavy catch). */
  contentType: ContentType;
  /** A one line joke for the silly catches. */
  joke?: string;
  /** The season this catch is only available in. */
  seasonal?: FishingSeason;
  /** The critter this catch is (critter catches only). */
  critterId?: string;
  /** The pack the critter of this catch comes from (critter catches only). */
  packId?: string;
  /** Epoch milliseconds; `null` (or missing) means "always". */
  availableFrom?: number | null;
  /** Epoch milliseconds (exclusive); `null` (or missing) means "always". */
  availableUntil?: number | null;
}

/**
 * The tier a critter rarity shows up as when it swims onto the line.
 *
 * The five rarities of the packs fill the five critter tiers of the wiki: a
 * legendary critter is a Catch of the Day. The Angler's Legend tier belongs to
 * the heavy catches.
 */
export const CRITTER_TIER: Readonly<Record<CritterRarity, CatchTier>> = {
  common: 'easy',
  uncommon: 'great',
  rare: 'rare',
  epic: 'epic',
  legendary: 'cotd',
};

/**
 * The wiki row index of every critter of its tier.
 *
 * The critters of a tier take the rows of the wiki in order, so the first
 * common critter takes the first Easy One row, the second takes the second
 * row, and so on (the rows are cycled when there are more catches).
 */
const CRITTER_WIKI_INDEX: ReadonlyMap<string, number> = (() => {
  const seen = new Map<CritterRarity, number>();
  const index = new Map<string, number>();

  for (const critter of CRITTERS) {
    const next = seen.get(critter.rarity) ?? 0;
    index.set(critter.id, next);
    seen.set(critter.rarity, next + 1);
  }

  return index;
})();

/** The wiki row of a critter. */
function critterWikiRow(critter: CritterDef): WikiRow {
  return wikiRowForIndex(CRITTER_TIER[critter.rarity], CRITTER_WIKI_INDEX.get(critter.id) ?? 0);
}

/** Turns a junk item into a catch of the "Trash" tier. */
function junkCatch(junk: JunkDef, index: number): CatchDef {
  const row = wikiRowForIndex('trash', index);
  return {
    id: junk.id,
    name: junk.name,
    tier: junk.tier,
    minLbs: junk.minLbs,
    maxLbs: junk.maxLbs,
    assetId: junk.assetId,
    emoji: junk.emoji,
    wikiName: row.name,
    chance: row.chance,
    contentType: 'junk',
    ...(junk.joke === undefined ? {} : { joke: junk.joke }),
    ...(junk.seasonal === undefined ? {} : { seasonal: junk.seasonal }),
    ...(junk.availableFrom === undefined ? {} : { availableFrom: junk.availableFrom }),
    ...(junk.availableUntil === undefined ? {} : { availableUntil: junk.availableUntil }),
  };
}

/**
 * Turns a critter into a catch: it swims up on the tier of its rarity with
 * the weight range of its wiki row.
 */
function critterCatch(critter: CritterDef): CatchDef {
  const row = critterWikiRow(critter);
  return {
    id: `critter_${critter.id}`,
    name: critter.name,
    tier: WIKI_TIER_TO_CATCH_TIER[row.tier],
    minLbs: row.minLbs,
    maxLbs: row.maxLbs,
    assetId: critter.assetId,
    emoji: critter.emoji,
    wikiName: row.name,
    chance: row.chance,
    contentType: 'critter',
    critterId: critter.id,
    packId: critter.packId,
    ...(critter.availableFrom === undefined ? {} : { availableFrom: critter.availableFrom }),
    ...(critter.availableUntil === undefined ? {} : { availableUntil: critter.availableUntil }),
  };
}

/**
 * Turns a fish into a catch: it swims up on its tier and weighs as much as
 * the tier says.
 */
/* v8 ignore next -- the fish registry is empty until the first fish is added */
function fishCatch(fish: FishDef): CatchDef {
  return {
    id: fish.id,
    name: fish.name,
    tier: fish.tier,
    minLbs: fish.minLbs,
    maxLbs: fish.maxLbs,
    assetId: fish.assetId,
    emoji: fish.emoji,
    wikiName: fish.name,
    chance: 100,
    contentType: 'fish',
    ...(fish.joke === undefined ? {} : { joke: fish.joke }),
    ...(fish.seasonal === undefined ? {} : { seasonal: fish.seasonal }),
    ...(fish.availableFrom === undefined ? {} : { availableFrom: fish.availableFrom }),
    ...(fish.availableUntil === undefined ? {} : { availableUntil: fish.availableUntil }),
  };
}

/**
 * Turns a heavy catch into a catch of the Angler's Legend tier.
 *
 * A heavy catch is a normal catch of the ladder: it has a weight range, an
 * art key and a joke. The tier makes it rare and worth a token bonus.
 */
function heavyCatch(heavy: HeavyDef): CatchDef {
  const row = wikiRowByName(HEAVY_WIKI_ROWS[heavy.id] ?? 'UFO');
  return {
    id: `heavy_${heavy.id}`,
    name: heavy.name,
    tier: 'legend',
    minLbs: heavy.minLbs,
    maxLbs: heavy.maxLbs,
    assetId: heavy.assetId,
    emoji: heavy.emoji,
    wikiName: row.name,
    chance: row.chance,
    contentType: 'heavy',
    ...(heavy.joke === undefined ? {} : { joke: heavy.joke }),
    ...(heavy.seasonal === undefined ? {} : { seasonal: heavy.seasonal }),
    ...(heavy.availableFrom === undefined ? {} : { availableFrom: heavy.availableFrom }),
    ...(heavy.availableUntil === undefined ? {} : { availableUntil: heavy.availableUntil }),
  };
}

/**
 * Every catch of the game.
 *
 * The catalogue holds the junk of the bottom tier, the fish of the future
 * registry, the heavy catches of the deep end of the lake and every critter
 * of the catalogue. The critters of a pack that is not on sale are in the
 * catalogue too, but they never show up in a pool (see
 * {@link isCatchAvailable}).
 */
export const CATCHES: readonly CatchDef[] = [
  ...JUNK.map(junkCatch),
  ...FISHES.map(fishCatch),
  ...HEAVY.map(heavyCatch),
  ...CRITTERS.map(critterCatch),
];

/** Every catch that can be caught at a lure rank (and at `now`). */
export function catchesForRank(rank: number, options: CatchPoolOptions = {}): CatchDef[] {
  const season = options.season ?? null;
  const now = options.now ?? Date.now();
  const includeCritters = options.includeCritters ?? true;

  return CATCHES.filter((entry) => {
    if (!isTierAvailableAt(entry.tier, rank)) {
      return false;
    }
    if (entry.critterId !== undefined && !includeCritters) {
      return false;
    }
    if (entry.seasonal !== undefined && entry.seasonal !== season) {
      return false;
    }
    return isCatchAvailable(entry, now);
  });
}

/** One catch with its wiki chance and its probability at a lure rank. */
export interface CatchOdds {
  catch: CatchDef;
  /** The chance of fishing of the wiki row (at its first lure), in percent. */
  chance: number;
  /** The normalized chance at the lure rank, in percent. */
  probability: number;
}

/**
 * The chance of every catch at a lure rank, in percent.
 *
 * The catches of the tier that the lure can catch keep their wiki chance as a
 * weight and are renormalized to 100 %. The Legend tier is capped at
 * {@link LEGEND_MAX_SHARE} (2 %) so a heavy catch stays rare even at the best
 * lure.
 */
export function catchOddsForRank(rank: number, options: CatchPoolOptions = {}): CatchOdds[] {
  const pool = catchesForRank(rank, options);
  if (pool.length === 0) {
    return [];
  }

  const weights = pool.map((entry) => entry.chance);
  capLegendWeight(pool, weights);

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  /* v8 ignore next -- the wiki chance of every row is positive */
  const divisor = total > 0 ? total : 1;

  return pool.map((entry, index) => ({
    catch: entry,
    chance: entry.chance,
    probability: (weights[index] ?? 0) / divisor * 100,
  }));
}

/**
 * Scales the Legend weights down when they would take more than
 * {@link LEGEND_MAX_SHARE} of the catches. The rest of the table keeps its
 * relative weights.
 */
function capLegendWeight(pool: readonly CatchDef[], weights: number[]): void {
  const legendIndices: number[] = [];
  let legendTotal = 0;
  let otherTotal = 0;

  for (let index = 0; index < pool.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (pool[index]?.tier === 'legend') {
      legendIndices.push(index);
      legendTotal += weight;
    } else {
      otherTotal += weight;
    }
  }

  if (legendIndices.length === 0 || legendTotal <= 0 || otherTotal <= 0) {
    return;
  }

  const share = legendTotal / (legendTotal + otherTotal) * 100;
  if (share <= LEGEND_MAX_SHARE) {
    return;
  }

  // The Legend share has to be cap / (100 - cap) of the rest of the table.
  const target = otherTotal * (LEGEND_MAX_SHARE / (100 - LEGEND_MAX_SHARE));
  const scale = target / legendTotal;
  for (const index of legendIndices) {
    weights[index] = (weights[index] ?? 0) * scale;
  }
}

/** The number of wiki rows, for the mapping table of the design doc. */
export const WIKI_ROW_COUNT = WIKI_TABLE.length;

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
  /**
   * The time the pool is built for (epoch milliseconds).
   *
   * It decides which packs are on sale, so a critter of a seasonal pack only
   * swims up while its pack is available. Defaults to `Date.now()`.
   */
  now?: number;
  /** Whether the critter catches are part of the pool. Default `true`. */
  includeCritters?: boolean;
}

/**
 * Whether the catch is available at `now`.
 *
 * A catch is available when its own window allows it and, for a critter,
 * when the pack it belongs to is on sale.
 */
export function isCatchAvailable(entry: CatchDef, now: number): boolean {
  if (!isAvailable(entry, now)) {
    return false;
  }
  if (entry.packId === undefined) {
    return true;
  }
  const pack = findPack(entry.packId);
  return pack !== undefined && isPackAvailable(pack, now);
}

/**
 * Every catch of a tier.
 *
 * The critters of a pack that is not on sale are left out, and seasonal
 * catches only show up in their season.
 */
export function catchesOfTier(tier: CatchTier, options: CatchPoolOptions = {}): CatchDef[] {
  const season = options.season ?? null;
  const now = options.now ?? Date.now();
  const includeCritters = options.includeCritters ?? true;

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
    return isCatchAvailable(entry, now);
  });
}

/**
 * The pool a tier rolls from.
 *
 * A tier without any catch (the "Catch of the Day" tier has no critter
 * yet) falls back to the closest tier of the ladder that has one, so the
 * game never dead ends.
 */
export function catchPool(tier: CatchTier, options: CatchPoolOptions = {}): CatchDef[] {
  const pool = catchesOfTier(tier, options);
  if (pool.length > 0) {
    return pool;
  }

  const index = CATCH_TIER_ORDER.indexOf(tier);
  for (let offset = 1; offset < CATCH_TIER_ORDER.length; offset += 1) {
    const candidates = [CATCH_TIER_ORDER[index + offset], CATCH_TIER_ORDER[index - offset]];
    for (const candidate of candidates) {
      if (candidate === undefined) {
        continue;
      }
      const fallback = catchesOfTier(candidate, options);
      if (fallback.length > 0) {
        return fallback;
      }
    }
  }

  return [];
}

/** Looks a catch up by id. */
export function findCatch(id: string): CatchDef | undefined {
  return CATCHES.find((entry) => entry.id === id);
}

/** Looks a catch up by the critter it belongs to. */
export function findCritterCatch(critterId: string): CatchDef | undefined {
  return CATCHES.find((entry) => entry.critterId === critterId);
}

/**
 * Formats a weight the way the HUD and the reveal card show it.
 *
 * The ladder climbs to millions of pounds, so the big catches are shown
 * compactly ("3.3k lbs", "1.2M lbs") and the small ones keep their digits.
 */
export function formatLbs(lbs: number): string {
  const rounded = Math.round(lbs);

  if (Math.abs(rounded) >= 1_000_000) {
    return `${trimZero((rounded / 1_000_000).toFixed(1))}M lbs`;
  }
  if (Math.abs(rounded) >= 1_000) {
    return `${trimZero((rounded / 1_000).toFixed(1))}k lbs`;
  }
  return `${rounded.toLocaleString('en-US')} lbs`;
}

/** Drops the ".0" of a compact weight ("1.0M" -> "1M"). */
function trimZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}
