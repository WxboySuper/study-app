/**
 * The fishing dice (docs/design/fishing.md §6 and §8).
 *
 * Everything in this file is pure: the random source is injected, so the
 * whole catch table can be tested with a seeded RNG.
 */

import {
  CRITTER_RARITIES,
  CRITTER_RARITY_ODDS,
  type CritterDef,
  type CritterRarity,
} from '../content/critters';
import { POWERUPS, type PowerupDef, type PowerupId } from '../content/specials';
import { crittersByRarity, crittersOfPack, findCritter, findPack, isPackAvailable } from '../critters';
import {
  CATCH_TIER_ORDER,
  LEGEND_MAX_SHARE,
  catchPool,
  catchesOfTier,
  findCritterCatch,
  type CatchDef,
  type CatchTier,
  type FishingSeason,
} from './catches';
import { equippedBaitEffect, MAX_LURE_RANK, type EquippedBaits } from './lures';
import {
  MAX_ROLL_RANK,
  clampRollRank,
  wikiTiersForRank,
} from './wiki';

export { POWERUPS, type PowerupDef, type PowerupId } from '../content/specials';

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
  /** The lure rank these odds belong to (1-5, 6 for the Frenzy/S+). */
  rank: number;
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
 * The share of the special table per lure rank, in percent.
 *
 * The specials grow a little with the lure rank: a better lure finds fewer
 * powerups and more of the good stuff. Rank 6 is the Frenzy (S+).
 */
export const SPECIAL_SHARE_BY_RANK: readonly number[] = [5, 6, 7, 7, 8, 8];

/**
 * The weight of every tier at a lure rank (rank 1 = lure F, 2 = D, 3 = C,
 * 4 = B, 5 = A/S, 6 = S+, the Frenzy).
 *
 * The wiki lists which lures can catch a tier (Trash F-C, Easy One D-B,
 * Great Catch and Rare Find D-A, Epic Grab C-A, Catch of the Day B-S,
 * Angler's Legend A-S+). The low lures are dominated by Trash, Easy One and
 * Great Catch; Rare Find is a minority until the late lures and Epic Grab is
 * rare at C. See docs/design/fishing.md §6.
 */
export const TIER_WEIGHTS_BY_RANK: readonly Readonly<Partial<Record<CatchTier, number>>>[] = [
  { trash: 100 },
  { trash: 30, easy: 45, great: 18, rare: 7 },
  { trash: 15, easy: 40, great: 25, rare: 15, epic: 5 },
  { easy: 25, great: 30, rare: 27, epic: 13, cotd: 5 },
  { great: 25, rare: 35, epic: 25, cotd: 12, legend: 3 },
  { great: 10, rare: 20, epic: 30, cotd: 30, legend: 10 },
];

/** The base odds of a lure rank. Unknown ranks fall back to rank 1. */
export function baseTierOdds(rank: number): TierOdds {
  const rollRank = clampRollRank(rank);
  const special = SPECIAL_SHARE_BY_RANK[rollRank - 1] ?? SPECIAL_SHARE_BY_RANK[0]!;
  const odds = emptyTierOdds(rollRank);
  odds.special = special;

  // The tier weights come from TIER_WEIGHTS_BY_RANK. The wiki chances are
  // per Blook at the *first* lure that can catch it, so summing them per tier
  // overweights the tiers with many rows (Rare Find sums to 43 % at lure D).
  // The rows still pick the catch inside a tier.
  const tiers = wikiTiersForRank(rollRank);
  const weights = tiers.map((tier) => TIER_WEIGHTS_BY_RANK[rollRank - 1]?.[tier] ?? 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const catchShare = 100 - special;
  const divisor = total > 0 ? total : 1;

  for (let index = 0; index < tiers.length; index += 1) {
    odds[tiers[index]!] = ((weights[index] ?? 0) / divisor) * catchShare;
  }

  return capLegend(odds);
}

/**
 * The odds of a lure rank with the equipped baits applied.
 *
 * The Glow Jig adds 2 percentage points to every rare tier that the rank can
 * catch ("Rare Find" and above); the points are taken from the three common
 * tiers so the row still adds up to 100 %. The Legend cap is applied last.
 */
export function tierOddsForRank(rank: number, baits: EquippedBaits = baitsWithoutEffect()): TierOdds {
  const base = { ...baseTierOdds(rank) };
  const bonus = equippedBaitEffect(baits).rareTierBonus;
  if (bonus <= 0) {
    return base;
  }

  const boosted = CATCH_TIER_ORDER.filter(
    (tier) => tier !== 'trash' && tier !== 'easy' && tier !== 'great' && base[tier] > 0,
  );
  if (boosted.length === 0) {
    return base;
  }

  for (const tier of boosted) {
    base[tier] += bonus;
  }

  const donors = CATCH_TIER_ORDER.filter(
    (tier) => tier === 'trash' || tier === 'easy' || tier === 'great',
  ).filter((tier) => base[tier] > 0);
  const donorTotal = donors.reduce((sum, tier) => sum + base[tier], 0);
  const taken = bonus * boosted.length;
  const divisor = donorTotal > 0 ? donorTotal : 1;

  for (const tier of donors) {
    base[tier] = Math.max(0, base[tier] - (taken * base[tier]) / divisor);
  }

  return capLegend(base);
}

/**
 * Caps the Legend tier at {@link LEGEND_MAX_SHARE} percent of the whole row.
 *
 * The wiki's Legend rows are the rarest of the table, but the tier weight
 * alone would give them ~4.5 % at the best lure. The cap spreads the rest of
 * the catch share over the other tiers, keeping their relative weights.
 */
function capLegend(odds: TierOdds): TierOdds {
  if (odds.legend <= LEGEND_MAX_SHARE) {
    return odds;
  }

  const others = CATCH_TIER_ORDER.filter((tier) => tier !== 'legend');
  const otherTotal = others.reduce((sum, tier) => sum + odds[tier], 0);
  const rest = 100 - odds.special - LEGEND_MAX_SHARE;
  const divisor = otherTotal > 0 ? otherTotal : 1;

  for (const tier of others) {
    odds[tier] = (odds[tier] / divisor) * rest;
  }
  odds.legend = LEGEND_MAX_SHARE;

  return odds;
}

/** An odds row with every tier at zero. */
function emptyTierOdds(rank: number): TierOdds {
  const odds: TierOdds = {
    rank,
    trash: 0,
    easy: 0,
    great: 0,
    rare: 0,
    epic: 0,
    cotd: 0,
    legend: 0,
    special: 0,
  };
  return odds;
}

function baitsWithoutEffect(): EquippedBaits {
  return { shinySpinner: false, glowJig: false, critterChum: false };
}

/** The odds of every roll rank (1-5 and the Frenzy's rank 6). */
export const TIER_ODDS: readonly TierOdds[] = Array.from(
  { length: MAX_ROLL_RANK },
  (_, index) => baseTierOdds(index + 1),
);

/* -------------------------------------------------------------------------
 * The special table (§8)
 * ---------------------------------------------------------------------- */

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
 * The correct answers after which a lure upgrade is offered at the latest
 * (docs/design/fishing.md §8).
 *
 * In Blooket the lure upgrades are reeled in as a catch ("New Lure", a
 * Special): they come from the catch roll, not from a timer. The roll alone
 * gives roughly one upgrade every 40-70 catches, so these late safety
 * nets only make sure a long session still reaches the Legend Lure. They are
 * wide on purpose: reaching rank 5 takes a long session (100 correct answers
 * at the latest).
 */
export const LURE_GUARANTEE_THRESHOLDS: readonly number[] = [8, 25, 55, 100];

/**
 * Reels a lure upgrade in: the rank goes up by one (at most 5).
 *
 * The roll only *offers* a "New Lure!" catch; the rank moves when the player
 * claims it on the reveal card, so a fish that got away never upgrades the lure.
 */
export function applySpecialReward(state: RollState, outcome: RolledCatch): RollState {
  switch (outcome.kind) {
    case 'new_lure':
      return applyLureUpgrade(state);
    case 'frenzy':
      return { ...state, frenzyCatchesLeft: FRENZY_CATCHES };
    case 'powerup':
      return { ...state, powerup: outcome.powerup };
    case 'pack_ticket':
      return { ...state, packTicketsThisSession: state.packTicketsThisSession + 1 };
    default:
      return state;
  }
}

/**
 * The lure upgrade of a "New Lure" catch, applied when it is claimed.
 */
export function applyLureUpgrade(state: RollState): RollState {
  return {
    ...state,
    lureRank: Math.min(MAX_LURE_RANK, state.lureRank + 1),
    luresReeledUp: state.luresReeledUp + 1,
  };
}

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
  | { kind: 'junk'; tier: CatchTier; catch: CatchDef; lbs: number }
  | { kind: 'heavy'; tier: CatchTier; catch: CatchDef; lbs: number }
  | { kind: 'new_lure' }
  | { kind: 'frenzy' }
  | { kind: 'powerup'; powerup: PowerupId }
  | { kind: 'pack_ticket' };

/** The rolls that land a catch (a critter, a fish, junk or a heavy catch). */
export type CatchOutcome = Extract<RolledCatch, { kind: 'fish' | 'critter' | 'junk' | 'heavy' }>;

/** Whether the roll landed a catch. */
export function isCatchOutcome(outcome: RolledCatch): outcome is CatchOutcome {
  return (
    outcome.kind === 'fish' ||
    outcome.kind === 'critter' ||
    outcome.kind === 'junk' ||
    outcome.kind === 'heavy'
  );
}

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
  /**
   * The time of the roll (epoch milliseconds).
   *
   * It decides which packs are on sale, so a critter of a seasonal pack only
   * swims up while the pack is available. Defaults to `Date.now()`.
   */
  now?: number;
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
  const order: (keyof TierOdds)[] = [...CATCH_TIER_ORDER, 'special'];
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

/**
 * Rolls a critter of a pack, using the pack odds of the SPEC (§3).
 *
 * A pack that is not on sale at `now` has no critters to give.
 */
export function rollCritter(
  rng: Rng,
  packId: string,
  now: number = Date.now(),
): CritterDef | undefined {
  const pack = findPack(packId);
  if (pack === undefined || !isPackAvailable(pack, now)) {
    return undefined;
  }

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
 * Picks a catch of a tier, weighted by its wiki chance.
 *
 * The rows of a tier are not equally likely: the wiki gives a Jellyfish 15 %
 * and a Goldfish 10 %. Keeping the chance as the weight of the pick makes the
 * individual catches follow the table inside their tier.
 */
export function pickWeightedCatch(rng: Rng, pool: readonly CatchDef[]): CatchDef | undefined {
  if (pool.length === 0) {
    return undefined;
  }

  const total = pool.reduce((sum, entry) => sum + Math.max(0, entry.chance), 0);
  if (total <= 0) {
    return pool[rng.int(0, pool.length - 1)];
  }

  let roll = rng.next() * total;
  let fallback = pool[pool.length - 1];

  for (const entry of pool) {
    fallback = entry;
    roll -= Math.max(0, entry.chance);
    if (roll < 0) {
      return entry;
    }
  }

  return fallback;
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
  const now = options.now ?? Date.now();

  const next: RollState = {
    ...state,
    baits: { ...state.baits },
  };

  // The lure rank the tier is rolled at. The Frenzy lifts it by 2 (as high as
  // the Frenzy rank, S+). Bonus review cards roll at the lure rank too (no
  // Frenzy lift): v0.1.8 forced them to rank 1, which only holds Trash, so a
  // mastery session full of repeats caught Trash at the Legend Lure.
  const frenzyActive = next.frenzyCatchesLeft > 0;
  const rank = clampRollRank(next.lureRank + (frenzyActive && !bonus ? FRENZY_RANK_BONUS : 0));

  // The frenzy always lasts for FRENZY_CATCHES catches, no matter what came
  // out of the roll.
  if (frenzyActive) {
    next.frenzyCatchesLeft = next.frenzyCatchesLeft - 1;
  }

  // 1. The lure guarantee.
  // The rank itself moves when the catch is claimed (see applyLureUpgrade).
  if (next.lureRank < MAX_LURE_RANK && next.luresReeledUp < guaranteedLureCount(next.correctCount)) {
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
    const special = rollSpecial(rng, next, bonus, critterPackId, now);
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

  // 4. The catch of the tier: a critter (or a piece of junk at the bottom of
  // the ladder). The pool holds the critters of the packs that are on sale;
  // every catch keeps its wiki chance as a weight inside its tier.
  const pool = catchPool(tier, { season, now });
  const catchDef = pickWeightedCatch(rng, pool);
  /* v8 ignore next -- the junk pile always has a catch */
  if (catchDef === undefined) {
    // The pool is empty (only possible when the catalogue is empty), fall
    // back to the junk pile so the game never dead ends.
    const fallbackPool = catchesOfTier('trash', { season, now });
    const fallback = pickWeightedCatch(rng, fallbackPool);
    if (fallback === undefined) {
      throw new Error('The catch catalogue is empty.');
    }
    return {
      outcome: { kind: 'junk', tier: 'trash', catch: fallback, lbs: rollWeight(rng, fallback) },
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

  return {
    outcome: toOutcome(catchDef, lbs),
    state: next,
    rank,
    luckyCharmUsed,
    frenzyActive,
  };
}

/**
 * Turns a catch of the catalogue into the outcome of a roll.
 *
 * A critter catch carries the critter itself, so the reveal card can show its
 * rarity and its vibe. A catch never grants the critter to the collection:
 * only a pack does.
 */
export function toOutcome(catchDef: CatchDef, lbs: number): CatchOutcome {
  if (catchDef.contentType === 'critter') {
    const critter = findCritter(catchDef.critterId ?? '');
    /* v8 ignore next -- every critter catch links to a critter of the catalogue */
    if (critter === undefined) {
      throw new Error(`The catch "${catchDef.id}" has no critter.`);
    }
    return { kind: 'critter', tier: catchDef.tier, catch: catchDef, lbs, critter };
  }

  if (catchDef.contentType === 'fish') {
    /* v8 ignore next -- the fish registry is empty until the first fish is added */
    return { kind: 'fish', tier: catchDef.tier, catch: catchDef, lbs };
  }

  if (catchDef.contentType === 'heavy') {
    return { kind: 'heavy', tier: catchDef.tier, catch: catchDef, lbs };
  }

  return { kind: 'junk', tier: catchDef.tier, catch: catchDef, lbs };
}

/**
 * Rolls the special table (§8).
 *
 * Returns `null` when the table cannot produce a catch (an empty critter
 * pack), so the caller can fall back to a normal catch.
 */
function rollSpecial(
  rng: Rng,
  state: RollState,
  bonus: boolean,
  critterPackId: string,
  now: number,
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
      // The rank moves when the catch is claimed (see applyLureUpgrade).
      return { outcome: { kind: 'new_lure' }, state: next };
    }
    case 'frenzy': {
      // The Frenzy starts when the catch is claimed (see applySpecialReward).
      return { outcome: { kind: 'frenzy' }, state: next };
    }
    case 'powerup': {
      const powerup = POWERUPS[rng.int(0, POWERUPS.length - 1)];
      /* v8 ignore next -- the powerup table is never empty */
      if (powerup === undefined) {
        return null;
      }
      return { outcome: { kind: 'powerup', powerup: powerup.id }, state: next };
    }
    case 'critter': {
      const critter = rollCritter(rng, critterPackId, now);
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
