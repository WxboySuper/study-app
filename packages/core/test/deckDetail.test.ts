import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  buildQuestionRows,
  countQuestionFilters,
  formatDueIn,
  matchesQuestionFilter,
  parseQuestionFilter,
  questionStatus,
  type CardState,
  type StudyCard,
} from '../src';

const NOW = 1_800_000_000_000;
const H = 3_600_000;

function card(id: string): StudyCard {
  return { id, setId: 's1', type: 'basic', front: `Q ${id}`, back: `A ${id}` };
}

function st(cardId: string, state: State, due: number): CardState {
  return {
    cardId,
    due,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: 0,
    state,
    lastReview: NOW - H,
  };
}

describe('questionStatus', () => {
  it('maps FSRS states to the deck screen statuses', () => {
    expect(questionStatus(undefined, NOW)).toBe('new');
    expect(questionStatus(st('a', State.New, NOW - H), NOW)).toBe('new');
    expect(questionStatus(st('a', State.Learning, NOW + H), NOW)).toBe('learning');
    expect(questionStatus(st('a', State.Relearning, NOW + H), NOW)).toBe('learning');
    expect(questionStatus(st('a', State.Learning, NOW - 1), NOW)).toBe('due');
    expect(questionStatus(st('a', State.Review, NOW), NOW)).toBe('due');
    expect(questionStatus(st('a', State.Review, NOW + 48 * H), NOW)).toBe('scheduled');
  });
});

describe('buildQuestionRows', () => {
  const cards = ['a', 'b', 'c', 'd'].map(card);
  const states = new Map<string, CardState>([
    ['b', st('b', State.Review, NOW - H)],
    ['c', st('c', State.Learning, NOW + H)],
    ['d', st('d', State.Review, NOW + 72 * H)],
  ]);
  const rows = buildQuestionRows(cards, states, { a: 1, d: 7, c: Number.NaN }, new Set(['a', 'b']), NOW);

  it('keeps deck order and fills status, due and mastery', () => {
    expect(rows.map((r) => [r.card.id, r.status, r.mastery, r.mastered, r.queued])).toEqual([
      ['a', 'new', 1, false, true],
      ['b', 'due', 0, false, true],
      ['c', 'learning', 0, false, false],
      ['d', 'scheduled', 3, true, false],
    ]);
    expect(rows[0]?.dueAt).toBeNull();
    expect(rows[3]?.dueAt).toBe(NOW + 72 * H);
  });

  it('counts every filter', () => {
    expect(countQuestionFilters(rows)).toEqual({
      all: 4,
      due: 1,
      queued: 2,
      new: 1,
      learning: 1,
      scheduled: 1,
      mastered: 1,
    });
    expect(rows.filter((r) => matchesQuestionFilter(r, 'mastered')).map((r) => r.card.id)).toEqual(['d']);
  });
});

describe('formatDueIn / parseQuestionFilter', () => {
  it('formats short durations', () => {
    expect(formatDueIn(NOW + 10_000, NOW)).toBe('1m');
    expect(formatDueIn(NOW + 5 * H, NOW)).toBe('5h');
    expect(formatDueIn(NOW + 72 * H, NOW)).toBe('3d');
    expect(formatDueIn(NOW + 21 * 24 * H, NOW)).toBe('3w');
    expect(formatDueIn(NOW + 90 * 24 * H, NOW)).toBe('3mo');
  });

  it('parses the route filter', () => {
    expect(parseQuestionFilter('due')).toBe('due');
    expect(parseQuestionFilter('queued')).toBe('queued');
    expect(parseQuestionFilter('nope')).toBe('all');
    expect(parseQuestionFilter(undefined)).toBe('all');
  });
});
