/**
 * The content registries of the game.
 *
 * Every content type of the app has its own data file in this folder:
 *
 * - `critters.ts`: the collectible characters (SPEC §3).
 * - `packs.ts`: the packs the critters live in (SPEC §3).
 * - `junk.ts`: the "Trash" tier of the fishing mode.
 * - `heavy.ts`: the "Heavy Catch" tier of the fishing mode.
 * - `specials.ts`: the "Special" slice of the fishing mode (and the powerups).
 * - `fish.ts`: the fish registry of the future (typed, empty for now).
 *
 * The logic files (the shop, the collection, the fishing mode) only import
 * these registries, so adding content is a data change: an image plus one
 * entry, never a logic change.
 *
 * See `docs/ADDING-CONTENT.md`.
 */

export * from './critters';
export * from './fish';
export * from './heavy';
export * from './junk';
export * from './packs';
export * from './specials';
export * from './types';

import { CRITTERS } from './critters';
import { FISHES } from './fish';
import { HEAVY } from './heavy';
import { JUNK } from './junk';
import { POWERUPS, SPECIALS } from './specials';
import type { ContentType } from './types';

/**
 * The type of the content an art key belongs to.
 *
 * The art resolver of the app uses it to pick the placeholder of a missing
 * image. An unknown key falls back to the "special" placeholder.
 */
export function contentTypeOf(assetId: string): ContentType {
  if (CRITTERS.some((entry) => entry.assetId === assetId)) {
    return 'critter';
  }
  if (JUNK.some((entry) => entry.assetId === assetId)) {
    return 'junk';
  }
  if (FISHES.some((entry) => entry.assetId === assetId)) {
    return 'fish';
  }
  if (HEAVY.some((entry) => entry.assetId === assetId)) {
    return 'heavy';
  }
  if (
    SPECIALS.some((entry) => entry.assetId === assetId) ||
    POWERUPS.some((entry) => entry.assetId === assetId)
  ) {
    return 'special';
  }
  return 'special';
}
