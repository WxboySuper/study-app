import { describe, expect, it } from 'vitest';

import {
  milestoneKey,
  newMilestones,
  rewardOf,
  totalReward,
  weeklyGoal,
} from '../src/milestones';

const deck = (mastered: number, total = 20) => ({ id: 'd1', title: 'Deck', total, mastered });

describe('newMilestones', () => {
  it('pays each step once', () => {
    expect(newMilestones([deck(9)], new Set())).toEqual([]);
    const first = newMilestones([deck(10)], new Set());
    expect(first.map((m) => m.step)).toEqual([50]);
    const again = newMilestones([deck(10)], new Set([milestoneKey('d1', 50)]));
    expect(again).toEqual([]);
  });

  it('pays every crossed step at once', () => {
    expect(newMilestones([deck(20)], new Set()).map((m) => m.step)).toEqual([50, 80, 100]);
  });

  it('ignores tiny decks', () => {
    expect(newMilestones([deck(5, 5)], new Set())).toEqual([]);
  });

  it('adds up rewards', () => {
    const all = newMilestones([deck(20)], new Set());
    expect(totalReward(all)).toEqual({ tokens: 20, packTickets: 3 });
    expect(rewardOf(80)).toEqual({ tokens: 0, packTickets: 1 });
  });
});

describe('weeklyGoal', () => {
  it('counts the days of the current Monday-Sunday week', () => {
    // 2026-11-18 is a Wednesday; the week starts on Monday the 16th.
    const goal = weeklyGoal(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-17'], '2026-11-18');
    expect(goal).toEqual({ done: 2, target: 5, chestReady: false });
  });

  it('opens the chest at five days', () => {
    const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
    expect(weeklyGoal(days, '2026-11-20').chestReady).toBe(true);
  });
});
