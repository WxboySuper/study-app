import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import { daysUntil, examHeadline, examPace, readiness, weakDecks } from '../src/exam';
import type { CardState } from '../src/types';

const NOW = new Date('2026-11-18T12:00:00.000Z');
const DAY = 86_400_000;

function state(overrides: Partial<CardState> = {}): CardState {
  return {
    cardId: 'card',
    due: NOW.getTime(),
    stability: 4,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 4,
    reps: 2,
    lapses: 0,
    state: State.Review,
    lastReview: NOW.getTime(),
    ...overrides,
  };
}

function card(id: string, deckId: string, cardState?: CardState, retired = false) {
  return { id, deckId, state: cardState, retired };
}

describe('exam planning', () => {
  it('counts calendar days and handles invalid date strings', () => {
    expect(daysUntil('2026-11-27', '2026-11-18')).toBe(9);
    expect(daysUntil('2026-11-17', '2026-11-18')).toBe(-1);
    expect(daysUntil('bad-date', '2026-11-18')).toBe(0);
  });

  it('estimates readiness, excluding retired cards and capping young reviews', () => {
    const cards = [
      card('mature', 'a', state({ stability: 21 })),
      card('young', 'a', state({ stability: 4, lastReview: NOW.getTime() - 4 * DAY })),
      card('learning', 'b', state({ state: State.Learning })),
      card('unseen', 'b', undefined),
      card('retired', 'b', undefined, true),
    ];
    const result = readiness(cards, NOW);
    expect(result.total).toBe(4);
    expect(result.mastered).toBe(1);
    expect(result.learning).toBe(1);
    expect(result.unseen).toBe(1);
    expect(result.percent).toBe(70);
  });

  it('returns zero for empty pools and gives reviewed cards zero when stability is unusable', () => {
    expect(readiness([], NOW)).toEqual({ percent: 0, total: 0, mastered: 0, learning: 0, unseen: 0 });
    expect(readiness([card('x', 'x', state({ stability: 0, lastReview: NOW.getTime() }))], NOW).percent).toBe(0);
    expect(readiness([card('x', 'x', state({ lastReview: null }))], NOW).percent).toBe(0);
    expect(readiness([card('x', 'x', state({ state: State.Relearning, lastReview: NOW.getTime() - DAY }))], NOW).learning).toBe(1);
  });

  it('sorts weak decks by readiness, then id, and respects the limit', () => {
    const cards = [
      card('a1', 'z', undefined),
      card('a2', 'z', state({ stability: 21 })),
      card('b1', 'b', undefined),
      card('c1', 'c', state({ stability: 21 })),
      card('retired', 'a', undefined, true),
    ];
    expect(weakDecks(cards, NOW, 3)).toEqual([
      { deckId: 'b', percent: 0 },
      { deckId: 'z', percent: 50 },
      { deckId: 'c', percent: 100 },
    ]);
    expect(weakDecks(cards, NOW, -1)).toEqual([]);
    expect(weakDecks([card('gone', 'gone', undefined, true)], NOW, 1)).toEqual([]);
  });

  it('sets a daily pace from unseen cards and handles exam day and ready classes', () => {
    expect(examPace({ total: 10, mastered: 1, unseen: 9 }, 1)).toEqual({
      cardsPerDay: 9,
      label: 'Learn 9 new cards a day to be ready',
    });
    expect(examPace({ total: 1, mastered: 0, unseen: 1 }, 8)).toEqual({
      cardsPerDay: 1,
      label: 'Learn 1 new card a day to be ready',
    });
    expect(examPace({ total: 4, mastered: 3, unseen: 1 }, 0).cardsPerDay).toBe(1);
    expect(examPace({ total: 4, mastered: 4, unseen: 0 }, 0)).toEqual({
      cardsPerDay: 0,
      label: 'You are ready for exam day',
    });
    expect(examPace({ total: 4, mastered: 3, unseen: 0 }, 0)).toEqual({
      cardsPerDay: 0,
      label: 'No new cards left to learn',
    });
    expect(examPace({ total: 4, mastered: 8, unseen: 4 }, -2).cardsPerDay).toBe(0);
  });

  it('formats an exam headline with clamped percent and singular day', () => {
    expect(examHeadline(71, 9)).toBe('Exam in 9 days · 71% ready');
    expect(examHeadline(100.4, 1)).toBe('Exam in 1 day · 100% ready');
    expect(examHeadline(-2, -1)).toBe('Exam in 0 days · 0% ready');
  });
});
