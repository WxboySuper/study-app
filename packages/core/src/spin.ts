/**
 * The daily spin (docs/SPEC.md "Daily spin + XP").
 *
 * The wheel can be spun once per local day. It pays between 10 and 1,000
 * tokens, weighted low: most spins pay 10 to 50 tokens and the jackpot is
 * rare. The tokens of the spin do not count toward the daily earning cap of
 * the study sessions, so the wheel is a bonus and never a way to farm.
 *
 * Everything here is pure: the random source is injected, so the
 * distribution can be tested with a seeded RNG.
 */

import type { Rng } from './fishing/roll';
import type { WalletSnapshot } from './wallet';

/** One segment of the daily wheel. */
export interface SpinSegment {
  /** The tokens the segment pays. */
  reward: number;
  /** The weight of the segment, in percent. */
  weight: number;
}

/**
 * The segments of the daily wheel.
 *
 * The weights add up to 100 %: most spins pay 10 to 50 tokens, the big
 * rewards are rare and the jackpot is the needle in the haystack.
 */
export const SPIN_SEGMENTS: readonly SpinSegment[] = [
  { reward: 10, weight: 35 },
  { reward: 20, weight: 28 },
  { reward: 30, weight: 18 },
  { reward: 50, weight: 12 },
  { reward: 100, weight: 5 },
  { reward: 250, weight: 1.5 },
  { reward: 500, weight: 0.4 },
  { reward: 1000, weight: 0.1 },
];

/** The reward of the jackpot segment. */
export const SPIN_JACKPOT = 1000;

/** The total weight of the wheel (always 100). */
export const SPIN_TOTAL_WEIGHT = SPIN_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);

/**
 * Spins the daily wheel and returns the tokens it pays.
 *
 * The segments are drawn with their weight, so the 10 token segment comes up
 * 30 times out of 100.
 */
export function spinDailyWheel(rng: Rng): number {
  const roll = rng.next() * SPIN_TOTAL_WEIGHT;

  let cumulative = 0;
  for (const segment of SPIN_SEGMENTS) {
    cumulative += segment.weight;
    if (roll < cumulative) {
      return segment.reward;
    }
  }

  /* v8 ignore next -- the weights add up to 100 % */
  return SPIN_SEGMENTS[SPIN_SEGMENTS.length - 1]?.reward ?? 10;
}

/** The segment that pays a reward. */
export function findSpinSegment(reward: number): SpinSegment | undefined {
  return SPIN_SEGMENTS.find((segment) => segment.reward === reward);
}

/** The index of the segment that pays a reward (the order of the wheel). */
export function spinSegmentIndex(reward: number): number {
  return SPIN_SEGMENTS.findIndex((segment) => segment.reward === reward);
}

/**
 * Whether the player may spin the wheel.
 *
 * The wheel can be spun once per local day (`YYYY-MM-DD`): the last spin of
 * another day does not block the spin of today.
 */
export function canSpin(lastSpinDay: string | null | undefined, today: string): boolean {
  if (typeof lastSpinDay !== 'string' || lastSpinDay.length === 0) {
    return true;
  }
  return lastSpinDay !== today;
}

/**
 * Credits the reward of the wheel to a wallet.
 *
 * The tokens of the wheel do not count toward the daily earning cap of the
 * study sessions, so only the balance of the wallet grows.
 */
export function applySpinReward(wallet: WalletSnapshot, reward: number): WalletSnapshot {
  return { ...wallet, balance: wallet.balance + reward };
}

/** How close to a segment edge the wheel may stop, in degrees. */
export const SPIN_EDGE_MARGIN_DEG = 2;

/** The angle of one segment of the wheel, in degrees. */
export const SPIN_SEGMENT_DEG = 360 / SPIN_SEGMENTS.length;

/**
 * The segment under the pointer at a rotation of the wheel.
 *
 * The wedges are drawn clockwise from 12 o'clock (segment 0 spans
 * `[0, step)`), the pointer sits at 12 o'clock and a positive rotation turns
 * the wheel clockwise. A rotation `r` puts the angle `-r` of the face under
 * the pointer.
 *
 * Keep in sync with the `segmentAt` worklet of the mobile wheel.
 */
export function spinSegmentAtRotation(rotation: number): number {
  'worklet';
  const count = SPIN_SEGMENTS.length;
  const step = 360 / count;
  const face = (((-rotation) % 360) + 360) % 360;
  const index = Math.floor(face / step);
  return ((index % count) + count) % count;
}

/**
 * The final rotation that lands the wheel on a segment.
 *
 * The wheel turns `turns` full times and stops with the centre of the
 * segment under the pointer, offset by `jitter` in `[-1, 1]`: -1 and 1 put
 * the pointer `SPIN_EDGE_MARGIN_DEG` inside either edge of the segment, so a
 * uniform jitter lands anywhere across the segment and never on a line.
 */
export function spinTargetRotation(index: number, turns = 5, jitter = 0): number {
  const step = SPIN_SEGMENT_DEG;
  const safe = Math.max(-1, Math.min(1, jitter));
  return turns * 360 - (index + 0.5) * step + safe * (step / 2 - SPIN_EDGE_MARGIN_DEG);
}
