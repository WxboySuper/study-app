/**
 * The fish registry (the future of the fishing mode).
 *
 * The mode catches critters, junk and specials today. Fish are the next
 * content type: the registry is typed and empty, so the first fish is a data
 * change (one entry here plus one image) and not a logic change.
 *
 * A fish is a catch of the tier ladder like any other: it has a tier, a
 * weight range and an art key. The fishing mode reads the registry when it
 * builds the pool of a tier, so a fish shows up as soon as it is listed
 * here.
 *
 * See `docs/ADDING-CONTENT.md`.
 */

import type { CatchTier, ContentSeason } from './types';

/** A fish (a catch of the tier ladder). */
export interface FishDef {
  id: string;
  name: string;
  /** The tier of the catch (see `src/fishing/catches.ts`). */
  tier: CatchTier;
  /** The lightest possible weight, in lbs. */
  minLbs: number;
  /** The heaviest possible weight, in lbs. */
  maxLbs: number;
  /** The art key of the fish (the file name of the PNG). */
  assetId: string;
  /** Emoji used when the art is not available yet. */
  emoji: string;
  /** A one line joke for the silly catches. */
  joke?: string;
  /** The season this fish is only available in. */
  seasonal?: ContentSeason;
  /** Epoch milliseconds; `null` (or missing) means "always". */
  availableFrom?: number | null;
  /** Epoch milliseconds (exclusive); `null` (or missing) means "always". */
  availableUntil?: number | null;
}

/**
 * Every fish of the game.
 *
 * Empty on purpose: the mode catches critters, junk and specials. The first
 * fish is one entry plus one image.
 */
export const FISHES: readonly FishDef[] = [];
