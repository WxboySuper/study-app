import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { NORMAL_MODE_FIX_AT, normalModeResets, type CardState } from "../src";

function st(cardId: string, lastReview: number, state = State.Learning): CardState {
  return {
    cardId,
    due: lastReview + 600_000,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: 0,
    state,
    lastReview,
  } as CardState;
}

describe("normalModeResets", () => {
  const before = NORMAL_MODE_FIX_AT - 3_600_000;
  const now = NORMAL_MODE_FIX_AT + 86_400_000;

  it("resets plain-mode questions to New, stamped to win the sync", () => {
    const out = normalModeResets([st("a", before)], {}, now);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ cardId: "a", state: State.New, reps: 0, lapses: 0, lastReview: now });
  });

  it("keeps Mastery progress, new questions and states after the fix", () => {
    const out = normalModeResets(
      [st("m", before), st("n", before, State.New), st("late", NORMAL_MODE_FIX_AT + 1)],
      { m: 1 },
      now,
    );
    expect(out).toEqual([]);
  });

  it("is idempotent", () => {
    const first = normalModeResets([st("a", before)], {}, now);
    expect(normalModeResets(first, {}, now + 1)).toEqual([]);
  });
});
