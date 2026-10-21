/**
 * The junk registry (the "Trash" tier of the fishing mode).
 *
 * Junk is what swims up when the roll lands on the bottom of the ladder: a
 * soggy sneaker, a wet waffle, a soaked homework sheet. Every junk item has
 * a joke, because the tier is the funny one.
 *
 * Adding a junk item is a data change: one entry here plus one image in
 * `apps/mobile/assets/content/`. See `docs/ADDING-CONTENT.md`.
 */

import type { ContentSeason } from './types';

/** A junk item (a catch of the "Trash" tier). */
export interface JunkDef {
  id: string;
  name: string;
  /** The tier of the catch; junk is always "Trash". */
  tier: 'trash';
  /** The lightest possible weight, in lbs. */
  minLbs: number;
  /** The heaviest possible weight, in lbs. */
  maxLbs: number;
  /** The art key of the junk item (the file name of the PNG). */
  assetId: string;
  /** Emoji used when the art is not available yet. */
  emoji: string;
  /** A one line joke for the silly catches. */
  joke?: string;
  /** The season this item is only available in. */
  seasonal?: ContentSeason;
  /** Epoch milliseconds; `null` (or missing) means "always". */
  availableFrom?: number | null;
  /** Epoch milliseconds (exclusive); `null` (or missing) means "always". */
  availableUntil?: number | null;
}

/** Every junk item of the game. */
export const JUNK: readonly JunkDef[] = [
  {
    id: 'old_sneaker',
    name: 'Old Sneaker',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_old_sneaker',
    emoji: '👟',
    joke: 'Smells like detention.',
  },
  {
    id: 'soggy_waffle',
    name: 'Soggy Waffle',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_soggy_waffle',
    emoji: '🧇',
    joke: 'Breakfast, mostly.',
  },
  {
    id: 'lost_homework',
    name: 'Lost Homework',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_lost_homework',
    emoji: '📄',
    joke: 'The F is now decorative.',
  },
  {
    id: 'two_of_clubs',
    name: 'Two of Clubs',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_two_of_clubs',
    emoji: '🃏',
    joke: 'Still the wrong card.',
  },
  {
    id: 'rubber_duck',
    name: 'Rubber Duck',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_rubber_duck',
    emoji: '🦆',
    joke: 'Quacks under pressure.',
  },
  {
    id: 'tangled_earbuds',
    name: 'Tangled Earbuds',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_tangled_earbuds',
    emoji: '🎧',
    joke: 'One for each ear, none for music.',
  },
  {
    id: 'half_pencil',
    name: 'Half a Pencil',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_half_pencil',
    emoji: '✏️',
    joke: 'Pointless.',
  },
  {
    id: 'mystery_tin_can',
    name: 'Mystery Tin Can',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_tin_can',
    emoji: '🥫',
    joke: 'Contents: unclear.',
  },
  {
    id: 'expired_hall_pass',
    name: 'Expired Hall Pass',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_hall_pass',
    emoji: '🎫',
    joke: 'No longer valid.',
  },
  {
    id: 'pumpkin_carving',
    name: 'Pumpkin Carving',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_pumpkin_carving',
    emoji: '🎃',
    joke: 'The teeth are gone.',
    seasonal: 'halloween',
  },
  {
    id: 'snowy_mittens',
    name: 'Snowy Mittens',
    tier: 'trash',
    minLbs: 1,
    maxLbs: 10,
    assetId: 'junk_snowy_mittens',
    emoji: '🧤',
    joke: 'One of them is soaked through.',
    seasonal: 'winter',
  },
];
