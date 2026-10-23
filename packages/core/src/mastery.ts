import { Rating, State, type Grade } from "ts-fsrs";

import type { CardState } from "./types";

/**
 * The Mastery rules of docs/design/sync.md §6.1 (Anki, faithfully ported).
 *
 * - Grading is automatic and relative to the card's median answer time.
 * - A card is ★ Mastered once it is in Review with stability ≥ 21 days
 *   (Anki's "mature"). The n/3 count is only a visual meter.
 * - A card is a leech after 8 lapses (configurable).
 */

/** The median answer time used when a card has no history. */
export const DEFAULT_MEDIAN_ANSWER_MS = 8_000;
/** Anki's "mature" threshold. */
export const MATURE_STABILITY_DAYS = 21;
/** Anki's default leech threshold. */
export const DEFAULT_LEECH_THRESHOLD = 8;

/** The median of some answer times (`fallback` when there is none). */
export function medianAnswerMs(
  durations: readonly number[],
  fallback: number = DEFAULT_MEDIAN_ANSWER_MS,
): number {
  const valid = durations
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b);
  if (valid.length === 0) return fallback;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 1
    ? valid[mid]!
    : (valid[mid - 1]! + valid[mid]!) / 2;
}

/**
 * Wrong → Again. Right: slower than 1.5× the median → Hard, faster than
 * 0.5× → Easy, otherwise Good.
 */
export function gradeByAnswerTime(input: {
  correct: boolean;
  durationMs: number;
  medianMs?: number;
  /**
   * Lenient timing (math): only a very slow answer is `Hard`, and speed
   * never turns into `Easy` before the median.
   */
  lenient?: boolean;
}): Grade {
  if (!input.correct) return Rating.Again;
  const median =
    input.medianMs !== undefined && input.medianMs > 0
      ? input.medianMs
      : DEFAULT_MEDIAN_ANSWER_MS;
  if (input.lenient === true) {
    if (input.durationMs > median * 3) return Rating.Hard;
    if (input.durationMs < median * 0.35) return Rating.Easy;
    return Rating.Good;
  }
  if (input.durationMs > median * 1.5) return Rating.Hard;
  if (input.durationMs < median * 0.5) return Rating.Easy;
  return Rating.Good;
}

/** The label shown after a catch ("Good · 4.1 s"). */
export function gradeLabel(grade: Grade, durationMs: number): string {
  const names: Record<number, string> = {
    [Rating.Again]: "Again",
    [Rating.Hard]: "Hard",
    [Rating.Good]: "Good",
    [Rating.Easy]: "Easy",
  };
  return `${names[grade] ?? "Good"} · ${(Math.max(0, durationMs) / 1000).toFixed(1)} s`;
}

/** ★ Mastered: in Review and stability ≥ 21 days. */
export function isMatureMastered(state: CardState | undefined): boolean {
  return (
    state !== undefined &&
    state.state === State.Review &&
    state.stability >= MATURE_STABILITY_DAYS
  );
}

/** `true` once a card lapsed `threshold` times. */
export function isLeech(
  state: CardState | undefined,
  threshold: number = DEFAULT_LEECH_THRESHOLD,
): boolean {
  return state !== undefined && threshold > 0 && state.lapses >= threshold;
}

/** The daily limits of a preset. */
export interface DailyLimits {
  newPerDay: number;
  reviewsPerDay: number;
}
export const DEFAULT_DAILY_LIMITS: DailyLimits = {
  newPerDay: 20,
  reviewsPerDay: 200,
};

/**
 * How many new cards and reviews are still allowed today. Learning cards
 * always come back and never count toward the limits.
 */
export function remainingToday(
  done: { newDone: number; reviewsDone: number },
  limits: DailyLimits = DEFAULT_DAILY_LIMITS,
): { newLeft: number; reviewsLeft: number } {
  return {
    newLeft: Math.max(0, limits.newPerDay - Math.max(0, done.newDone)),
    reviewsLeft: Math.max(
      0,
      limits.reviewsPerDay - Math.max(0, done.reviewsDone),
    ),
  };
}
