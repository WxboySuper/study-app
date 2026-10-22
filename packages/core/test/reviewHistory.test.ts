import { describe, expect, it } from "vitest";

import {
  HISTORY_MAX_DAYS,
  addToHistory,
  historySeries,
  lastDays,
  parseReviewHistory,
  retentionTrend,
} from "../src/reviewHistory";
import { foldRemoteEvents, type RemoteEvent } from "../src/progressSync";
import {
  BUILT_IN_PRESETS,
  EMPTY_STUDY_OPTIONS,
  formatSteps,
  sessionStepsFor,
  setPreset,
} from "../src/studyOptions";
import { SYNCED_KV_KEYS } from "../src/progressSync";

describe("review history", () => {
  it("counts answers and right answers per day", () => {
    const h = addToHistory({}, [
      { day: "2026-10-20", rating: 3 },
      { day: "2026-10-20", rating: 1 },
      { day: "2026-10-21", rating: 4 },
      { day: "bad", rating: 3 },
    ]);
    expect(h).toEqual({
      "2026-10-20": { reviews: 2, passed: 1 },
      "2026-10-21": { reviews: 1, passed: 1 },
    });
    expect(parseReviewHistory(JSON.stringify(h))).toEqual(h);
  });

  it("survives garbage and caps the days", () => {
    expect(parseReviewHistory("nope")).toEqual({});
    expect(parseReviewHistory(null)).toEqual({});
    expect(
      parseReviewHistory('{"2026-01-01":{"reviews":2,"passed":9}}'),
    ).toEqual({
      "2026-01-01": { reviews: 2, passed: 2 },
    });
    const days = lastDays(new Date(2026, 9, 22), HISTORY_MAX_DAYS + 5);
    const h = addToHistory(
      {},
      days.map((day) => ({ day, rating: 3 })),
    );
    expect(Object.keys(h).length).toBe(HISTORY_MAX_DAYS);
    expect(h[days[0]!]).toBeUndefined();
  });

  it("builds the series and the retention trend", () => {
    const days = lastDays(new Date(2026, 9, 22), 14);
    expect(days[13]).toBe("2026-10-22");
    expect(days[0]).toBe("2026-10-09");
    const entries = [
      ...days.slice(0, 7).map((day) => ({ day, rating: 1 })),
      ...days.slice(0, 7).map((day) => ({ day, rating: 3 })),
      ...days.slice(7).map((day) => ({ day, rating: 3 })),
    ];
    const series = historySeries(addToHistory({}, entries), days);
    expect(series[0]).toEqual({
      day: "2026-10-09",
      reviews: 2,
      retention: 0.5,
    });
    const trend = retentionTrend(series);
    expect(trend.recent).toBe(1);
    expect(trend.previous).toBe(0.5);
    expect(trend.delta).toBe(0.5);
    expect(retentionTrend(historySeries({}, days)).delta).toBeNull();
  });

  it("fold hands over the reviews of other devices", () => {
    const ev = (id: string, device: string, payload: object): RemoteEvent =>
      ({
        id,
        seq: 1,
        at: 50,
        type: "review",
        payload,
        device_id: device,
        cursor: 1,
      }) as RemoteEvent;
    const changes = foldRemoteEvents(
      [
        ev("a", "other", { cardId: "c", rating: 1, review: 1000, epoch: 2 }),
        ev("b", "me", { cardId: "c", rating: 3, review: 2000, epoch: 2 }),
        ev("c", "other", { cardId: "c", rating: 3, epoch: 2 }),
      ],
      new Map(),
      "me",
    );
    expect(changes.reviewLog).toEqual([
      { at: 1000, rating: 1 },
      { at: 50, rating: 3 },
    ]);
  });
});

describe("preset sync and learning steps", () => {
  it("syncs the study options", () => {
    expect(SYNCED_KV_KEYS).toContain("study.options.v1");
  });

  it("every preset has learning steps", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.learnStepsMinutes.length).toBeGreaterThan(0);
      expect(preset.relearnStepsMinutes.length).toBeGreaterThan(0);
    }
    expect(formatSteps([1, 10, 1440])).toBe("1m 10m 1d");
    expect(formatSteps([90])).toBe("1h30m");
  });

  it("uses the steps of the decks' preset, or the default when they differ", () => {
    const light = BUILT_IN_PRESETS.find((p) => p.id === "light")!;
    const options = setPreset(EMPTY_STUDY_OPTIONS, { classId: "k" }, "light");
    const classOf = (deck: string) =>
      deck === "d1" || deck === "d2" ? "k" : null;
    expect(sessionStepsFor(options, ["d1", "d2", "d1"], classOf)).toEqual({
      learnStepsMinutes: light.learnStepsMinutes,
      relearnStepsMinutes: light.relearnStepsMinutes,
    });
    expect(sessionStepsFor(options, ["d1", "d3"], classOf)).toEqual({
      learnStepsMinutes: BUILT_IN_PRESETS[0]!.learnStepsMinutes,
      relearnStepsMinutes: BUILT_IN_PRESETS[0]!.relearnStepsMinutes,
    });
    expect(sessionStepsFor(options, [], classOf).learnStepsMinutes).toEqual(
      BUILT_IN_PRESETS[0]!.learnStepsMinutes,
    );
  });
});
