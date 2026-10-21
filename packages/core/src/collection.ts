/**
 * The critter collection (docs/SPEC.md §3 and "Economy tuning").
 *
 * The collection is the map of the critters the player owns and how many
 * copies of every critter there are. Duplicates can be sold for tokens, but
 * the last copy of a critter can never be sold: the collection is the trophy
 * shelf, the duplicates are the pocket change.
 *
 * Everything here is pure: the caller keeps the collection and writes the
 * result back (in one transaction, see `apps/mobile/src/db/packs.ts`).
 */

import { findCritter, type CritterDef, type CritterRarity } from './critters';
import type { PackDef } from './packs';

/**
 * What one duplicate of a critter is worth (SPEC "Economy tuning").
 *
 * The values scale with the rarity of the critter and follow the Blooket
 * scale (Common 5, Uncommon 10, Rare 20, Epic 75, Legendary 200): every
 * value is a multiple of 5, like every pack price and every prize of the
 * daily wheel.
 *
 * Selling is never a way to farm: the expected value of one pack (the sum
 * of the odds of the rarities times their sell value) stays below the price
 * of that pack, so opening a pack is always the better deal.
 *
 * Sources: https://blooket.fandom.com/wiki/Blooks and
 * https://blooket.fandom.com/wiki/Packs
 */
export const CRITTER_SELL_VALUES: Readonly<Record<CritterRarity, number>> = {
  common: 5,
  uncommon: 10,
  rare: 20,
  epic: 75,
  legendary: 200,
};

/** The smallest amount of tokens a price or a reward is allowed to be. */
export const TOKEN_STEP = 5;

/** Whether a price or a reward is a whole number of "token steps". */
export function isTokenMultiple(value: number): boolean {
  return Number.isFinite(value) && value % TOKEN_STEP === 0;
}

/** How many of every critter the player owns. */
export type Collection = ReadonlyMap<string, number>;

/** The sell value of one copy of a critter (0 for an unknown critter). */
export function critterSellValue(critterId: string): number {
  const critter = findCritter(critterId);
  return critter === undefined ? 0 : CRITTER_SELL_VALUES[critter.rarity];
}

/** One critter of the collection. */
export interface CollectionEntry {
  /** The critter of the catalogue. */
  critter: CritterDef;
  /** How many copies the player owns. */
  count: number;
  /** How many copies can be sold (the last copy never can). */
  duplicates: number;
  /** What one duplicate is worth. */
  sellValue: number;
}

/** Reads one critter of the collection. */
export function collectionEntry(
  collection: Collection,
  critterId: string,
): CollectionEntry | undefined {
  const critter = findCritter(critterId);
  if (critter === undefined) {
    return undefined;
  }

  const count = collection.get(critterId) ?? 0;
  return {
    critter,
    count,
    duplicates: Math.max(0, count - 1),
    sellValue: CRITTER_SELL_VALUES[critter.rarity],
  };
}

/** How much of a pack the player owns. */
export interface CollectionProgress {
  /** How many critters of the pack the player owns (at least one copy). */
  owned: number;
  /** How many critters the pack holds. */
  total: number;
}

/** How much of a pack the player owns. */
export function collectionProgress(collection: Collection, pack: PackDef): CollectionProgress {
  let owned = 0;
  for (const critter of pack.critters) {
    if ((collection.get(critter.id) ?? 0) > 0) {
      owned += 1;
    }
  }
  return { owned, total: pack.critters.length };
}

/** The result of selling duplicates. */
export interface SellResult {
  /** The critter that was sold. */
  critterId: string;
  /** How many copies were sold. */
  sold: number;
  /** The tokens that were gained. */
  tokens: number;
  /** The collection after the sale. */
  collection: Map<string, number>;
}

/**
 * Sells `qty` duplicates of a critter.
 *
 * The last copy of a critter is never sold, so at most `count - 1` copies
 * can be sold. A quantity that is too big is clamped, and a critter the
 * player does not own (or owns only once) sells nothing.
 */
export function sellDuplicate(collection: Collection, critterId: string, qty: number): SellResult {
  const next = new Map(collection);
  const count = next.get(critterId) ?? 0;
  const sellValue = critterSellValue(critterId);

  const sellable = Math.max(0, count - 1);
  const wanted = Number.isFinite(qty) ? Math.floor(qty) : 0;
  const sold = Math.min(Math.max(0, wanted), sellable);

  if (sold > 0) {
    next.set(critterId, count - sold);
  }

  return { critterId, sold, tokens: sold * sellValue, collection: next };
}

/** The result of selling every duplicate of the collection. */
export interface SellAllResult {
  /** How many copies of every critter were sold. */
  sold: Map<string, number>;
  /** The tokens that were gained. */
  tokens: number;
  /** The collection after the sale. */
  collection: Map<string, number>;
}

/**
 * Sells every duplicate of the collection.
 *
 * Only the copies above the first one are sold, so the player keeps one of
 * every critter they own.
 */
export function sellAllDuplicates(collection: Collection): SellAllResult {
  const next = new Map(collection);
  const sold = new Map<string, number>();
  let tokens = 0;

  for (const [critterId, count] of next) {
    const duplicates = Math.max(0, count - 1);
    if (duplicates === 0) {
      continue;
    }

    next.set(critterId, count - duplicates);
    sold.set(critterId, duplicates);
    tokens += duplicates * critterSellValue(critterId);
  }

  return { sold, tokens, collection: next };
}
