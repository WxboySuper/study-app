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
  /** The tier of the catch; the wiki maps a heavy catch to Angler's Legend. */
  tier: 'legend';
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
 * The wiki maps a heavy catch to the Legend rows: everything lives between
 * 500,000 and 2,500,000 lbs, the Swamp Monster is the Blooket 1M-2M row and
 * the Treasure Chest sits on the top row (Tim the Alien).
 */
export const HEAVY: readonly HeavyDef[] = [
  {
    id: 'galaxy_fish',
    name: 'Galaxy Fish',
    tier: 'legend',
    minLbs: 500_000,
    maxLbs: 700_000,
    assetId: 'catch_heavy_galaxy_fish',
    emoji: '🌌',
    joke: 'It was not supposed to be down there.',
  },
  {
    id: 'golden_koi',
    name: 'Golden Koi',
    tier: 'legend',
    minLbs: 750_000,
    maxLbs: 1_000_000,
    assetId: 'catch_heavy_golden_koi',
    emoji: '🐟',
    joke: 'A good omen, apparently.',
  },
  {
    id: 'ice_fish',
    name: 'Ice Fish',
    tier: 'legend',
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
    assetId: 'catch_heavy_ice_fish',
    emoji: '🧊',
    joke: 'Still frozen. Somehow.',
  },
  {
    id: 'skeleton_fish',
    name: 'Skeleton Fish',
    tier: 'legend',
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
    assetId: 'catch_heavy_skeleton_fish',
    emoji: '💀',
    joke: 'It has been down here a while.',
  },
  {
    id: 'swamp_monster',
    name: 'Swamp Monster',
    tier: 'legend',
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
    assetId: 'catch_heavy_swamp_monster',
    emoji: '🐊',
    joke: 'Nobody goes in the water after dark.',
  },
  {
    id: 'treasure_chest',
    name: 'Treasure Chest',
    tier: 'legend',
    minLbs: 1_500_000,
    maxLbs: 2_500_000,
    assetId: 'catch_heavy_treasure_chest',
    emoji: '💰',
    joke: 'The exam answers were not in there.',
  },
  {
    id: 'void_fish',
    name: 'Void Fish',
    tier: 'legend',
    minLbs: 1_000_000,
    maxLbs: 2_000_000,
    assetId: 'catch_heavy_void_fish',
    emoji: '🕳️',
    joke: 'Nothing was supposed to be down there.',
  },
];
