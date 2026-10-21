import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AUTO_RATING_THRESHOLDS,
  autoRating,
} from '../src/rating';
import { Rating } from 'ts-fsrs';

describe('autoRating', () => {
  it('rates a wrong answer as Again, no matter how fast it was', () => {
    expect(autoRating({ correct: false, durationMs: 100, streak: 10 })).toBe(Rating.Again);
    expect(autoRating({ correct: false, durationMs: 60_000, streak: 0 })).toBe(Rating.Again);
  });

  it('rates a slow correct answer as Hard', () => {
    expect(autoRating({ correct: true, durationMs: 15_001, streak: 0 })).toBe(Rating.Hard);
    expect(autoRating({ correct: true, durationMs: 60_000, streak: 5 })).toBe(Rating.Hard);
  });

  it('rates a normal correct answer as Good', () => {
    expect(autoRating({ correct: true, durationMs: 5_000, streak: 0 })).toBe(Rating.Good);
    expect(autoRating({ correct: true, durationMs: 15_000, streak: 0 })).toBe(Rating.Good);
  });

  it('rates a fast correct answer on a streak as Easy', () => {
    expect(autoRating({ correct: true, durationMs: 3_999, streak: 3 })).toBe(Rating.Easy);
    expect(autoRating({ correct: true, durationMs: 0, streak: 9 })).toBe(Rating.Easy);
  });

  it('does not rate a fast answer as Easy without enough of a streak', () => {
    expect(autoRating({ correct: true, durationMs: 1_000, streak: 2 })).toBe(Rating.Good);
    expect(autoRating({ correct: true, durationMs: 1_000, streak: 0 })).toBe(Rating.Good);
  });

  it('does not rate a slow answer as Easy even with a streak', () => {
    expect(autoRating({ correct: true, durationMs: 4_000, streak: 5 })).toBe(Rating.Good);
    expect(autoRating({ correct: true, durationMs: 5_000, streak: 5 })).toBe(Rating.Good);
  });

  it('uses the documented defaults', () => {
    expect(DEFAULT_AUTO_RATING_THRESHOLDS).toEqual({
      hardAfterMs: 15_000,
      easyUnderMs: 4_000,
      easyStreak: 3,
    });
  });

  it('accepts custom thresholds', () => {
    expect(autoRating({ correct: true, durationMs: 5_000, streak: 1 }, { hardAfterMs: 2_000 })).toBe(
      Rating.Hard,
    );
    expect(
      autoRating({ correct: true, durationMs: 2_000, streak: 1 }, { easyUnderMs: 3_000, easyStreak: 1 }),
    ).toBe(Rating.Easy);
    expect(
      autoRating({ correct: true, durationMs: 2_000, streak: 1 }, { easyUnderMs: 3_000, easyStreak: 5 }),
    ).toBe(Rating.Good);
  });

  it('treats negative durations as instant answers', () => {
    expect(autoRating({ correct: true, durationMs: -5_000, streak: 3 })).toBe(Rating.Easy);
  });
});
