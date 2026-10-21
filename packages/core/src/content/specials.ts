/**
 * The special registry (the "Special" slice of the fishing mode).
 *
 * A special is not a catch of the tier ladder: it changes the session (a new
 * lure, the Frenzy) or it gives something (a powerup, a pack ticket).
 *
 * Adding a special is a data change: one entry here plus one image in
 * `apps/mobile/assets/content/`. See `docs/ADDING-CONTENT.md`.
 */

/** The kinds of special. */
export type SpecialKind = 'new_lure' | 'frenzy' | 'pack_ticket';

/** A special catch of the fishing mode. */
export interface SpecialDef {
  id: string;
  name: string;
  kind: SpecialKind;
  /** The art key of the special (the file name of the PNG). */
  assetId: string;
  /** Emoji used when the art is not available yet. */
  emoji: string;
  /** What the special does, in one line. */
  description: string;
  /** Epoch milliseconds; `null` (or missing) means "always". */
  availableFrom?: number | null;
  /** Epoch milliseconds (exclusive); `null` (or missing) means "always". */
  availableUntil?: number | null;
}

/** Every special of the game. */
export const SPECIALS: readonly SpecialDef[] = [
  {
    id: 'new_lure',
    name: 'New Lure!',
    kind: 'new_lure',
    assetId: 'special_new_lure',
    emoji: '🎁',
    description: 'The lure rank goes up by one for this session.',
  },
  {
    id: 'frenzy',
    name: 'FRENZY!',
    kind: 'frenzy',
    assetId: 'special_frenzy',
    emoji: '🌈',
    description: 'The next five catches roll two ranks higher and weigh twice as much.',
  },
  {
    id: 'pack_ticket',
    name: 'Pack Ticket!',
    kind: 'pack_ticket',
    assetId: 'special_pack_ticket',
    emoji: '🎟️',
    description: 'One free Brain Buddies pack.',
  },
];

/** The powerups that can be found in a bottle. */
export type PowerupId = 'double_hook' | 'lucky_charm' | 'second_chance' | 'heavy_sinker';

/** A powerup and what it does. */
export interface PowerupDef {
  id: PowerupId;
  name: string;
  description: string;
  emoji: string;
  /** The art key of the powerup (the file name of the PNG). */
  assetId: string;
}

/** Every powerup. */
export const POWERUPS: readonly PowerupDef[] = [
  {
    id: 'double_hook',
    name: 'Double Hook',
    description: 'The next correct answer lands 2 catches.',
    emoji: '🪝',
    assetId: 'pu_double_hook',
  },
  {
    id: 'lucky_charm',
    name: 'Lucky Charm',
    description: 'The next catch rerolls Trash and Easy One once.',
    emoji: '🍀',
    assetId: 'pu_lucky_charm',
  },
  {
    id: 'second_chance',
    name: 'Second Chance',
    description: 'The next wrong answer keeps the fish on the line.',
    emoji: '💗',
    assetId: 'pu_second_chance',
  },
  {
    id: 'heavy_sinker',
    name: 'Heavy Sinker',
    description: '×3 weight on the next catch.',
    emoji: '⚓',
    assetId: 'pu_heavy_sinker',
  },
];
