import { describe, expect, it } from 'vitest';
import {
  DAILY_GOAL_QUESTIONS,
  dayBefore,
  daysBetween,
  earnFreeze,
  localDay,
  recordAnswers,
  settleMissedDays,
  type StreakState,
} from '../src/streak';

const empty: StreakState = {
  current: 0,
  best: 0,
  lastDay: null,
  todayCount: 0,
  todayDay: null,
  freezes: 0,
  lastFreezeEarnedDay: null,
};

describe('study streak', () => {
  it('uses timezone-free day arithmetic and local date formatting', () => {
    expect(dayBefore('2024-03-01')).toBe('2024-02-29');
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(localDay(new Date(2024, 0, 2, 23, 59))).toBe('2024-01-02');
  });

  it('counts a day once when the goal is first reached and updates best', () => {
    const partial = recordAnswers(empty, DAILY_GOAL_QUESTIONS - 1, '2024-01-01');
    expect(partial.current).toBe(0);
    const done = recordAnswers(partial, 1, '2024-01-01');
    expect(done).toMatchObject({ current: 1, best: 1, lastDay: '2024-01-01' });
    expect(recordAnswers(done, 5, '2024-01-01').current).toBe(1);
  });

  it('continues on consecutive days and resets after an uncovered gap', () => {
    const first = recordAnswers(empty, 10, '2024-01-01');
    expect(recordAnswers(first, 10, '2024-01-02')).toMatchObject({ current: 2, best: 2 });
    expect(recordAnswers(first, 10, '2024-01-03')).toMatchObject({ current: 1, best: 1 });
  });

  it('uses freezes for skipped days and reports display risk', () => {
    const first = recordAnswers({ ...empty, freezes: 1 }, 10, '2024-01-01');
    const covered = recordAnswers(first, 10, '2024-01-03');
    expect(covered).toMatchObject({ current: 2, freezes: 0 });
    expect(settleMissedDays({ ...first, freezes: 1 }, '2024-01-03').current).toBe(1);
    expect(settleMissedDays(first, '2024-01-04').current).toBe(0);
    expect(settleMissedDays(first, '2024-01-02')).toMatchObject({ current: 1, atRisk: true, remaining: 10 });
  });

  it('grants at most one freeze per day and caps them at two', () => {
    const earned = earnFreeze(empty, '2024-01-01');
    expect(earnFreeze(earned, '2024-01-01')).toEqual(earned);
    expect(earnFreeze({ ...earned, freezes: 2 }, '2024-01-02').freezes).toBe(2);
  });
});
