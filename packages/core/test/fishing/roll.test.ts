import { describe, expect, it } from 'vitest';

import { CRITTER_RARITY_ODDS } from '../../src/critters';
import {
  BASE_SPECIAL_ODDS,
  FRENZY_CATCHES,
  LURE_GUARANTEE_THRESHOLDS,
  POWERUPS,
  SPECIAL_SHARE_BY_RANK,
  TIER_ODDS,
  baseTierOdds,
  createRandomRng,
  createRollState,
  createSeededRng,
  findPowerup,
  guaranteedLureCount,
  isCatchOutcome,
  pickWeightedCatch,
  rollCatch,
  rollCritter,
  rollTier,
  rollWeight,
  specialOddsFor,
  tierOddsForRank,
  weightMultiplier,
  applyLureUpgrade,
  applySpecialReward,
  lurePaceFor,
  ENDLESS_LURE_PACE,
  TIER_WEIGHTS_BY_RANK,
} from '../../src/fishing/roll';
import { catchesOfTier } from '../../src/fishing/catches';
import { findsCatch, fixedRng, sequenceRng } from './helpers';

/** Oct 21 2026: inside the window of the seasonal pack. */
const INSIDE_THE_WINDOW = Date.UTC(2026, 9, 21, 12, 0, 0);
/** Dec 24 2026: after the window of the seasonal pack. */
const OUTSIDE_THE_WINDOW = Date.UTC(2027, 1, 24, 12, 0, 0);

describe('the seeded RNG', () => {
  it('is deterministic', () => {
    const first = createSeededRng(42);
    const second = createSeededRng(42);
    const values = Array.from({ length: 10 }, () => first.next());
    expect(values).toEqual(Array.from({ length: 10 }, () => second.next()));
  });

  it('produces different streams for different seeds', () => {
    expect(createSeededRng(1).next()).not.toBe(createSeededRng(2).next());
  });

  it('stays inside the bounds', () => {
    const rng = createSeededRng(7);
    for (let index = 0; index < 100; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const int = rng.int(3, 5);
      expect(int).toBeGreaterThanOrEqual(3);
      expect(int).toBeLessThanOrEqual(5);
    }
  });

  it('has a random variant', () => {
    const rng = createRandomRng();
    expect(rng.next()).toBeGreaterThanOrEqual(0);
    expect(rng.next()).toBeLessThan(1);
  });
});

describe('the tier odds table (§6)', () => {
  it('adds up to 100 % for every rank', () => {
    for (const odds of TIER_ODDS) {
      const total =
        odds.trash +
        odds.easy +
        odds.great +
        odds.rare +
        odds.epic +
        odds.cotd +
        odds.legend +
        odds.special;
      expect(total).toBeCloseTo(100, 10);
    }
  });

  it('derives the tiers from the wiki rows and the rank availability', () => {
    expect(TIER_ODDS.map((odds) => odds.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    // Only trash swims at the first lure; the special table takes its 5 %.
    expect(TIER_ODDS[0]).toMatchObject({
      trash: 95,
      easy: 0,
      great: 0,
      rare: 0,
      epic: 0,
      cotd: 0,
      legend: 0,
      special: 5,
    });
    // The third lure can catch the whole shallow half of the table.
    expect(TIER_ODDS[2]!.easy).toBeGreaterThan(TIER_ODDS[2]!.trash);
    expect(TIER_ODDS[2]!.great).toBeGreaterThan(TIER_ODDS[2]!.rare);
    // The best lure is the first one that can catch every tier.
    expect(TIER_ODDS[4]!.legend).toBeCloseTo(2, 10);
    expect(TIER_ODDS[4]!.special).toBe(8);
    // The Frenzy (S) leans on the deep tiers.
    expect(TIER_ODDS[5]!.cotd).toBeGreaterThan(TIER_ODDS[4]!.cotd);
  });

  it('uses the special share of every rank', () => {
    expect(SPECIAL_SHARE_BY_RANK).toEqual([5, 6, 7, 7, 8, 8]);
    for (const odds of TIER_ODDS) {
      expect(odds.special).toBe(SPECIAL_SHARE_BY_RANK[odds.rank - 1]);
    }
  });

  it('never gives a tier that the rank cannot catch', () => {
    for (const odds of TIER_ODDS) {
      for (const tier of ['trash', 'easy', 'great', 'rare', 'epic', 'cotd', 'legend'] as const) {
        if (odds[tier] > 0) {
          expect(tier === 'trash' ? odds.rank <= 3 : true).toBe(true);
        }
      }
    }
  });

  it('caps the Legend tier at 2 % of the best lure', () => {
    expect(TIER_ODDS[4]!.legend).toBeCloseTo(2, 10);
    expect(TIER_ODDS[5]!.legend).toBeCloseTo(2, 10);
  });

  it('clamps an unknown rank into the table', () => {
    expect(baseTierOdds(9).rank).toBe(6);
    expect(baseTierOdds(0).rank).toBe(1);
  });

  it('rolls the tiers of the table', () => {
    expect(rollTier(fixedRng(0.1), 1)).toBe('trash');
    expect(rollTier(fixedRng(0.5), 1)).toBe('trash');
    expect(rollTier(fixedRng(0.97), 1)).toBe('special');
    expect(rollTier(fixedRng(0.1), 5)).toBe('great');
    expect(rollTier(fixedRng(0.4), 5)).toBe('rare');
    expect(rollTier(fixedRng(0.7), 5)).toBe('epic');
    expect(rollTier(fixedRng(0.85), 5)).toBe('cotd');
    expect(rollTier(fixedRng(0.91), 5)).toBe('legend');
    expect(rollTier(fixedRng(0.95), 5)).toBe('special');
  });

  it('never rolls a tier that is out of the table', () => {
    for (let index = 0; index < 500; index += 1) {
      const tier = rollTier(createSeededRng(index), 1);
      expect(['trash', 'easy', 'great', 'rare', 'epic', 'cotd', 'legend', 'special']).toContain(tier);
    }
  });

  it('shifts the odds of the rare tiers for the Glow Jig', () => {
    const plain = tierOddsForRank(5);
    const glow = tierOddsForRank(5, { shinySpinner: false, glowJig: true, critterChum: false });

    // The Glow Jig lifts every rare tier; the Legend is capped again, so the
    // other tiers pick up a little more than the raw +2 points.
    expect(glow.rare).toBeGreaterThan(plain.rare);
    expect(glow.epic).toBeGreaterThan(plain.epic);
    expect(glow.cotd).toBeGreaterThan(plain.cotd);
    expect(glow.legend).toBeCloseTo(2, 10);
    expect(glow.great).toBeLessThan(plain.great);

    const total =
      glow.trash +
      glow.easy +
      glow.great +
      glow.rare +
      glow.epic +
      glow.cotd +
      glow.legend +
      glow.special;
    expect(total).toBeCloseTo(100, 10);
  });
});

describe('the heavy catches', () => {
  it('rolls a heavy catch on the Angler’s Legend tier', () => {
    const result = rollCatch(fixedRng(0.91), createRollState({ lureRank: 5 }));

    expect(isCatchOutcome(result.outcome)).toBe(true);
    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.tier).toBe('legend');
      expect(result.outcome.kind).toBe('heavy');
    }
  });

  it('weighs more than any critter tier', () => {
    const result = rollCatch(fixedRng(0.91), createRollState({ lureRank: 5 }));

    expect(isCatchOutcome(result.outcome)).toBe(true);
    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.lbs).toBeGreaterThanOrEqual(500_000);
    }
  });

  it('lands on about 2 % of the catches of the best lure', () => {
    const total = 20_000;
    let heavy = 0;

    for (let index = 0; index < total; index += 1) {
      const result = rollCatch(createSeededRng(index), createRollState({ lureRank: 5 }));
      if (isCatchOutcome(result.outcome) && result.outcome.tier === 'legend') {
        heavy += 1;
      }
    }

    expect(heavy / total).toBeGreaterThan(0.015);
    expect(heavy / total).toBeLessThan(0.025);
  });
});

describe('the special table (§8)', () => {
  it('matches the design doc', () => {
    expect(BASE_SPECIAL_ODDS).toEqual({
      newLure: 30,
      frenzy: 15,
      powerup: 40,
      critter: 12,
      packTicket: 3,
    });
  });

  it('adds up to 100 %', () => {
    const total = Object.values(BASE_SPECIAL_ODDS).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(100);
  });

  it('gives the critter share to the Critter Chum', () => {
    const odds = specialOddsFor(createRollState({ baits: { shinySpinner: false, glowJig: false, critterChum: true } }));
    expect(odds.critter).toBeCloseTo(16, 10);
    expect(odds.newLure + odds.frenzy + odds.powerup + odds.packTicket + odds.critter).toBeCloseTo(100, 10);
  });

  it('never rolls a critter or a ticket on a bonus card', () => {
    const odds = specialOddsFor(createRollState(), { bonus: true });
    expect(odds.critter).toBe(0);
    expect(odds.packTicket).toBe(0);
    expect(odds.newLure + odds.frenzy + odds.powerup).toBeCloseTo(100, 10);
  });

  it('never rolls a ticket when the caps are reached', () => {
    const perSession = specialOddsFor(createRollState({ packTicketsThisSession: 1 }));
    expect(perSession.packTicket).toBe(0);

    const perDay = specialOddsFor(createRollState({ packTicketsToday: 1 }));
    expect(perDay.packTicket).toBe(0);
  });

  it('knows the powerups', () => {
    expect(POWERUPS.map((powerup) => powerup.id)).toEqual([
      'double_hook',
      'lucky_charm',
      'second_chance',
      'heavy_sinker',
    ]);
    expect(findPowerup('double_hook').name).toBe('Double Hook');
    expect(() => findPowerup('nope' as never)).toThrow(/Unknown powerup/);
  });
});

describe('the tier weights of the lures', () => {
  // A 10k-catch simulation per lure, the same one as in the PR.
  const simulate = (rank: number) => {
    const rng = createSeededRng(rank * 7919);
    const counts: Record<string, number> = {};
    for (let index = 0; index < 10_000; index += 1) {
      const tier = rollTier(rng, rank);
      counts[tier] = (counts[tier] ?? 0) + 1;
    }
    return (tier: string) => (counts[tier] ?? 0) / 10_000;
  };

  it('keeps the low lures on Trash, Easy One and Great Catch', () => {
    for (const rank of [1, 2, 3]) {
      const share = simulate(rank);
      expect(share('trash') + share('easy') + share('great')).toBeGreaterThan(0.7);
      expect(share('rare')).toBeLessThan(0.16);
    }
  });

  it('only rolls Epic Grab from lure C, and rarely there', () => {
    expect(simulate(1)('epic')).toBe(0);
    expect(simulate(2)('epic')).toBe(0);
    expect(simulate(3)('epic')).toBeLessThan(0.07);
    expect(simulate(4)('epic')).toBeGreaterThan(simulate(3)('epic'));
  });

  it('has a row for every roll rank', () => {
    expect(TIER_WEIGHTS_BY_RANK).toHaveLength(6);
  });
});

describe('the lure pace', () => {
  it('scales with the mastery session and is slow and fixed in endless mode', () => {
    expect(lurePaceFor({ mastery: true, questionCount: 36 })).toBeCloseTo(17.55, 2);
    expect(lurePaceFor({ mastery: false, questionCount: 36 })).toBe(ENDLESS_LURE_PACE);
    expect(lurePaceFor({ mastery: true, questionCount: 0 })).toBe(ENDLESS_LURE_PACE);
    expect(lurePaceFor({ mastery: true, questionCount: 1 })).toBe(3);
    // A huge scope paces like a session of 36 (the lure used to need ~130 answers a level).
    expect(lurePaceFor({ mastery: true, questionCount: 266 })).toBeCloseTo(17.55, 2);
  });

  it('rolls New Lure as its own 1-in-pace chance and not in the special table', () => {
    const state = createRollState({ lurePace: 20 });
    expect(rollCatch(sequenceRng([0.01, 0.1, 0.0, 0.0]), state).outcome).toEqual({ kind: 'new_lure' });
    expect(rollCatch(sequenceRng([0.5, 0.1, 0.0, 0.0]), state).outcome.kind).toBe('junk');
    expect(specialOddsFor(state).newLure).toBe(0);
    expect(rollCatch(sequenceRng([0.01, 0.1, 0.0]), createRollState({ lurePace: 20, lureRank: 5 })).outcome.kind).not.toBe('new_lure');
  });

  it('keeps a trailing safety net at 1.5x the pace', () => {
    expect(guaranteedLureCount(29, 20)).toBe(0);
    expect(guaranteedLureCount(30, 20)).toBe(1);
    expect(guaranteedLureCount(1000, 20)).toBe(4);
  });

  it('reaches the last lure late in a 36-question mastery session', () => {
    const pace = lurePaceFor({ mastery: true, questionCount: 36 });
    const at = (answers: number) => {
      let total = 0;
      for (let run = 0; run < 400; run += 1) {
        const rng = createSeededRng(run + 1);
        let state = createRollState({ lurePace: pace });
        for (let index = 0; index < answers; index += 1) {
          const result = rollCatch(rng, state, { now: 0 });
          state = result.state;
          if (rng.next() < 0.85) {
            state = applySpecialReward({ ...state, correctCount: state.correctCount + 1 }, result.outcome);
          }
        }
        total += state.lureRank;
      }
      return total / 400;
    };
    expect(at(26)).toBeLessThan(2.8);
    expect(at(108)).toBeGreaterThan(4.5);
  });
});

describe('the lure guarantee', () => {
  it('uses the thresholds of the design doc', () => {
    expect(LURE_GUARANTEE_THRESHOLDS).toEqual([8, 25, 55, 100]);
    expect(guaranteedLureCount(0)).toBe(0);
    expect(guaranteedLureCount(7)).toBe(0);
    expect(guaranteedLureCount(8)).toBe(1);
    expect(guaranteedLureCount(25)).toBe(2);
    expect(guaranteedLureCount(55)).toBe(3);
    expect(guaranteedLureCount(100)).toBe(4);
    expect(guaranteedLureCount(500)).toBe(4);
  });

  it('forces a lure when the guarantee is due', () => {
    const state = createRollState({ correctCount: 8, luresReeledUp: 0, lureRank: 1 });
    const result = rollCatch(sequenceRng([0.1, 0.1, 0.1]), state);

    expect(result.outcome).toEqual({ kind: 'new_lure' });
    // The upgrade is applied when the catch is claimed, not when it bites.
    expect(result.state.lureRank).toBe(1);
    expect(applyLureUpgrade(result.state)).toMatchObject({ lureRank: 2, luresReeledUp: 1 });
  });

  it('does not force a lure before the threshold', () => {
    const state = createRollState({ correctCount: 7, luresReeledUp: 0, lureRank: 1 });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.0]), state);

    expect(result.outcome.kind).toBe('junk');
  });

  it('never goes above the fifth lure rank', () => {
    const state = createRollState({ correctCount: 100, luresReeledUp: 0, lureRank: 5 });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.0]), state);
    expect(result.outcome.kind).not.toBe('new_lure');
    expect(applyLureUpgrade(createRollState({ lureRank: 5 })).lureRank).toBe(5);
  });
});

describe('rolling a catch', () => {
  it('rolls the junk of the bottom tier', () => {
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.0]), createRollState());
    expect(result.outcome.kind).toBe('junk');
    if (result.outcome.kind === 'junk') {
      expect(result.outcome.tier).toBe('trash');
      expect(result.outcome.catch.id).toBe('old_sneaker');
      expect(result.outcome.lbs).toBe(1);
    }
  });

  it('rolls a critter of the tier', () => {
    // The tier roll lands on "Easy One" at the second lure and the pool holds
    // the common critters of the packs that are on sale.
    const result = rollCatch(sequenceRng([0.5, 0.0, 0.5]), createRollState({ lureRank: 2 }), {
      now: INSIDE_THE_WINDOW,
    });
    expect(result.outcome.kind).toBe('critter');
    if (result.outcome.kind === 'critter') {
      expect(result.outcome.tier).toBe('easy');
      expect(result.outcome.critter.rarity).toBe('common');
      expect(result.outcome.catch.critterId).toBe(result.outcome.critter.id);
    }
  });

  it('only rolls the critters of the packs that are on sale', () => {
    const result = rollCatch(sequenceRng([0.5, 0.0, 0.5]), createRollState({ lureRank: 2 }), {
      now: OUTSIDE_THE_WINDOW,
    });
    expect(result.outcome.kind).toBe('critter');
    if (result.outcome.kind === 'critter') {
      expect(result.outcome.critter.packId).toBe('brain_buddies');
    }
  });

  it('rolls a new lure', () => {
    const result = rollCatch(sequenceRng([0.97, 0.1]), createRollState());
    expect(result.outcome).toEqual({ kind: 'new_lure' });
    expect(result.state.lureRank).toBe(1);
  });

  it('rolls a frenzy', () => {
    const result = rollCatch(sequenceRng([0.97, 0.35]), createRollState());
    expect(result.outcome).toEqual({ kind: 'frenzy' });
    // The Frenzy only starts when the catch is claimed.
    expect(result.state.frenzyCatchesLeft).toBe(0);
    expect(applySpecialReward(result.state, result.outcome).frenzyCatchesLeft).toBe(FRENZY_CATCHES);
  });

  it('rolls a powerup', () => {
    const result = rollCatch(sequenceRng([0.97, 0.6, 0.0]), createRollState());
    expect(result.outcome).toEqual({ kind: 'powerup', powerup: 'double_hook' });
    expect(result.state.powerup).toBeNull();
    expect(applySpecialReward(result.state, result.outcome).powerup).toBe('double_hook');
  });

  it('rolls a critter catch on the tier of its rarity', () => {
    // The special table lands on the critter special, the pack rolls a rare
    // critter and the first rare critter of Brain Buddies swims up.
    const result = rollCatch(sequenceRng([0.97, 0.95, 0.9, 0.0, 0.5]), createRollState());
    expect(result.outcome.kind).toBe('critter');
    if (result.outcome.kind === 'critter') {
      expect(result.outcome.critter.id).toBe('synapse_sprite');
      expect(result.outcome.critter.rarity).toBe('rare');
      expect(result.outcome.tier).toBe('rare');
    }
  });

  it('rolls a pack ticket', () => {
    const result = rollCatch(sequenceRng([0.97, 0.99]), createRollState());
    expect(result.outcome).toEqual({ kind: 'pack_ticket' });
    expect(result.state.packTicketsThisSession).toBe(0);
    expect(applySpecialReward(result.state, result.outcome).packTicketsThisSession).toBe(1);
  });

  it('never rolls a ticket when the session cap is reached', () => {
    const state = createRollState({ packTicketsThisSession: 1 });
    const result = rollCatch(sequenceRng([0.97, 0.99]), state);
    expect(result.outcome.kind).not.toBe('pack_ticket');
  });

  it('never rolls a ticket when the day cap is reached', () => {
    const state = createRollState({ packTicketsToday: 1 });
    const result = rollCatch(sequenceRng([0.97, 0.99]), state);
    expect(result.outcome.kind).not.toBe('pack_ticket');
  });

  it('rolls a bonus card at the lure rank (never Trash at lure A)', () => {
    const state = createRollState({ lureRank: 5 });
    const result = rollCatch(sequenceRng([0.5, 0.0, 0.0]), state, { bonus: true });
    expect(result.rank).toBe(5);
    for (let seed = 0; seed < 2000; seed += 1) {
      const rolled = rollCatch(createSeededRng(seed), state, { bonus: true });
      if (isCatchOutcome(rolled.outcome)) {
        expect(rolled.outcome.tier).not.toBe('trash');
      }
    }
  });

  it('does not lift a bonus card with the Frenzy', () => {
    const state = createRollState({ lureRank: 3, frenzyCatchesLeft: 2 });
    expect(rollCatch(sequenceRng([0.5, 0.0, 0.0]), state, { bonus: true }).rank).toBe(3);
  });

  it('never rolls a ticket for a bonus card', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const result = rollCatch(createSeededRng(seed), createRollState(), { bonus: true });
      expect(result.outcome.kind).not.toBe('pack_ticket');
    }
  });

  it('never rolls the critter special for a bonus card', () => {
    const odds = specialOddsFor(createRollState(), { bonus: true });
    expect(odds.critter).toBe(0);
  });

  it('falls back to the junk when the critter pack is empty', () => {
    const result = rollCatch(sequenceRng([0.97, 0.95, 0.0, 0.0]), createRollState(), {
      critterPackId: 'nope',
    });
    expect(result.outcome.kind).toBe('junk');
    if (result.outcome.kind === 'junk') {
      expect(result.outcome.tier).toBe('trash');
    }
  });

  it('rolls a weight inside the range of the catch', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const result = rollCatch(createSeededRng(seed), createRollState({ lureRank: 5 }));
      if (isCatchOutcome(result.outcome)) {
        expect(result.outcome.lbs).toBeGreaterThanOrEqual(result.outcome.catch.minLbs);
        expect(result.outcome.lbs).toBeLessThanOrEqual(result.outcome.catch.maxLbs);
      }
    }
  });
});

describe('the frenzy', () => {
  it('rolls two ranks higher and doubles the weight', () => {
    const state = createRollState({ lureRank: 1, frenzyCatchesLeft: FRENZY_CATCHES });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.0]), state);

    expect(result.frenzyActive).toBe(true);
    expect(result.rank).toBe(3);
    if (result.outcome.kind === 'junk') {
      expect(result.outcome.lbs).toBe(2);
    }
    expect(result.state.frenzyCatchesLeft).toBe(FRENZY_CATCHES - 1);
  });

  it('reaches the Frenzy rank (S+) from the best lure', () => {
    const state = createRollState({ lureRank: 5, frenzyCatchesLeft: 1 });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.5]), state);
    expect(result.rank).toBe(6);
  });

  it('lasts for five catches', () => {
    let state = createRollState({ lureRank: 1, frenzyCatchesLeft: FRENZY_CATCHES });
    for (let index = 0; index < FRENZY_CATCHES; index += 1) {
      const result = rollCatch(createSeededRng(index), state);
      expect(result.frenzyActive).toBe(true);
      state = result.state;
    }
    const after = rollCatch(createSeededRng(99), state);
    expect(after.frenzyActive).toBe(false);
    expect(after.state.frenzyCatchesLeft).toBe(0);
  });
});

describe('the powerups', () => {
  it('rerolls trash and easy with the Lucky Charm', () => {
    const state = createRollState({ powerup: 'lucky_charm', lureRank: 2 });
    const result = rollCatch(sequenceRng([0.1, 0.8, 0.0, 0.0]), state);

    expect(result.luckyCharmUsed).toBe(true);
    expect(result.state.powerup).toBeNull();
    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.tier).toBe('great');
    }
  });

  it('keeps the Lucky Charm when the catch is already good', () => {
    const state = createRollState({ powerup: 'lucky_charm', lureRank: 2 });
    const result = rollCatch(sequenceRng([0.8, 0.0, 0.0]), state);

    expect(result.luckyCharmUsed).toBe(false);
    expect(result.state.powerup).toBe('lucky_charm');
  });

  it('triples the weight with the Heavy Sinker', () => {
    const state = createRollState({ powerup: 'heavy_sinker' });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.0]), state);

    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.lbs).toBe(3);
    }
    expect(result.state.powerup).toBeNull();
  });

  it('adds 10 % weight with the Shiny Spinner', () => {
    const state = createRollState({ baits: { shinySpinner: true, glowJig: false, critterChum: false } });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.5]), state);

    if (isCatchOutcome(result.outcome)) {
      // Old Sneaker rolls 6 lbs and the Spinner lifts it to 6.6 (round 7).
      expect(result.outcome.lbs).toBe(7);
    }
  });
});

describe('the weight helpers', () => {
  it('multiplies the weight', () => {
    const state = createRollState();
    expect(weightMultiplier(state, false)).toBe(1);
    expect(weightMultiplier(state, true)).toBe(2);
    expect(weightMultiplier(createRollState({ powerup: 'heavy_sinker' }), false)).toBe(3);
    expect(
      weightMultiplier(
        createRollState({ baits: { shinySpinner: true, glowJig: false, critterChum: false } }),
        false,
      ),
    ).toBeCloseTo(1.1, 10);
  });

  it('rolls a weight inside the range', () => {
    const catchDef = findsCatch('critter_synapse_sprite');
    const lbs = rollWeight(createSeededRng(11), catchDef);
    expect(lbs).toBeGreaterThanOrEqual(catchDef.minLbs);
    expect(lbs).toBeLessThanOrEqual(catchDef.maxLbs);
  });

  it('picks a catch weighted by its wiki chance', () => {
    const pool = catchesOfTier('trash');
    expect(pickWeightedCatch(fixedRng(0), pool)?.id).toBe('old_sneaker');
    // The first Old Boot row is 15 % of the 100 % pool, so 0.99 lands on the
    // last row and not on the heaviest one.
    expect(pickWeightedCatch(fixedRng(0.99), pool)?.id).not.toBe('old_sneaker');
    expect(pickWeightedCatch(fixedRng(0), [])).toBeUndefined();
  });
});

describe('rolling a critter', () => {
  it('uses the pack odds of the SPEC', () => {
    expect(CRITTER_RARITY_ODDS).toEqual({
      common: 60,
      uncommon: 25,
      rare: 10,
      epic: 4,
      legendary: 1,
    });
  });

  it('picks a critter of the pack', () => {
    const critter = rollCritter(createSeededRng(5), 'brain_buddies');
    expect(critter).toBeDefined();
    expect(critter?.packId).toBe('brain_buddies');
  });

  it('returns nothing for an empty pack', () => {
    expect(rollCritter(createSeededRng(5), 'nope')).toBeUndefined();
  });

  it('returns nothing for a pack that is not on sale', () => {
    expect(rollCritter(createSeededRng(5), 'midterm_monsters', OUTSIDE_THE_WINDOW)).toBeUndefined();
    expect(rollCritter(createSeededRng(5), 'midterm_monsters', INSIDE_THE_WINDOW)).toBeDefined();
  });
});
