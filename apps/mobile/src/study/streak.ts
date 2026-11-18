import {
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
