/** Number of answered questions needed to count a study day. */
export const DAILY_GOAL_QUESTIONS = 10;

/** Persisted study streak counters and day keys. */
export type StreakState = {
  current: number;
  best: number;
  lastDay: string | null;
  todayCount: number;
  todayDay: string | null;
  freezes: number;
  lastFreezeEarnedDay: string | null;
};

/** Returns the previous YYYY-MM-DD day using UTC calendar arithmetic. */
export function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Returns the whole number of days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** Formats a timestamp as its local calendar day. */
export function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Adds answered questions and advances the streak when today's goal is met. */
export function recordAnswers(state: StreakState, count: number, today: string): StreakState {
  const todayCount = (state.todayDay === today ? state.todayCount : 0) + Math.max(0, count);
  const next = { ...state, todayDay: today, todayCount };
  if (state.todayDay === today && state.todayCount >= DAILY_GOAL_QUESTIONS) return next;
  if (todayCount < DAILY_GOAL_QUESTIONS) return next;

  let current = 1;
  let freezes = state.freezes;
  if (state.lastDay === today) {
    current = state.current;
  } else if (state.lastDay === dayBefore(today)) {
    current = state.current + 1;
  } else if (state.lastDay !== null) {
    const missedDays = daysBetween(state.lastDay, today) - 1;
    if (missedDays > 0 && missedDays <= freezes) {
      current = state.current + 1;
      freezes -= missedDays;
    }
  }
  return { ...next, current, best: Math.max(state.best, current), lastDay: today, freezes };
}

/** Calculates display values, accounting for freezes that can cover missed days. */
export function settleMissedDays(state: StreakState, today: string): {
  current: number;
  atRisk: boolean;
  goalDone: boolean;
  remaining: number;
  freezes: number;
} {
  const goalDone = state.todayDay === today && state.todayCount >= DAILY_GOAL_QUESTIONS;
  const missedDays = state.lastDay === null ? 0 : Math.max(0, daysBetween(state.lastDay, today) - 1);
  const current = state.lastDay === today || missedDays <= state.freezes ? state.current : 0;
  return {
    current,
    atRisk: !goalDone && current > 0,
    goalDone,
    remaining: Math.max(0, DAILY_GOAL_QUESTIONS - (state.todayDay === today ? state.todayCount : 0)),
    freezes: state.freezes,
  };
}

/** Grants at most one freeze per day, up to the two-freeze cap. */
export function earnFreeze(state: StreakState, today: string): StreakState {
  if (state.lastFreezeEarnedDay === today || state.freezes >= 2) return state;
  return { ...state, freezes: state.freezes + 1, lastFreezeEarnedDay: today };
}
