import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import {
  gradeByAnswerTime,
  gradeLabel,
  isLeech,
  isMatureMastered,
  medianAnswerMs,
  remainingToday,
  type CardState,
} from "../src/index";

function st(over: Partial<CardState>): CardState {
  return {
    cardId: "c",
    due: 0,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 1,
    lapses: 0,
    state: State.Review,
    lastReview: 0,
    ...over,
  } as CardState;
}

describe("mastery rules", () => {
  it("grades against the median", () => {
    expect(gradeByAnswerTime({ correct: false, durationMs: 1 })).toBe(
      Rating.Again,
    );
    expect(gradeByAnswerTime({ correct: true, durationMs: 13_000 })).toBe(
      Rating.Hard,
    );
    expect(gradeByAnswerTime({ correct: true, durationMs: 3_000 })).toBe(
      Rating.Easy,
    );
    expect(gradeByAnswerTime({ correct: true, durationMs: 8_000 })).toBe(
      Rating.Good,
    );
    expect(
      gradeByAnswerTime({ correct: true, durationMs: 3_000, medianMs: 4_000 }),
    ).toBe(Rating.Good);
    expect(
      gradeByAnswerTime({ correct: true, durationMs: 3_000, medianMs: 0 }),
    ).toBe(Rating.Easy);
  });
  it("computes medians", () => {
    expect(medianAnswerMs([])).toBe(8_000);
    expect(medianAnswerMs([3, 1, 2])).toBe(2);
    expect(medianAnswerMs([4, 1, NaN, -1, 2, 3])).toBe(2.5);
  });
  it("labels grades", () => {
    expect(gradeLabel(Rating.Good, 4_100)).toBe("Good · 4.1 s");
    expect(gradeLabel(Rating.Again, -5)).toBe("Again · 0.0 s");
    expect(gradeLabel(9 as never, 0)).toBe("Good · 0.0 s");
  });
  it("stars mature review cards and flags leeches", () => {
    expect(isMatureMastered(undefined)).toBe(false);
    expect(isMatureMastered(st({ stability: 21 }))).toBe(true);
    expect(
      isMatureMastered(st({ stability: 30, state: State.Relearning })),
    ).toBe(false);
    expect(isLeech(st({ lapses: 8 }))).toBe(true);
    expect(isLeech(st({ lapses: 7 }))).toBe(false);
    expect(isLeech(st({ lapses: 9 }), 0)).toBe(false);
    expect(isLeech(undefined)).toBe(false);
  });
  it("counts what is left today", () => {
    expect(remainingToday({ newDone: 5, reviewsDone: 250 })).toEqual({
      newLeft: 15,
      reviewsLeft: 0,
    });
    expect(
      remainingToday(
        { newDone: -1, reviewsDone: 0 },
        { newPerDay: 3, reviewsPerDay: 1 },
      ),
    ).toEqual({
      newLeft: 3,
      reviewsLeft: 1,
    });
  });
});
