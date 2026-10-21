import { CRITTERS, type CritterDef } from '@study-app/core';
import type { ImageSourcePropType } from 'react-native';

import { artFor } from '@/content/art';

/**
 * The art of the critters (apps/mobile/assets/critters).
 *
 * The images are resolved by the art resolver of the app
 * (`src/content/art.ts`), so a critter without a PNG falls back to the
 * placeholder of its type instead of an empty hole.
 */

/** The art of every critter that has a PNG. */
export const CRITTER_ART: Readonly<Record<string, ImageSourcePropType>> = Object.fromEntries(
  CRITTERS.map((critter) => [critter.assetId, artFor(critter.assetId)]).filter(
    (entry): entry is [string, ImageSourcePropType] => entry[1] !== null,
  ),
);

/** The art of a critter, or `null` when the PNG is missing. */
export function critterArt(critter: CritterDef): ImageSourcePropType | null {
  return artFor(critter.assetId);
}

/** How many critters of the catalogue have their art. */
export const CRITTERS_WITH_ART: number = CRITTERS.filter(
  (critter) => artFor(critter.assetId) !== null,
).length;
