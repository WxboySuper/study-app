import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { reviewWrites, type CardState } from "../src";

const state = {
  cardId: "q1",
  due: 1,
  stability: 1,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 0,
  reps: 1,
  lapses: 0,
  state: State.Learning,
  lastReview: 1,
} as CardState;

describe("reviewWrites", () => {
  it("Mastery (questions or math) writes the scheduling state", () => {
    expect(reviewWrites({ state }, true)).toEqual({ cardState: state, history: true });
  });
  it("plain Normal / Math keeps history only, never the schedule", () => {
    expect(reviewWrites({ state }, false)).toEqual({ cardState: null, history: true });
  });
});
