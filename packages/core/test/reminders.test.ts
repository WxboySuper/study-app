import { describe, expect, it } from 'vitest';

import {
  estimateMinutes,
  formatReminderTime,
  nextReminderTime,
  reminderText,
  shiftReminderTime,
  streakRiskText,
} from '../src/reminders';

describe('reminderText', () => {
  it('says what is due and how long it takes', () => {
    expect(reminderText(34, 0).title).toBe('34 cards due · about 9 min');
    expect(reminderText(1, 0).title).toBe('1 card due · about 1 min');
  });

  it('mentions the streak', () => {
    expect(reminderText(10, 6).body).toContain('Day 6');
  });

  it('has a line for nothing due', () => {
    expect(reminderText(0, 0).title).toBe('Nothing due today');
    expect(reminderText(0, 4).body).toContain('day 5');
  });

  it('never goes negative', () => {
    expect(reminderText(-3, -1).title).toBe('Nothing due today');
  });
});

describe('streakRiskText', () => {
  it('counts the questions that are left', () => {
    expect(streakRiskText(6, 4)).toEqual({
      title: 'Day 6 ends tonight',
      body: '4 more questions keeps the streak.',
    });
    expect(streakRiskText(0, 1).body).toBe('1 more question keeps the streak.');
  });
});

describe('times', () => {
  it('finds the next time', () => {
    const now = new Date(2026, 10, 18, 9, 0, 0);
    const later = nextReminderTime({ hour: 18, minute: 30 }, now);
    expect(later.getDate()).toBe(18);
    const tomorrow = nextReminderTime({ hour: 8, minute: 0 }, now);
    expect(tomorrow.getDate()).toBe(19);
  });

  it('formats and shifts', () => {
    expect(formatReminderTime({ hour: 0, minute: 5 })).toBe('12:05 AM');
    expect(formatReminderTime({ hour: 20, minute: 30 })).toBe('8:30 PM');
    expect(shiftReminderTime({ hour: 23, minute: 50 }, 20)).toEqual({ hour: 0, minute: 10 });
    expect(shiftReminderTime({ hour: 0, minute: 10 }, -20)).toEqual({ hour: 23, minute: 50 });
    expect(estimateMinutes(0)).toBe(1);
  });
});
