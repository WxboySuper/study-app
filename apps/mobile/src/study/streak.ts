import {
  DAILY_GOAL_QUESTIONS,
  weeklyGoal,
  earnFreeze,
  localDay,
  recordAnswers as addAnswers,
  type StreakState,
} from '@study-app/core';
import { openLocalStore } from '@/db/local';

const STREAK_KEY = 'study-streak-v1';
const INITIAL_STATE: StreakState = {
  current: 0,
  best: 0,
  lastDay: null,
  todayCount: 0,
  todayDay: null,
  freezes: 0,
  lastFreezeEarnedDay: null,
};

type Listener = (state: StreakState) => void;
const listeners = new Set<Listener>();
let updateQueue: Promise<void> = Promise.resolve();

/** Reads and decodes the persisted streak, falling back to an empty state. */
export async function readStreak(): Promise<StreakState> {
  try {
    const store = await openLocalStore();
    const stored = await store.readKv(STREAK_KEY);
    if (stored === null) return INITIAL_STATE;
    const value: unknown = JSON.parse(stored);
    if (typeof value !== 'object' || value === null) return INITIAL_STATE;
    return { ...INITIAL_STATE, ...(value as Partial<StreakState>) };
  } catch {
    return INITIAL_STATE;
  }
}

/** Records answers against the current local day without rejecting callers. */
export function recordSessionAnswers(count: number): void {
  updateQueue = updateQueue.then(async () => {
    try {
      const store = await openLocalStore();
      const stored = await store.readKv(STREAK_KEY);
      const state = stored === null
        ? INITIAL_STATE
        : { ...INITIAL_STATE, ...(JSON.parse(stored) as Partial<StreakState>) };
      const updated = addAnswers(state, count, localDay(new Date()));
      await store.writeKv(STREAK_KEY, JSON.stringify(updated));
      await noteGoalDay(updated);
      listeners.forEach((listener) => listener(updated));
    } catch {
      // Streak tracking never interrupts a study session.
    }
  });
}

/** Earns and persists a daily freeze after the due queue is cleared. */
export function earnDailyFreeze(): void {
  updateQueue = updateQueue.then(async () => {
    try {
      const store = await openLocalStore();
      const stored = await store.readKv(STREAK_KEY);
      const state = stored === null
        ? INITIAL_STATE
        : { ...INITIAL_STATE, ...(JSON.parse(stored) as Partial<StreakState>) };
      const updated = earnFreeze(state, localDay(new Date()));
      await store.writeKv(STREAK_KEY, JSON.stringify(updated));
      listeners.forEach((listener) => listener(updated));
    } catch {
      // Streak tracking never interrupts a study session.
    }
  });
}

/** Subscribes to streak changes and returns an unsubscribe function. */
export function subscribeStreak(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const GOAL_DAYS_KEY = 'goal-days-v1';
const CHEST_KEY = 'weekly-chest-v1';

/** The days (YYYY-MM-DD) whose daily goal was done, newest last. */
export async function readGoalDays(): Promise<string[]> {
  try {
    const store = await openLocalStore();
    const raw = await store.readKv(GOAL_DAYS_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Remembers today as a goal day (once the goal is done) and pays the weekly
 * chest the first time a week reaches five goal days. Returns `true` when the
 * chest was just paid.
 */
export async function noteGoalDay(state: StreakState): Promise<boolean> {
  try {
    const today = localDay(new Date());
    if (state.todayDay !== today || state.todayCount < DAILY_GOAL_QUESTIONS) {
      return false;
    }
    const store = await openLocalStore();
    const days = new Set(await readGoalDays());
    days.add(today);
    const kept = [...days].sort().slice(-60);
    await store.writeKv(GOAL_DAYS_KEY, JSON.stringify(kept));

    const goal = weeklyGoal(kept, today);
    if (!goal.chestReady) {
      return false;
    }
    const week = mondayOfWeek(today);
    if ((await store.readKv(CHEST_KEY)) === week) {
      return false;
    }
    await store.writeKv(CHEST_KEY, week);
    await store.addPackTickets(2);
    return true;
  } catch {
    return false;
  }
}

/** The Monday of the week of a YYYY-MM-DD day (the key of the weekly chest). */
export function mondayOfWeek(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
