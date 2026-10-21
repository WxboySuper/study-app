/**
 * The fishing dice (docs/design/fishing.md §6 and §8).
 *
 * Everything in this file is pure: the random source is injected, so the
 * whole catch table can be tested with a seeded RNG.
 */

import {
  CRITTER_RARITIES,
  CRITTER_RARITY_ODDS,
  crittersByRarity,
  crittersOfPack,
  type CritterDef,
  type CritterRarity,
} from '../critters';
import {
  catchesOfTier,
  findCritterCatch,
  type CatchDef,
  type CatchTier,
  type FishingSeason,
} from './catches';
import { equippedBaitEffect, MAX_LURE_RANK, type EquippedBaits, type LureRank } from './lures';

/* -------------------------------------------------------------------------
 * The random source
 * ---------------------------------------------------------------------- */

/**
 * A random source. The fishing mode never calls `Math.random()` directly so
 * that a session can be replayed from its seed (and so the tests are stable).
 */
export interface Rng {
  /** A float in `[0, 1)`. */
  next(): number;
  /** An integer in `[min, max]`, both bounds included. */
  int(min: number, max: number): number;
}

/**
 * Creates a seeded RNG (mulberry32).
 *
 * The same seed always produces the same session, which is what the tests
 * rely on.
 */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    next,
    int: (min: number, max: number): number => min + Math.floor(next() * (max - min + 1)),
  };
}

/** A RNG that is not reproducible. Used for real sessions. */
export function createRandomRng(): Rng {
  return createSeededRng(Math.floor(Math.random() * 0xffffffff));
}

/* -------------------------------------------------------------------------
 * The tier odds table (§6)
 * ---------------------------------------------------------------------- */

/** The odds of every tier for one lure rank, in percent. */
export interface TierOdds {
  /** The lure rank these odds belong to. */
  rank: LureRank;
  trash: number;
  easy: number;
  great: number;
  rare: number;
  epic: number;
  cotd: number;
  legend: number;
  /** The share that goes to the special table (§8). */
  special: number;
}

/**
 * The tier odds per lure rank (§6). Every row adds up to 100 %.
 */
export const TIER_ODDS: readonly TierOdds[] = [
  { rank: 1, trash: 30, easy: 45, great: 16, rare: 4, epic: 0, cotd: 0, legend: 0, special: 5 },
  { rank: 2, trash: 20, easy: 40, great: 22, rare: 10, epic: 2, cotd: 0, legend: 0, special: 6 },
  { rank: 3, trash: 12, easy: 30, great: 26, rare: 18, epic: 6, cotd: 1, legend: 0, special: 7 },
  { rank: 4, trash: 8, easy: 20, great: 26, rare: 24, epic: 12, cotd: 2.5, legend: 0.5, special: 7 },
  { rank: 5, trash: 5, easy: 12, great: 22, rare: 28, epic: 18, cotd: 6, legend: 1, special: 8 },
];

/** The base odds of a lure rank. Unknown ranks fall back to rank 1. */
export function baseTierOdds(rank: number): TierOdds {
  const odds = TIER_ODDS.find((entry) => entry.rank === rank);
  return odds ?? TIER_ODDS[0]!;
}

/**
 * The odds of a lure rank with the equipped baits applied.
 *
 * The Glow Jig adds 2 percentage points to "Rare Find" and above; the points
 * are taken from the three common tiers so the row still adds up to 100 %.
 */
export function tierOddsForRank(rank: number, baits: EquippedBaits = baitsWithoutEffect()): TierOdds {
  const base = { ...baseTierOdds(rank) };
  const bonus = equippedBaitEffect(baits).rareTierBonus;
  if (bonus <= 0) {
    return base;
  }

  const donorTotal = base.trash + base.easy + base.great;

  base.rare += bonus;
  base.epic += bonus;
  base.cotd += bonus;
  base.legend += bonus;

  const taken = bonus * 4;
  // The three common tiers always have odds (5 % at the lowest rank), so the
  // divisor is never zero.
  const divisor = Math.max(donorTotal, Number.EPSILON);
  base.trash -= (taken * base.trash) / divisor;
  base.easy -= (taken * base.easy) / divisor;
  base.great -= (taken * base.great) / divisor;

  return base;
}

function baitsWithoutEffect(): EquippedBaits {
  return { shinySpinner: false, glowJig: false, critterChum: false };
}

/* -------------------------------------------------------------------------
 * The special table (§8)
 * ---------------------------------------------------------------------- */

/** The powerups that can be found in a bottle. */
export type PowerupId = 'double_hook' | 'lucky_charm' | 'second_chance' | 'heavy_sinker';

/** A powerup and what it does. */
export interface PowerupDef {
  id: PowerupId;
  name: string;
  description: string;
  emoji: string;
  /** The sprite id (see docs/design/fishing.md §13a). */
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

/** Looks a powerup up by id. */
export function findPowerup(id: PowerupId): PowerupDef {
  const definition = POWERUPS.find((entry) => entry.id === id);
  if (definition === undefined) {
    throw new Error(`Unknown powerup: ${id}`);
  }
  return definition;
}

/** The odds of the special table, in percent. */
export interface SpecialOdds {
  newLure: number;
  frenzy: number;
  powerup: number;
  critter: number;
  packTicket: number;
}

/** The special table of §8. */
export const BASE_SPECIAL_ODDS: SpecialOdds = {
  newLure: 30,
  frenzy: 15,
  powerup: 40,
  critter: 12,
  packTicket: 3,
};

/** How many catches the Frenzy boosts. */
export const FRENZY_CATCHES = 5;

/** How much the Frenzy raises the lure rank while it lasts. */
export const FRENZY_RANK_BONUS = 2;

/** The Frenzy doubles the weight of every catch it boosts. */
export const FRENZY_WEIGHT_MULTIPLIER = 2;

/**
 * The correct answers after which a lure rank up is guaranteed
 * ("guaranteed by 5, 12, 22 and 35 correct answers at the latest").
 */
export const LURE_GUARANTEE_THRESHOLDS: readonly number[] = [5, 12, 22, 35];

/**
 * How many lures have to be reeled up after `correctCount` correct answers.
 */
export function guaranteedLureCount(correctCount: number): number {
  return LURE_GUARANTEE_THRESHOLDS.filter((threshold) => correctCount >= threshold).length;
}

/* -------------------------------------------------------------------------
 * Rolling a catch
 * ---------------------------------------------------------------------- */

/** Everything the roller needs to know about the session. */
export interface RollState {
  /** The current lure rank (1-5). */
  lureRank: number;
  /** How many catches the Frenzy still boosts. */
  frenzyCatchesLeft: number;
  /** The powerup that is currently held. */
  powerup: PowerupId | null;
  /** How many lures have been reeled up in this session. */
  luresReeledUp: number;
  /** How many answers were correct so far. */
  correctCount: number;
  /** How many pack tickets this session already produced. */
  packTicketsThisSession: number;
  /** How many pack tickets today already exist (across sessions). */
  packTicketsToday: number;
  /** The baits that are equipped. */
  baits: EquippedBaits;
}

/** A fresh roll state. */
export function createRollState(overrides: Partial<RollState> = {}): RollState {
  return {
    lureRank: 1,
    frenzyCatchesLeft: 0,
    powerup: null,
    luresReeledUp: 0,
    correctCount: 0,
    packTicketsThisSession: 0,
    packTicketsToday: 0,
    baits: baitsWithoutEffect(),
    ...overrides,
  };
}

/** What came out of the roll. */
export type RolledCatch =
  | { kind: 'fish'; tier: CatchTier; catch: CatchDef; lbs: number }
  | { kind: 'critter'; tier: CatchTier; catch: CatchDef; lbs: number; critter: CritterDef }
  | { kind: 'new_lure' }
  | { kind: 'frenzy' }
  | { kind: 'powerup'; powerup: PowerupId }
  | { kind: 'pack_ticket' };

/** The result of one roll. */
export interface RollResult {
  /** What was rolled. */
  outcome: RolledCatch;
  /** The roll state after the roll. */
  state: RollState;
  /** The lure rank the tier was rolled at. */
  rank: number;
  /** `true` when the Lucky Charm re-rolled the tier. */
  luckyCharmUsed: boolean;
  /** `true` when the Frenzy was active for this roll. */
  frenzyActive: boolean;
}

/** Options for {@link rollCatch}. */
export interface RollOptions {
  /**
   * Bonus review cards (not due, not new) roll at rank 1 at best and never
   * roll a critter or a pack ticket (§6).
   */
  bonus?: boolean;
  /** The season, for the seasonal catches. */
  season?: FishingSeason | null;
  /** The pack the critter catch is drawn from. */
  critterPackId?: string;
}

/**
 * Rolls the special table.
 *
 * The critter and the pack ticket are removed from the table when they are
 * not allowed (bonus cards, ticket caps) and the remaining shares are scaled
 * back up to 100 %.
 */
export function specialOddsFor(
  state: RollState,
  options: RollOptions = {},
): SpecialOdds {
  const bonus = options.bonus ?? false;
  const ticketCapped =
    state.packTicketsThisSession >= 1 || state.packTicketsToday >= 1;

  const critterShare = equippedBaitEffect(state.baits).critterShare;
  const critterAllowed = !bonus;

  const withoutCritter = BASE_SPECIAL_ODDS.newLure + BASE_SPECIAL_ODDS.frenzy + BASE_SPECIAL_ODDS.powerup;
  // Pack tickets only roll on due or new cards, and only once per session
  // and once per day (§8).
  const ticketShare = ticketCapped || bonus ? 0 : BASE_SPECIAL_ODDS.packTicket;
  const others = withoutCritter + ticketShare;

  const odds: SpecialOdds = {
    newLure: BASE_SPECIAL_ODDS.newLure,
    frenzy: BASE_SPECIAL_ODDS.frenzy,
    powerup: BASE_SPECIAL_ODDS.powerup,
    critter: 0,
    packTicket: ticketShare,
  };

  if (critterAllowed) {
    odds.critter = critterShare;
  }

  // Scale the other shares so that everything still adds up to 100 %.
  const remaining = 100 - odds.critter;
  const scale = remaining / others;
  odds.newLure *= scale;
  odds.frenzy *= scale;
  odds.powerup *= scale;
  odds.packTicket *= scale;

  return odds;
}

/**
 * Rolls a tier for a lure rank.
 *
 * Returns `'special'` when the special table (§8) should be rolled.
 */
export function rollTier(rng: Rng, rank: number, baits?: EquippedBaits): CatchTier | 'special' {
  const odds = tierOddsForRank(rank, baits);
  const order: (keyof TierOdds)[] = ['trash', 'easy', 'great', 'rare', 'epic', 'cotd', 'legend', 'special'];
  const roll = rng.next() * 100;

  let cumulative = 0;
  let fallback: CatchTier | 'special' = 'trash';

  for (const key of order) {
    const value = odds[key] as number;
    if (value > 0) {
      fallback = key === 'special' ? 'special' : (key as CatchTier);
    }
    cumulative += value;
    if (roll < cumulative) {
      return fallback;
    }
  }

  /* v8 ignore next -- the odds always add up to 100 % */
  return fallback;
}

/** Rolls a critter of a pack, using the pack odds of the SPEC (§3). */
export function rollCritter(rng: Rng, packId: string): CritterDef | undefined {
  const roll = rng.next() * 100;
  let cumulative = 0;
  let rarity: CritterRarity = 'common';

  for (const entry of CRITTER_RARITIES) {
    cumulative += CRITTER_RARITY_ODDS[entry];
    if (roll < cumulative) {
      rarity = entry;
      break;
    }
  }

  const ofRarity = crittersByRarity(rarity, packId);
  if (ofRarity.length > 0) {
    const picked = ofRarity[rng.int(0, ofRarity.length - 1)];
    if (picked !== undefined) {
      return picked;
    }
  }

  const fallback = crittersOfPack(packId);
  if (fallback.length === 0) {
    return undefined;
  }
  return fallback[rng.int(0, fallback.length - 1)];
}

/** Rolls the weight of a catch, in lbs. */
export function rollWeight(rng: Rng, catchDef: CatchDef): number {
  const min = Math.min(catchDef.minLbs, catchDef.maxLbs);
  const max = Math.max(catchDef.minLbs, catchDef.maxLbs);
  return rng.int(min, max);
}

/**
 * Rolls the next catch of the session.
 *
 * The order of the rolls is:
 *
 * 1. the lure guarantee (a rank up is due, so it is forced);
 * 2. the tier, from the odds of the current lure rank (plus the Frenzy
 *    bonus and the Lucky Charm re-roll);
 * 3. the special table, when the tier roll landed on "special".
 */
export function rollCatch(rng: Rng, state: RollState, options: RollOptions = {}): RollResult {
  const bonus = options.bonus ?? false;
  const season = options.season ?? null;
  const critterPackId = options.critterPackId ?? 'brain_buddies';

  const next: RollState = {
    ...state,
    baits: { ...state.baits },
  };

  // The lure rank the tier is rolled at. The Frenzy lifts it by 2, bonus
  // review cards never go above rank 1.
  const frenzyActive = next.frenzyCatchesLeft > 0;
  let rank = next.lureRank + (frenzyActive ? FRENZY_RANK_BONUS : 0);
  rank = Math.min(MAX_LURE_RANK, Math.max(1, rank));
  if (bonus) {
    // Bonus review cards roll at rank 1 at best.
    rank = 1;
  }

  // The frenzy always lasts for FRENZY_CATCHES catches, no matter what came
  // out of the roll.
  if (frenzyActive) {
    next.frenzyCatchesLeft = next.frenzyCatchesLeft - 1;
  }

  // 1. The lure guarantee.
  if (next.luresReeledUp < guaranteedLureCount(next.correctCount)) {
    next.lureRank = Math.min(MAX_LURE_RANK, next.lureRank + 1);
    next.luresReeledUp += 1;
    return { outcome: { kind: 'new_lure' }, state: next, rank, luckyCharmUsed: false, frenzyActive };
  }

  // 2. The tier.
  let tier = rollTier(rng, rank, next.baits);
  let luckyCharmUsed = false;

  if (tier === 'trash' || tier === 'easy') {
    if (next.powerup === 'lucky_charm') {
      next.powerup = null;
      luckyCharmUsed = true;
      tier = rollTier(rng, rank, next.baits);
    }
  }

  // 3. The special table.
  if (tier === 'special') {
    const special = rollSpecial(rng, next, bonus, critterPackId);
    if (special !== null) {
      return {
        outcome: special.outcome,
        state: special.state,
        rank,
        luckyCharmUsed,
        frenzyActive,
      };
    }
    // The special table came up empty (an empty critter pack): fall back to
    // the junk pile so the game never dead ends.
    tier = 'trash';
  }

  // 4. A fish.
  const pool = catchesOfTier(tier, { season });
  const catchDef = pool[rng.int(0, pool.length - 1)];
  /* v8 ignore next -- every tier of the catalogue has at least one catch */
  if (catchDef === undefined) {
    // The pool is empty (only possible for a season without seasonal
    // catches), fall back to the trash pool so the game never dead ends.
    const fallbackPool = catchesOfTier('trash', { season });
    const fallback = fallbackPool[rng.int(0, fallbackPool.length - 1)];
    if (fallback === undefined) {
      throw new Error('The catch catalogue is empty.');
    }
    return {
      outcome: { kind: 'fish', tier: 'trash', catch: fallback, lbs: rollWeight(rng, fallback) },
      state: next,
      rank,
      luckyCharmUsed,
      frenzyActive,
    };
  }

  const multiplier = weightMultiplier(next, frenzyActive);
  if (next.powerup === 'heavy_sinker') {
    // The Heavy Sinker is used up by the catch it was picked for.
    next.powerup = null;
  }
  const lbs = Math.max(1, Math.round(rollWeight(rng, catchDef) * multiplier));

  return { outcome: { kind: 'fish', tier: catchDef.tier, catch: catchDef, lbs }, state: next, rank, luckyCharmUsed, frenzyActive };
}

/**
 * Rolls the special table (§8).
 *
 * Returns `null` when the table cannot produce a catch (an empty critter
 * pack), so the caller can fall back to a normal fish.
 */
function rollSpecial(
  rng: Rng,
  state: RollState,
  bonus: boolean,
  critterPackId: string,
): { outcome: RolledCatch; state: RollState } | null {
  const next: RollState = { ...state, baits: { ...state.baits } };
  const odds = specialOddsFor(next, { bonus });
  const roll = rng.next() * 100;

  let cumulative = 0;
  let picked: keyof SpecialOdds = 'powerup';

  for (const key of ['newLure', 'frenzy', 'powerup', 'critter', 'packTicket'] as const) {
    cumulative += odds[key];
    if (roll < cumulative) {
      picked = key;
      break;
    }
  }

  switch (picked) {
    case 'newLure': {
      next.lureRank = Math.min(MAX_LURE_RANK, next.lureRank + 1);
      next.luresReeledUp += 1;
      return { outcome: { kind: 'new_lure' }, state: next };
    }
    case 'frenzy': {
      next.frenzyCatchesLeft = FRENZY_CATCHES;
      return { outcome: { kind: 'frenzy' }, state: next };
    }
    case 'powerup': {
      const powerup = POWERUPS[rng.int(0, POWERUPS.length - 1)];
      /* v8 ignore next -- the powerup table is never empty */
      if (powerup === undefined) {
        return null;
      }
      next.powerup = powerup.id;
      return { outcome: { kind: 'powerup', powerup: powerup.id }, state: next };
    }
    case 'critter': {
      const critter = rollCritter(rng, critterPackId);
      if (critter === undefined) {
        return null;
      }
      const catchDef = findCritterCatch(critter.id);
      /* v8 ignore next -- every critter of the catalogue has a catch */
      if (catchDef === undefined) {
        return null;
      }
      const lbs = rollWeight(rng, catchDef);
      return {
        outcome: { kind: 'critter', tier: catchDef.tier, catch: catchDef, lbs, critter },
        state: next,
      };
    }
    case 'packTicket': {
      next.packTicketsThisSession += 1;
      return { outcome: { kind: 'pack_ticket' }, state: next };
    }
  }
}

/**
 * The weight multiplier of a catch: the Frenzy (×2), the Heavy Sinker (×3)
 * and the Shiny Spinner bait (+10 %).
 */
export function weightMultiplier(state: RollState, frenzyActive: boolean): number {
  let multiplier = 1;

  if (frenzyActive) {
    multiplier *= FRENZY_WEIGHT_MULTIPLIER;
  }
  if (state.powerup === 'heavy_sinker') {
    multiplier *= 3;
  }
  multiplier *= equippedBaitEffect(state.baits).weightMultiplier;

  return multiplier;
}
