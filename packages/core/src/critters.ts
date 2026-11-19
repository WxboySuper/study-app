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
 *
 * The data itself lives in the content registries (`src/content/critters.ts`
 * and `src/content/packs.ts`); this module holds the lookups and re-exports
 * the registries, so nothing that imports `@study-app/core` breaks.
 */

import { CRITTERS, type CritterDef, type CritterRarity } from './content/critters';
import { CRITTER_PACKS, type CritterPackDef } from './content/packs';
import { isAvailable } from './content/types';

export {
  CRITTER_RARITIES,
  CRITTER_RARITY_ODDS,
  CRITTERS,
  type CritterDef,
  type CritterRarity,
} from './content/critters';

export {
  CRITTER_PACKS,
  HALLOWEEN_PACK_ID,
  THANKSGIVING_PACK_ID,
  WINTER_PACK_ID,
  FLIGHT_PACK_ID,
  STARTER_PACK_ID,
  type CritterPackDef,
  type PackKind,
} from './content/packs';

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
  return isAvailable(pack, now);
}
