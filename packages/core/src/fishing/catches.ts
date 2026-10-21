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
 * `src/content/junk.ts`), this module only turns it into the catches of the
 * mode. See `docs/ADDING-CONTENT.md`.
 */

import { CRITTERS, type CritterDef, type CritterRarity } from '../content/critters';
import { FISHES, type FishDef } from '../content/fish';
import { JUNK, type JunkDef } from '../content/junk';
import {
  isAvailable,
  CATCH_TIER_ORDER,
  type CatchTier,
  type ContentSeason,
  type ContentType,
} from '../content/types';
import { findPack, isPackAvailable } from '../critters';

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
  /** The art key of the catch (the file name of the PNG). */
  assetId: string;
  /** Emoji shown when the sprite is not available yet. */
  emoji: string;
  /** The kind of content the catch is (a critter, junk or a fish). */
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

/** The tier a critter rarity shows up as when it swims onto the line. */
export const CRITTER_TIER: Readonly<Record<CritterRarity, CatchTier>> = {
  common: 'easy',
  uncommon: 'great',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legend',
};

/** Turns a junk item into a catch of the "Trash" tier. */
function junkCatch(junk: JunkDef): CatchDef {
  return {
    id: junk.id,
    name: junk.name,
    tier: junk.tier,
    minLbs: junk.minLbs,
    maxLbs: junk.maxLbs,
    assetId: junk.assetId,
    emoji: junk.emoji,
    contentType: 'junk',
    ...(junk.joke === undefined ? {} : { joke: junk.joke }),
    ...(junk.seasonal === undefined ? {} : { seasonal: junk.seasonal }),
    ...(junk.availableFrom === undefined ? {} : { availableFrom: junk.availableFrom }),
    ...(junk.availableUntil === undefined ? {} : { availableUntil: junk.availableUntil }),
  };
}

/**
 * Turns a critter into a catch: it swims up on the tier of its rarity and
 * weighs as much as the tier says.
 */
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
    contentType: 'fish',
    ...(fish.joke === undefined ? {} : { joke: fish.joke }),
    ...(fish.seasonal === undefined ? {} : { seasonal: fish.seasonal }),
    ...(fish.availableFrom === undefined ? {} : { availableFrom: fish.availableFrom }),
    ...(fish.availableUntil === undefined ? {} : { availableUntil: fish.availableUntil }),
  };
}

/**
 * Every catch of the game.
 *
 * The catalogue holds the junk of the bottom tier, the fish of the future
 * registry and every critter of the catalogue. The critters of a pack that
 * is not on sale are in the catalogue too, but they never show up in a pool
 * (see {@link isCatchAvailable}).
 */
export const CATCHES: readonly CatchDef[] = [
  ...JUNK.map(junkCatch),
  ...FISHES.map(fishCatch),
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

/** Formats a weight the way the HUD and the reveal card show it. */
export function formatLbs(lbs: number): string {
  return `${Math.round(lbs).toLocaleString('en-US')} lbs`;
}
