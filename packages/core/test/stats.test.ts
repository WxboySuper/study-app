import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { computeStudyStats } from "../src/stats";
import type { CardState } from "../src/types";

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 22);
const NOW = START + 12 * 3_600_000;

function st(id: string, over: Partial<CardState>): CardState {
  return {
    cardId: id,
    due: NOW,
    stability: 5,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 3,
    lapses: 0,
    state: State.Review,
    lastReview: START - DAY,
    ...over,
  };
}

describe("computeStudyStats", () => {
  it("buckets cards", () => {
    const cards = ["n", "l", "y", "m", "leech", "soon"].map((id) => ({ id }));
    const states = new Map<string, CardState>([
      ["l", st("l", { state: State.Learning, lastReview: NOW - 1000 })],
      ["y", st("y", { due: START + 2 * DAY + 5 })],
      ["m", st("m", { stability: 40, due: START + 30 * DAY })],
      ["leech", st("leech", { lapses: 9 })],
      ["soon", st("soon", { due: START + DAY + 10 })],
    ]);
    const s = computeStudyStats(cards, states, NOW, START);
    expect(s).toMatchObject({
      total: 6,
      new: 1,
      learning: 1,
      young: 3,
      mature: 1,
      leeches: 1,
      dueToday: 2,
      reviewedToday: 1,
    });
    expect(s.forecast).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(s.retention).toBeCloseTo(4 / 5);
  });

  it("has no retention without reviews", () => {
    expect(
      computeStudyStats([{ id: "a" }], new Map(), NOW, START).retention,
    ).toBeNull();
  });
});
