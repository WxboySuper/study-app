import { describe, expect, it } from 'vitest';

import { DEFAULT_PAYOUT_RULES, computePayout } from '../src/payout';

describe('computePayout', () => {
  it('uses the documented token economy', () => {
    expect(DEFAULT_PAYOUT_RULES).toEqual({
      tokensPerCorrect: 10,
      tokensPerGraduated: 25,
      tokensPerDueCleared: 5,
      modeBonusPerPoint: 0.1,
      softCap: 300,
      softCapRatio: 0.25,
    });
  });

  it('pays 10 tokens per correct answer', () => {
    const payout = computePayout({
      correct: 3,
      graduated: 0,
      dueCleared: 0,
      modeScore: 0,
      tokensToday: 0,
    });

    expect(payout.baseTokens).toBe(30);
    expect(payout.tokens).toBe(30);
    expect(payout.capped).toBe(false);
  });

  it('pays 25 tokens per graduated card and 5 per cleared due card', () => {
    const payout = computePayout({
      correct: 2,
      graduated: 1,
      dueCleared: 4,
      modeScore: 0,
      tokensToday: 0,
    });

    expect(payout.baseTokens).toBe(20 + 25 + 20);
    expect(payout.tokens).toBe(65);
  });

  it('adds a mode bonus', () => {
    const payout = computePayout({
      correct: 0,
      graduated: 0,
      dueCleared: 0,
      modeScore: 145,
      tokensToday: 0,
    });

    expect(payout.bonusTokens).toBe(14);
    expect(payout.grossTokens).toBe(14);
    expect(payout.tokens).toBe(14);
  });

  it('applies the soft daily cap', () => {
    const payout = computePayout({
      correct: 100,
      graduated: 0,
      dueCleared: 0,
      modeScore: 0,
      tokensToday: 250,
    });

    // 50 of the 1000 tokens are still worth full price, the remaining 950 are
    // worth a quarter.
    expect(payout.grossTokens).toBe(1000);
    expect(payout.tokens).toBe(50 + Math.floor(950 * 0.25));
    expect(payout.capped).toBe(true);
  });

  it('does not cap a payout that fits into the remaining budget', () => {
    const payout = computePayout({
      correct: 5,
      graduated: 0,
      dueCleared: 0,
      modeScore: 0,
      tokensToday: 250,
    });

    expect(payout.tokens).toBe(50);
    expect(payout.capped).toBe(false);
  });

  it('keeps paying a reduced rate once the cap is reached', () => {
    const payout = computePayout({
      correct: 10,
      graduated: 0,
      dueCleared: 0,
      modeScore: 0,
      tokensToday: 400,
    });

    expect(payout.tokens).toBe(25);
    expect(payout.capped).toBe(true);
  });

  it('accepts custom rules', () => {
    const payout = computePayout(
      {
        correct: 2,
        graduated: 1,
        dueCleared: 1,
        modeScore: 100,
        tokensToday: 0,
      },
      {
        tokensPerCorrect: 1,
        tokensPerGraduated: 2,
        tokensPerDueCleared: 3,
        modeBonusPerPoint: 0.5,
        softCap: 10,
        softCapRatio: 0.5,
      },
    );

    expect(payout.baseTokens).toBe(1 * 2 + 2 * 1 + 3 * 1);
    expect(payout.bonusTokens).toBe(50);
    expect(payout.grossTokens).toBe(57);
    // 10 tokens at full price, the remaining 47 at half price.
    expect(payout.tokens).toBe(10 + Math.floor(47 * 0.5));
    expect(payout.capped).toBe(true);
  });

  it('ignores negative and non finite inputs', () => {
    const payout = computePayout({
      correct: -5,
      graduated: Number.NaN,
      dueCleared: -1,
      modeScore: -100,
      tokensToday: -10,
    });

    expect(payout.tokens).toBe(0);
    expect(payout.grossTokens).toBe(0);
  });

  it('reports the soft cap that was applied', () => {
    const payout = computePayout({
      correct: 0,
      graduated: 0,
      dueCleared: 0,
      modeScore: 0,
      tokensToday: 0,
    });

    expect(payout.softCap).toBe(300);
  });
});
