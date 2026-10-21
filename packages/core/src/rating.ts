import { Rating } from 'ts-fsrs';

/**
 * Everything the auto-grader needs to know about a single answered card.
 */
export interface AutoRatingInput {
  /** Did the player pick the right answer? */
  correct: boolean;
  /** How long the player took to answer, in milliseconds. */
  durationMs: number;
  /** How many correct answers in a row (the current streak). */
  streak: number;
}

/**
 * The thresholds that map "was it right?" + "how fast?" onto an FSRS rating.
 */
export interface AutoRatingThresholds {
  /** A correct answer that took longer than this is rated `Hard`. */
  hardAfterMs: number;
  /** A correct answer faster than this *may* be rated `Easy`. */
  easyUnderMs: number;
  /** Consecutive correct answers required before `Easy` is possible. */
  easyStreak: number;
}

/**
 * Defaults taken from docs/SPEC.md §3:
 * "wrong=Again, slow=Hard, correct=Good, fast streak=Easy".
 */
export const DEFAULT_AUTO_RATING_THRESHOLDS: AutoRatingThresholds = {
  hardAfterMs: 15_000,
  easyUnderMs: 4_000,
  easyStreak: 3,
};

/**
 * Derives an FSRS rating from the outcome of a single question.
 *
 * - wrong answer -> `Rating.Again`
 * - correct but slower than `hardAfterMs` -> `Rating.Hard`
 * - correct, fast (`< easyUnderMs`) and on a streak of `easyStreak` -> `Rating.Easy`
 * - everything else -> `Rating.Good`
 *
 * The thresholds are configurable so the feel of the game can be tuned
 * without touching the scheduler.
 */
export function autoRating(
  input: AutoRatingInput,
  thresholds: Partial<AutoRatingThresholds> = {},
): Rating {
  const rules: AutoRatingThresholds = {
    ...DEFAULT_AUTO_RATING_THRESHOLDS,
    ...thresholds,
  };

  if (!input.correct) {
    return Rating.Again;
  }

  // Guard against clock skew producing negative durations.
  const durationMs = Math.max(0, input.durationMs);

  if (durationMs > rules.hardAfterMs) {
    return Rating.Hard;
  }

  if (durationMs < rules.easyUnderMs && input.streak >= rules.easyStreak) {
    return Rating.Easy;
  }

  return Rating.Good;
}
