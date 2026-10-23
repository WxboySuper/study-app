import { describe, expect, it } from "vitest";
import { State } from "ts-fsrs";

import {
  LEARN_AHEAD_MS,
  limitKind,
  limitSessionPool,
  masteryForecast,
  noteAnswered,
  parseDailyDone,
  EMPTY_STUDY_OPTIONS,
  questionStatus,
} from "../src";
import type { CardState } from "../src/types";

const NOW = Date.UTC(2026, 9, 23, 17, 0, 0);
const MIN = 60_000;

function st(cardId: string, state: State, due: number): CardState {
  return {
    cardId,
    due,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state,
    lastReview: NOW - 5 * MIN,
  } as CardState;
}

describe("learn-ahead (Anki's 20 minutes)", () => {
  it("counts a learning question only once its step is due", () => {
    expect(LEARN_AHEAD_MS).toBe(20 * MIN);
    expect(limitKind(st("a", State.Learning, NOW - MIN), NOW)).toBe("learning");
    expect(limitKind(st("a", State.Learning, NOW + 10 * MIN), NOW)).toBe("learning");
    expect(limitKind(st("a", State.Learning, NOW + 30 * MIN), NOW)).toBe("later");
    expect(limitKind(st("a", State.Relearning, NOW + 24 * 60 * MIN), NOW)).toBe("later");
  });

  it("the deck screen uses the same New / Learning / Due rule", () => {
    expect(questionStatus(undefined, NOW)).toBe("new");
    expect(questionStatus(st("a", State.Learning, NOW + 10 * MIN), NOW)).toBe("learning");
    expect(questionStatus(st("a", State.Learning, NOW - MIN), NOW)).toBe("learning");
    expect(questionStatus(st("a", State.Learning, NOW + 24 * 60 * MIN), NOW)).toBe("scheduled");
    expect(questionStatus(st("a", State.Review, NOW - MIN), NOW)).toBe("due");
    expect(questionStatus(st("a", State.Review, NOW + MIN), NOW)).toBe("scheduled");
  });

  it("today's forecast leaves a 1-day learning step out", () => {
    const forecast = masteryForecast(
      [
        { id: "n", deckId: "d" },
        { id: "l1", deckId: "d", state: st("l1", State.Learning, NOW + 5 * MIN) },
        { id: "l2", deckId: "d", state: st("l2", State.Learning, NOW + 24 * 60 * MIN) },
        { id: "r", deckId: "d", state: st("r", State.Review, NOW - MIN) },
      ],
      {
        options: parseOptions(),
        done: parseDailyDone(null, "2026-10-23"),
        now: NOW,
        classOf: () => null,
      },
    );
    expect(forecast.today).toEqual({ new: 1, learning: 1, due: 1 });
    const pool = limitSessionPool(
      [{ id: "l2", deckId: "d", state: st("l2", State.Learning, NOW + 24 * 60 * MIN) }],
      { options: parseOptions(), done: parseDailyDone(null, "2026-10-23"), now: NOW, classOf: () => null },
    );
    expect(pool.questions).toEqual([]);
  });

  it("a learning question answered ahead never counts as a review", () => {
    const done = noteAnswered(
      parseDailyDone(null, "2026-10-23"),
      "l",
      "d",
      st("l", State.Learning, NOW + 24 * 60 * MIN),
      NOW,
    );
    expect(done.reviewsByDeck).toEqual({});
    expect(done.seen).toEqual(["l"]);
  });
});

function parseOptions() {
  return EMPTY_STUDY_OPTIONS;
}
