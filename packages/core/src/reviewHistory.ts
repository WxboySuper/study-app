/**
 * The review history behind the stats charts: how many questions were
 * answered each day and how many of those were right (not "Again").
 *
 * The app keeps it in its key/value store, adds its own reviews as they
 * happen and the reviews of the other devices as the sync pulls them, so
 * every device shows the same history.
 */

/** One day of the history. */
export interface HistoryDay {
  reviews: number;
  passed: number;
}

/** The history by local day (YYYY-MM-DD). */
export type ReviewHistory = Record<string, HistoryDay>;

/** The most days the history keeps (the oldest are dropped). */
export const HISTORY_MAX_DAYS = 400;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Reads a saved history; anything malformed is skipped. */
export function parseReviewHistory(raw: string | null): ReviewHistory {
  const out: ReviewHistory = {};
  if (raw === null || raw === "") return out;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return out;
    for (const [day, item] of Object.entries(value)) {
      if (!DAY.test(day) || item === null || typeof item !== "object") continue;
      const { reviews, passed } = item as Partial<HistoryDay>;
      const r = count(reviews);
      if (r > 0) out[day] = { reviews: r, passed: Math.min(r, count(passed)) };
    }
  } catch {
    return {};
  }
  return out;
}

/** Adds answers (`rating` 1 is "Again", a miss) to the history. */
export function addToHistory(
  history: ReviewHistory,
  entries: readonly { day: string; rating: number }[],
): ReviewHistory {
  const out: ReviewHistory = { ...history };
  for (const { day, rating } of entries) {
    if (!DAY.test(day)) continue;
    const current = out[day] ?? { reviews: 0, passed: 0 };
    out[day] = {
      reviews: current.reviews + 1,
      passed: current.passed + (rating > 1 ? 1 : 0),
    };
  }
  const days = Object.keys(out).sort();
  for (const day of days.slice(0, Math.max(0, days.length - HISTORY_MAX_DAYS)))
    delete out[day];
  return out;
}

/** One bar of a chart. */
export interface HistoryPoint {
  day: string;
  reviews: number;
  /** Share of right answers, `null` on a day without answers. */
  retention: number | null;
}

/** The history over the given days (oldest first). */
export function historySeries(
  history: ReviewHistory,
  days: readonly string[],
): HistoryPoint[] {
  return days.map((day) => {
    const item = history[day];
    return item === undefined
      ? { day, reviews: 0, retention: null }
      : { day, reviews: item.reviews, retention: item.passed / item.reviews };
  });
}

/** The retention of a stretch of days, `null` without answers. */
export function retentionOf(points: readonly HistoryPoint[]): number | null {
  let reviews = 0;
  let passed = 0;
  for (const point of points) {
    if (point.retention === null) continue;
    reviews += point.reviews;
    passed += point.retention * point.reviews;
  }
  return reviews === 0 ? null : passed / reviews;
}

/**
 * The retention trend: the last `window` days against the `window` before.
 * `delta` is `null` when either side has no answers.
 */
export function retentionTrend(
  points: readonly HistoryPoint[],
  window = 7,
): { recent: number | null; previous: number | null; delta: number | null } {
  const recent = retentionOf(points.slice(-window));
  const previous = retentionOf(points.slice(-2 * window, -window));
  return {
    recent,
    previous,
    delta: recent === null || previous === null ? null : recent - previous,
  };
}

/** The local day keys (YYYY-MM-DD) of the last `count` days, oldest first. */
export function lastDays(today: Date, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - i,
    );
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${d.getFullYear()}-${mm}-${dd}`);
  }
  return out;
}
