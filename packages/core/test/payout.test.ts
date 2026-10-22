import { describe, expect, it } from 'vitest';

import { DEFAULT_PAYOUT_RULES, computePayout } from '../src/payout';

const zero = { correct: 0, graduated: 0, dueCleared: 0, modeScore: 0, tokensToday: 0 };

describe('computePayout', () => {
  it('uses the documented token economy', () => {
    expect(DEFAULT_PAYOUT_RULES).toEqual({
      tokensPerCorrect: 1.5,
      tokensPerGraduated: 1,
      tokensPerDueCleared: 0.25,
      modeBonusPerPoint: 0.01,
      tokensPerHeavyCatch: 15,
      softCap: 500,
      softCapRatio: 0.25,
    });
  });

  it('pays ~1.5 tokens per correct answer (rounded down)', () => {
    expect(computePayout({ ...zero, correct: 3 }).tokens).toBe(4);
    expect(computePayout({ ...zero, correct: 4 }).tokens).toBe(6);
  });

  it('hits the ~50 tokens per 10 minute session benchmark', () => {
    const payout = computePayout({ ...zero, correct: 30, graduated: 3, dueCleared: 10, modeScore: 200 });
    expect(payout.baseTokens).toBe(45 + 3 + 2);
    expect(payout.bonusTokens).toBe(2);
    expect(payout.tokens).toBeGreaterThanOrEqual(45);
    expect(payout.tokens).toBeLessThanOrEqual(60);
    expect(payout.capped).toBe(false);
  });

  it('applies the soft daily cap', () => {
    const payout = computePayout({ ...zero, correct: 100, tokensToday: 450 });
    expect(payout.grossTokens).toBe(150);
    expect(payout.tokens).toBe(50 + Math.floor(100 * 0.25));
    expect(payout.capped).toBe(true);
  });

  it('does not cap a payout that fits into the remaining budget', () => {
    const payout = computePayout({ ...zero, correct: 20, tokensToday: 450 });
    expect(payout.tokens).toBe(30);
    expect(payout.capped).toBe(false);
  });

  it('keeps paying a reduced rate once the cap is reached', () => {
    const payout = computePayout({ ...zero, correct: 40, tokensToday: 600 });
    expect(payout.tokens).toBe(15);
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

    expect(payout.softCap).toBe(500);
  });
});

describe('the heavy catch bonus', () => {
  it('pays 15 tokens per heavy catch', () => {
    const payout = computePayout({ ...zero, heavyCatches: 1 });

    expect(payout.heavyTokens).toBe(15);
    expect(payout.tokens).toBe(15);
  });

  it('adds the bonus to the rest of the payout', () => {
    const plain = computePayout({ ...zero, correct: 10 });
    const heavy = computePayout({ ...zero, correct: 10, heavyCatches: 2 });

    expect(plain.tokens).toBe(15);
    expect(heavy.tokens).toBe(plain.tokens + 30);
    expect(heavy.grossTokens).toBe(plain.grossTokens + 30);
  });

  it('pays a multiple of 5', () => {
    for (let count = 0; count <= 5; count += 1) {
      const payout = computePayout({ ...zero, heavyCatches: count });
      expect(payout.heavyTokens % 5).toBe(0);
      expect(payout.tokens % 5).toBe(0);
    }
  });

  it('ignores a missing or broken count', () => {
    expect(computePayout({ ...zero, heavyCatches: -3 }).heavyTokens).toBe(0);
    expect(computePayout({ ...zero, heavyCatches: Number.NaN }).heavyTokens).toBe(0);
  });

  it('is capped by the soft daily cap like the rest', () => {
    const payout = computePayout({ ...zero, heavyCatches: 10, tokensToday: 450 });

    expect(payout.grossTokens).toBe(150);
    expect(payout.tokens).toBe(50 + Math.floor(100 * 0.25));
    expect(payout.capped).toBe(true);
  });
});
