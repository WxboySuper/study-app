import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_PRESETS,
  EMPTY_STUDY_OPTIONS,
  limitSessionPool,
  noteAnswered,
  parseDailyDone,
  parseStudyOptions,
  presetForDeck,
  setBuried,
  setPreset,
  setSuspended,
} from "../src/studyOptions";
import type { CardState } from "../src/types";

const NOW = Date.UTC(2026, 9, 22, 12);
const DAY = "2026-10-22";

function st(over: Partial<CardState>): CardState {
  return {
    cardId: "x",
    due: NOW - 1,
    stability: 5,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 3,
    lapses: 0,
    state: State.Review,
    lastReview: NOW - 86_400_000,
    ...over,
  };
}

const classOf = (deck: string) => (deck === "d2" ? "c1" : null);

describe("study options", () => {
  it("parses garbage as empty", () => {
    expect(parseStudyOptions("nope")).toEqual(EMPTY_STUDY_OPTIONS);
    expect(parseStudyOptions(null)).toEqual(EMPTY_STUDY_OPTIONS);
  });

  it("deck preset beats class preset beats default", () => {
    let o = setPreset(EMPTY_STUDY_OPTIONS, { classId: "c1" }, "light");
    expect(presetForDeck(o, "d2", "c1").id).toBe("light");
    expect(presetForDeck(o, "d1", null).id).toBe("default");
    o = setPreset(o, { deckId: "d2" }, "cram");
    expect(presetForDeck(o, "d2", "c1").id).toBe("cram");
    o = setPreset(o, { deckId: "d2" }, null);
    expect(presetForDeck(o, "d2", "c1").id).toBe("light");
    expect(
      presetForDeck(parseStudyOptions(JSON.stringify(o)), "d2", "c1").id,
    ).toBe("light");
  });

  it("suspend and bury hide cards; bury is per day", () => {
    let o = setSuspended(EMPTY_STUDY_OPTIONS, "a", true);
    o = setBuried(o, "b", DAY, DAY);
    const qs = ["a", "b", "c"].map((id) => ({ id, deckId: "d1" }));
    const done = parseDailyDone(null, DAY);
    expect(
      limitSessionPool(qs, {
        options: o,
        done,
        now: NOW,
        classOf,
      }).questions.map((q) => q.id),
    ).toEqual(["c"]);
    const tomorrow = parseDailyDone(null, "2026-10-23");
    expect(
      limitSessionPool(qs, {
        options: o,
        done: tomorrow,
        now: NOW,
        classOf,
      }).questions.map((q) => q.id),
    ).toEqual(["b", "c"]);
    o = setSuspended(o, "a", false);
    expect(o.suspended).toEqual([]);
  });

  it("caps new cards per deck and keeps learning cards", () => {
    const o = setPreset(EMPTY_STUDY_OPTIONS, { deckId: "d1" }, "light");
    const qs = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, deckId: "d1" })),
      { id: "l", deckId: "d1", state: st({ state: State.Learning }) },
      { id: "later", deckId: "d1", state: st({ due: NOW + 86_400_000 }) },
    ];
    const r = limitSessionPool(qs, {
      options: o,
      done: parseDailyDone(null, DAY),
      now: NOW,
      classOf,
    });
    expect(r.questions.map((q) => q.id)).toEqual([
      "n0",
      "n1",
      "n2",
      "n3",
      "n4",
      "l",
    ]);
    expect(r.newLeft).toBe(0);
    expect(r.doneForToday).toBe(false);
  });

  it("counts answers once and reports done for today", () => {
    const preset = BUILT_IN_PRESETS[0]!;
    let done = parseDailyDone(null, DAY);
    for (let i = 0; i < preset.newPerDay; i += 1)
      done = noteAnswered(done, `n${i}`, "d1", undefined, NOW);
    done = noteAnswered(done, "n0", "d1", undefined, NOW);
    expect(done.newByDeck.d1).toBe(preset.newPerDay);
    done = noteAnswered(done, "r", "d1", st({}), NOW);
    expect(done.reviewsByDeck.d1).toBe(1);
    const r = limitSessionPool([{ id: "fresh", deckId: "d1" }], {
      options: EMPTY_STUDY_OPTIONS,
      done,
      now: NOW,
      classOf,
    });
    expect(r.doneForToday).toBe(true);
    expect(parseDailyDone(JSON.stringify(done), "2026-10-23").seen).toEqual([]);
    expect(parseDailyDone(JSON.stringify(done), DAY).seen.length).toBe(
      done.seen.length,
    );
  });
});
