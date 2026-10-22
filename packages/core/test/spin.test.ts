import { describe, expect, it } from 'vitest';

import { createSeededRng } from '../src/fishing/roll';
import {
  SPIN_JACKPOT,
  SPIN_SEGMENTS,
  SPIN_TOTAL_WEIGHT,
  applySpinReward,
  canSpin,
  findSpinSegment,
  spinDailyWheel,
  spinSegmentAtRotation,
  spinSegmentIndex,
  spinTargetRotation,
} from '../src/spin';
import { emptyWallet } from '../src/wallet';

describe('the daily wheel', () => {
  it('has the segments of the SPEC', () => {
    expect(SPIN_SEGMENTS).toEqual([
      { reward: 10, weight: 30 },
      { reward: 20, weight: 25 },
      { reward: 30, weight: 17 },
      { reward: 50, weight: 13 },
      { reward: 100, weight: 8 },
      { reward: 250, weight: 5 },
      { reward: 500, weight: 1.5 },
      { reward: 1000, weight: 0.5 },
    ]);
    expect(SPIN_TOTAL_WEIGHT).toBe(100);
    expect(SPIN_JACKPOT).toBe(1000);
  });

  it('pays one of the segments', () => {
    const rng = createSeededRng(11);
    for (let index = 0; index < 100; index += 1) {
      expect(findSpinSegment(spinDailyWheel(rng))).toBeDefined();
    }
  });

  it('follows the weights over many spins', () => {
    const rng = createSeededRng(20261021);
    const runs = 40_000;
    const counts = new Map<number, number>();

    for (let index = 0; index < runs; index += 1) {
      const reward = spinDailyWheel(rng);
      counts.set(reward, (counts.get(reward) ?? 0) + 1);
    }

    for (const segment of SPIN_SEGMENTS) {
      const share = ((counts.get(segment.reward) ?? 0) / runs) * 100;
      // The rare segments need a wide margin, the common ones a tight one.
      const margin = segment.weight <= 5 ? 0.6 : 1.5;
      expect(share).toBeGreaterThan(segment.weight - margin);
      expect(share).toBeLessThan(segment.weight + margin);
    }
  });

  it('finds the segment of a reward', () => {
    expect(spinSegmentIndex(250)).toBe(5);
    expect(spinSegmentIndex(1234)).toBe(-1);
  });
});

describe('canSpin', () => {
  it('allows one spin per local day', () => {
    expect(canSpin('2026-10-21', '2026-10-21')).toBe(false);
    expect(canSpin('2026-10-20', '2026-10-21')).toBe(true);
    expect(canSpin(null, '2026-10-21')).toBe(true);
    expect(canSpin(undefined, '2026-10-21')).toBe(true);
    expect(canSpin('', '2026-10-21')).toBe(true);
  });
});

describe('applySpinReward', () => {
  it('credits the balance without touching the daily cap', () => {
    const wallet = { ...emptyWallet('2026-10-21'), balance: 40, tokensToday: 480 };
    const next = applySpinReward(wallet, 250);

    expect(next.balance).toBe(290);
    // The wheel is a bonus: it does not count toward the daily earning cap.
    expect(next.tokensToday).toBe(480);
    expect(wallet.balance).toBe(40);
  });
});

describe('the angle of the wheel', () => {
  it('lands on the chosen segment for every segment, turn count and jitter', () => {
    SPIN_SEGMENTS.forEach((segment, index) => {
      for (const turns of [0, 1, 5, 8]) {
        for (const jitter of [-1, -0.7, -0.3, 0, 0.3, 0.7, 1]) {
          const rotation = spinTargetRotation(index, turns, jitter);
          expect(spinSegmentAtRotation(rotation)).toBe(index);
          expect(SPIN_SEGMENTS[spinSegmentAtRotation(rotation)]?.reward).toBe(segment.reward);
        }
      }
    });
  });

  it('maps the reward back to the same segment after the rotation', () => {
    for (const segment of SPIN_SEGMENTS) {
      const index = spinSegmentIndex(segment.reward);
      expect(spinSegmentAtRotation(spinTargetRotation(index))).toBe(index);
    }
  });

  it('reads the segment boundaries clockwise from the pointer', () => {
    const step = 360 / SPIN_SEGMENTS.length;
    expect(spinSegmentAtRotation(0)).toBe(0);
    expect(spinSegmentAtRotation(-step + 0.01)).toBe(0);
    expect(spinSegmentAtRotation(-step - 0.01)).toBe(1);
    expect(spinSegmentAtRotation(0.01)).toBe(SPIN_SEGMENTS.length - 1);
    expect(spinSegmentAtRotation(-360 * 3 - step * 2.5)).toBe(2);
  });
});
