import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { gradeByAnswerTime } from "../src/mastery";
import {
  EMPTY_STUDY_OPTIONS,
  limitSessionPool,
  parseDailyDone,
  parseStudyOptions,
  presetForDeck,
  sessionStepsFor,
  setPreset,
} from "../src/studyOptions";
import { filterByTrack, parseTrack, trackOf } from "../src/track";

const NOW = Date.UTC(2026, 9, 23, 12);

describe("question tracks", () => {
  it("splits math from multiple choice", () => {
    const qs = [
      { id: "a", type: "mc" },
      { id: "b", type: "math" },
      { id: "c", type: "mc", math: { answers: [] } },
    ];
    expect(trackOf(qs[0]!)).toBe("mc");
    expect(trackOf(qs[1]!)).toBe("math");
    expect(trackOf(qs[2]!)).toBe("math");
    expect(filterByTrack(qs, "mc").map((q) => q.id)).toEqual(["a"]);
    expect(filterByTrack(qs, "math").map((q) => q.id)).toEqual(["b", "c"]);
  });

  it("parses the track param", () => {
    expect(parseTrack("math")).toBe("math");
    expect(parseTrack(["math"])).toBe("math");
    expect(parseTrack(undefined)).toBe("mc");
    expect(parseTrack("x")).toBe("mc");
  });
});

describe("math presets", () => {
  it("defaults math to 5 new a day, apart from multiple choice", () => {
    const options = setPreset(EMPTY_STUDY_OPTIONS, { deckId: "d" }, "cram");
    expect(presetForDeck(options, "d", null).newPerDay).toBe(100);
    expect(presetForDeck(options, "d", null, "math").newPerDay).toBe(5);
    const math = setPreset(options, { deckId: "d" }, "math-push", "math");
    expect(presetForDeck(math, "d", null, "math").id).toBe("math-push");
    expect(presetForDeck(math, "d", null).id).toBe("cram");
    const parsed = parseStudyOptions(JSON.stringify(math));
    expect(parsed.mathDeckPresets).toEqual({ d: "math-push" });
    expect(parseStudyOptions(JSON.stringify({ deckPresets: {} })).mathDeckPresets).toEqual({});
  });

  it("limits a math session to the math preset", () => {
    const qs = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, deckId: "d" }));
    const done = parseDailyDone(null, "2026-10-23");
    const input = { options: EMPTY_STUDY_OPTIONS, done, now: NOW, classOf: () => null };
    expect(limitSessionPool(qs, input).questions).toHaveLength(12);
    expect(limitSessionPool(qs, { ...input, track: "math" }).questions).toHaveLength(5);
    expect(sessionStepsFor(EMPTY_STUDY_OPTIONS, ["d"], () => null, "math").learnStepsMinutes).toEqual([10, 1440]);
  });
});

describe("lenient math timing", () => {
  it("does not punish a slow math answer", () => {
    expect(gradeByAnswerTime({ correct: true, durationMs: 50_000, medianMs: 30_000 })).toBe(Rating.Hard);
    expect(gradeByAnswerTime({ correct: true, durationMs: 50_000, medianMs: 30_000, lenient: true })).toBe(Rating.Good);
    expect(gradeByAnswerTime({ correct: true, durationMs: 95_000, medianMs: 30_000, lenient: true })).toBe(Rating.Hard);
    expect(gradeByAnswerTime({ correct: false, durationMs: 1, lenient: true })).toBe(Rating.Again);
  });
});
