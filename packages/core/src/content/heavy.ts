/**
 * The heavy catch registry (the "Heavy Catch" tier of the fishing mode).
 *
 * A heavy catch is the stuff that lives at the bottom of the lake: a galaxy
 * fish, a golden koi, a sunken treasure chest. They are rare (about 2 % of
 * the catches), they weigh more than any critter tier and every one of them
 * pays a token bonus at the end of the session.
 *
 * They are **not** the gameplay specials of `specials.ts`: those change the
 * session (a new lure, the frenzy, a powerup, a pack ticket), while a heavy
 * catch is a catch of the ladder with its own tier.
 *
 * Adding a heavy catch is a data change: one entry here plus one image in
 * `apps/mobile/assets/fishing/`. See `docs/ADDING-CONTENT.md`.
 */

import type { ContentSeason } from './types';

/** A heavy catch (a catch of the "Heavy Catch" tier). */
export interface HeavyDef {
  id: string;
  name: string;
  /** The tier of the catch; heavy catches are always "heavy". */
  tier: 'heavy';
  /** The lightest possible weight, in lbs. */
  minLbs: number;
  /** The heaviest possible weight, in lbs. */
  maxLbs: number;
  /** The art key of the heavy catch (the file name of the PNG). */
  assetId: string;
  /** Emoji used when the art is not available yet. */
  emoji: string;
  /** A one line line of flavour text. */
  joke?: string;
  /** The season this catch is only available in. */
  seasonal?: ContentSeason;
  /** Epoch milliseconds; `null` (or missing) means "always". */
  availableFrom?: number | null;
  /** Epoch milliseconds (exclusive); `null` (or missing) means "always". */
  availableUntil?: number | null;
}

/**
 * Every heavy catch of the game.
 *
 * The weights are the deep end of the ladder: a heavy catch is heavier than
 * an Angler's Legend (500,000–2,500,000 lbs).
 */
export const HEAVY: readonly HeavyDef[] = [
  {
    id: 'galaxy_fish',
    name: 'Galaxy Fish',
    tier: 'heavy',
    minLbs: 3_000_000,
    maxLbs: 12_000_000,
    assetId: 'catch_heavy_galaxy_fish',
    emoji: '🌌',
    joke: 'It was not supposed to be down there.',
  },
  {
    id: 'golden_koi',
    name: 'Golden Koi',
    tier: 'heavy',
    minLbs: 2_600_000,
    maxLbs: 9_000_000,
    assetId: 'catch_heavy_golden_koi',
    emoji: '🐟',
    joke: 'A good omen, apparently.',
  },
  {
    id: 'ice_fish',
    name: 'Ice Fish',
    tier: 'heavy',
    minLbs: 2_500_000,
    maxLbs: 7_500_000,
    assetId: 'catch_heavy_ice_fish',
    emoji: '🧊',
    joke: 'Still frozen. Somehow.',
  },
  {
    id: 'skeleton_fish',
    name: 'Skeleton Fish',
    tier: 'heavy',
    minLbs: 4_000_000,
    maxLbs: 16_000_000,
    assetId: 'catch_heavy_skeleton_fish',
    emoji: '💀',
    joke: 'It has been down here a while.',
  },
  {
    id: 'swamp_monster',
    name: 'Swamp Monster',
    tier: 'heavy',
    minLbs: 5_000_000,
    maxLbs: 20_000_000,
    assetId: 'catch_heavy_swamp_monster',
    emoji: '🐊',
    joke: 'Nobody goes in the water after dark.',
  },
  {
    id: 'treasure_chest',
    name: 'Treasure Chest',
    tier: 'heavy',
    minLbs: 3_500_000,
    maxLbs: 14_000_000,
    assetId: 'catch_heavy_treasure_chest',
    emoji: '💰',
    joke: 'The exam answers were not in there.',
  },
  {
    id: 'void_fish',
    name: 'Void Fish',
    tier: 'heavy',
    minLbs: 8_000_000,
    maxLbs: 25_000_000,
    assetId: 'catch_heavy_void_fish',
    emoji: '🕳️',
    joke: 'Nothing was supposed to be down there.',
  },
];
