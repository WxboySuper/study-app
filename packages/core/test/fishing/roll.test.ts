import { describe, expect, it } from 'vitest';

import { CRITTER_RARITY_ODDS } from '../../src/critters';
import {
  BASE_SPECIAL_ODDS,
  FRENZY_CATCHES,
  LURE_GUARANTEE_THRESHOLDS,
  POWERUPS,
  TIER_ODDS,
  baseTierOdds,
  createRandomRng,
  createRollState,
  createSeededRng,
  findPowerup,
  guaranteedLureCount,
  isCatchOutcome,
  rollCatch,
  rollCritter,
  rollTier,
  rollWeight,
  specialOddsFor,
  tierOddsForRank,
  weightMultiplier,
} from '../../src/fishing/roll';
import { findsCatch, fixedRng, sequenceRng } from './helpers';

/** Oct 21 2026: inside the window of the seasonal pack. */
const INSIDE_THE_WINDOW = Date.UTC(2026, 9, 21, 12, 0, 0);
/** Dec 24 2026: after the window of the seasonal pack. */
const OUTSIDE_THE_WINDOW = Date.UTC(2026, 11, 24, 12, 0, 0);

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
        odds.heavy +
        odds.special;
      expect(total).toBeCloseTo(100, 10);
    }
  });

  it('matches the design doc', () => {
    expect(TIER_ODDS.map((odds) => odds.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(TIER_ODDS[0]).toMatchObject({ trash: 28, easy: 45, great: 16, rare: 4, epic: 0, cotd: 0, legend: 0, heavy: 2, special: 5 });
    expect(TIER_ODDS[4]).toMatchObject({ trash: 3, easy: 12, great: 22, rare: 28, epic: 18, cotd: 6, legend: 1, heavy: 2, special: 8 });
  });

  it('gives the heavy tier about 2 % of the catches', () => {
    for (const odds of TIER_ODDS) {
      expect(odds.heavy).toBeCloseTo(2, 10);
    }
  });

  it('falls back to rank 1 for an unknown rank', () => {
    expect(baseTierOdds(9)).toBe(TIER_ODDS[0]);
    expect(baseTierOdds(3).rank).toBe(3);
  });

  it('rolls the tiers of the table', () => {
    expect(rollTier(fixedRng(0.1), 1)).toBe('trash');
    expect(rollTier(fixedRng(0.5), 1)).toBe('easy');
    expect(rollTier(fixedRng(0.8), 1)).toBe('great');
    expect(rollTier(fixedRng(0.9), 1)).toBe('rare');
    expect(rollTier(fixedRng(0.94), 1)).toBe('heavy');
    expect(rollTier(fixedRng(0.97), 1)).toBe('special');
    expect(rollTier(fixedRng(0.2), 5)).toBe('great');
    expect(rollTier(fixedRng(0.1), 5)).toBe('easy');
  });

  it('never rolls a tier that is out of the table', () => {
    for (let index = 0; index < 500; index += 1) {
      const tier = rollTier(createSeededRng(index), 1);
      expect(['trash', 'easy', 'great', 'rare', 'epic', 'cotd', 'legend', 'heavy', 'special']).toContain(tier);
    }
  });

  it('shifts the odds of the rare tiers for the Glow Jig', () => {
    const plain = tierOddsForRank(1);
    const glow = tierOddsForRank(1, { shinySpinner: false, glowJig: true, critterChum: false });

    expect(glow.rare).toBeCloseTo(plain.rare + 2, 10);
    expect(glow.epic).toBeCloseTo(plain.epic + 2, 10);
    expect(glow.cotd).toBeCloseTo(plain.cotd + 2, 10);
    expect(glow.legend).toBeCloseTo(plain.legend + 2, 10);
    expect(glow.heavy).toBeCloseTo(plain.heavy + 2, 10);
    expect(glow.trash).toBeLessThan(plain.trash);

    const total =
      glow.trash +
      glow.easy +
      glow.great +
      glow.rare +
      glow.epic +
      glow.cotd +
      glow.legend +
      glow.heavy +
      glow.special;
    expect(total).toBeCloseTo(100, 10);
  });
});

describe('the heavy catches', () => {
  it('rolls a heavy catch on the heavy tier', () => {
    const result = rollCatch(fixedRng(0.94), createRollState({ lureRank: 1 }));

    expect(isCatchOutcome(result.outcome)).toBe(true);
    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.tier).toBe('heavy');
      expect(result.outcome.kind).toBe('heavy');
    }
  });

  it('weighs more than any critter tier', () => {
    const result = rollCatch(fixedRng(0.94), createRollState({ lureRank: 1 }));

    expect(isCatchOutcome(result.outcome)).toBe(true);
    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.lbs).toBeGreaterThanOrEqual(50);
    }
  });

  it('lands on about 2 % of the catches', () => {
    const total = 20_000;
    let heavy = 0;

    for (let index = 0; index < total; index += 1) {
      const result = rollCatch(createSeededRng(index), createRollState({ lureRank: 1 }));
      if (isCatchOutcome(result.outcome) && result.outcome.tier === 'heavy') {
        heavy += 1;
      }
    }

    expect(heavy / total).toBeGreaterThan(0.015);
    expect(heavy / total).toBeLessThan(0.025);
  });
});

describe('the special table (§8)', () => {  it('matches the design doc', () => {
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

describe('the lure guarantee', () => {
  it('uses the thresholds of the design doc', () => {
    expect(LURE_GUARANTEE_THRESHOLDS).toEqual([5, 12, 22, 35]);
    expect(guaranteedLureCount(0)).toBe(0);
    expect(guaranteedLureCount(4)).toBe(0);
    expect(guaranteedLureCount(5)).toBe(1);
    expect(guaranteedLureCount(12)).toBe(2);
    expect(guaranteedLureCount(22)).toBe(3);
    expect(guaranteedLureCount(35)).toBe(4);
    expect(guaranteedLureCount(100)).toBe(4);
  });

  it('forces a lure when the guarantee is due', () => {
    const state = createRollState({ correctCount: 5, luresReeledUp: 0, lureRank: 1 });
    const result = rollCatch(sequenceRng([0.1, 0.1, 0.1]), state);

    expect(result.outcome).toEqual({ kind: 'new_lure' });
    expect(result.state.lureRank).toBe(2);
    expect(result.state.luresReeledUp).toBe(1);
  });

  it('does not force a lure before the threshold', () => {
    const state = createRollState({ correctCount: 4, luresReeledUp: 0, lureRank: 1 });
    const result = rollCatch(sequenceRng([0.1, 0.1, 0.1]), state);

    expect(result.outcome.kind).toBe('junk');
  });

  it('never goes above the fifth rank', () => {
    const state = createRollState({ correctCount: 5, luresReeledUp: 0, lureRank: 5 });
    const result = rollCatch(sequenceRng([0.1]), state);
    expect(result.state.lureRank).toBe(5);
  });
});

describe('rolling a catch', () => {
  it('rolls the junk of the bottom tier', () => {
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.5]), createRollState());
    expect(result.outcome.kind).toBe('junk');
    if (result.outcome.kind === 'junk') {
      expect(result.outcome.tier).toBe('trash');
      expect(result.outcome.catch.id).toBe('old_sneaker');
      expect(result.outcome.lbs).toBe(2);
    }
  });

  it('rolls a critter of the tier', () => {
    // The tier roll lands on "Easy One" and the pool holds the common
    // critters of the packs that are on sale.
    const result = rollCatch(sequenceRng([0.5, 0.0, 0.5]), createRollState(), { now: INSIDE_THE_WINDOW });
    expect(result.outcome.kind).toBe('critter');
    if (result.outcome.kind === 'critter') {
      expect(result.outcome.tier).toBe('easy');
      expect(result.outcome.critter.rarity).toBe('common');
      expect(result.outcome.catch.critterId).toBe(result.outcome.critter.id);
    }
  });

  it('only rolls the critters of the packs that are on sale', () => {
    const result = rollCatch(sequenceRng([0.5, 0.0, 0.5]), createRollState(), { now: OUTSIDE_THE_WINDOW });
    expect(result.outcome.kind).toBe('critter');
    if (result.outcome.kind === 'critter') {
      expect(result.outcome.critter.packId).toBe('brain_buddies');
    }
  });

  it('rolls a new lure', () => {
    const result = rollCatch(sequenceRng([0.97, 0.1]), createRollState());
    expect(result.outcome).toEqual({ kind: 'new_lure' });
    expect(result.state.lureRank).toBe(2);
  });

  it('rolls a frenzy', () => {
    const result = rollCatch(sequenceRng([0.97, 0.35]), createRollState());
    expect(result.outcome).toEqual({ kind: 'frenzy' });
    expect(result.state.frenzyCatchesLeft).toBe(FRENZY_CATCHES);
  });

  it('rolls a powerup', () => {
    const result = rollCatch(sequenceRng([0.97, 0.6, 0.0]), createRollState());
    expect(result.outcome).toEqual({ kind: 'powerup', powerup: 'double_hook' });
    expect(result.state.powerup).toBe('double_hook');
  });

  it('rolls a critter catch on the tier of its rarity', () => {
    const result = rollCatch(sequenceRng([0.97, 0.9, 0.9, 0.0, 0.5]), createRollState());
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
    expect(result.state.packTicketsThisSession).toBe(1);
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

  it('rolls at rank 1 at best for a bonus card', () => {
    const state = createRollState({ lureRank: 5 });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.5]), state, { bonus: true });

    expect(result.rank).toBe(1);
    if (isCatchOutcome(result.outcome)) {
      // At rank 5 the same roll would be an "Easy One".
      expect(result.outcome.tier).toBe('trash');
    }
  });

  it('never rolls a ticket for a bonus card', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const result = rollCatch(createSeededRng(seed), createRollState(), { bonus: true });
      expect(result.outcome.kind).not.toBe('pack_ticket');
    }
  });

  it('never rolls the critter special for a bonus card', () => {
    // The critter share of the special table is zero on a bonus card.
    const odds = specialOddsFor(createRollState(), { bonus: true });
    expect(odds.critter).toBe(0);
  });

  it('falls back to the junk when the critter pack is empty', () => {
    const result = rollCatch(sequenceRng([0.97, 0.9, 0.9]), createRollState(), { critterPackId: 'nope' });
    expect(result.outcome.kind).toBe('junk');
    if (result.outcome.kind === 'junk') {
      expect(result.outcome.tier).toBe('trash');
    }
  });

  it('rolls a weight inside the range of the catch', () => {
    const rng = createSeededRng(3);
    const result = rollCatch(rng, createRollState());
    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.lbs).toBeGreaterThanOrEqual(result.outcome.catch.minLbs);
      expect(result.outcome.lbs).toBeLessThanOrEqual(result.outcome.catch.maxLbs);
    }
  });
});

describe('the frenzy', () => {
  it('rolls two ranks higher and doubles the weight', () => {
    const state = createRollState({ lureRank: 1, frenzyCatchesLeft: FRENZY_CATCHES });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.5]), state);

    expect(result.frenzyActive).toBe(true);
    expect(result.rank).toBe(3);
    if (result.outcome.kind === 'fish') {
      expect(result.outcome.lbs).toBe(12);
    }
    expect(result.state.frenzyCatchesLeft).toBe(FRENZY_CATCHES - 1);
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
    const state = createRollState({ powerup: 'lucky_charm' });
    const result = rollCatch(sequenceRng([0.1, 0.8, 0.0, 0.5]), state);

    expect(result.luckyCharmUsed).toBe(true);
    expect(result.state.powerup).toBeNull();
    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.tier).toBe('great');
    }
  });

  it('keeps the Lucky Charm when the catch is already good', () => {
    const state = createRollState({ powerup: 'lucky_charm' });
    const result = rollCatch(sequenceRng([0.8, 0.0, 0.5]), state);

    expect(result.luckyCharmUsed).toBe(false);
    expect(result.state.powerup).toBe('lucky_charm');
  });

  it('triples the weight with the Heavy Sinker', () => {
    const state = createRollState({ powerup: 'heavy_sinker' });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.5]), state);

    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.lbs).toBe(6);
    }
    expect(result.state.powerup).toBeNull();
  });

  it('adds 10 % weight with the Shiny Spinner', () => {
    const state = createRollState({ baits: { shinySpinner: true, glowJig: false, critterChum: false } });
    const result = rollCatch(sequenceRng([0.1, 0.0, 0.5]), state);

    if (isCatchOutcome(result.outcome)) {
      expect(result.outcome.lbs).toBe(2);
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
