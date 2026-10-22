import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  buildQuestionRows,
  countQuestionFilters,
  formatDueIn,
  matchesQuestionFilter,
  matchesQuestionSearch,
  sortQuestionRows,
  QUESTION_SORTS,
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
    ['d', { ...st('d', State.Review, NOW + 72 * H), stability: 30 }],
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
      leech: 0,
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

describe('deck search, sort and leech filter', () => {
  const cards = ['a', 'b', 'c'].map(card);
  cards[0] = { ...cards[0]!, front: 'What is $\\frac{1}{2}$ of Ten?', back: 'Five' };
  cards[1] = { ...cards[1]!, front: 'Capital of France', back: 'Paris' };
  const leechy = { ...st('c', State.Review, NOW + 24 * H), lapses: 9 };
  const states = new Map<string, CardState>([
    ['b', st('b', State.Review, NOW + 72 * H)],
    ['c', leechy],
  ]);
  const rows = buildQuestionRows(cards, states, { a: 2, b: 0, c: 0 }, new Set(), NOW);

  it('matches every word of the query in prompt or answer', () => {
    expect(rows.filter((r) => matchesQuestionSearch(r, '  ')).length).toBe(3);
    expect(rows.filter((r) => matchesQuestionSearch(r, 'ten FIVE')).map((r) => r.card.id)).toEqual(['a']);
    expect(rows.filter((r) => matchesQuestionSearch(r, 'frac')).map((r) => r.card.id)).toEqual(['a']);
    expect(rows.filter((r) => matchesQuestionSearch(r, 'paris london')).length).toBe(0);
  });

  it('filters leeches', () => {
    expect(rows.filter((r) => matchesQuestionFilter(r, 'leech')).map((r) => r.card.id)).toEqual(['c']);
    expect(parseQuestionFilter('leech')).toBe('leech');
  });

  it('sorts by deck, due and weakest', () => {
    expect(sortQuestionRows(rows, 'deck').map((r) => r.card.id)).toEqual(['a', 'b', 'c']);
    expect(sortQuestionRows(rows, 'due').map((r) => r.card.id)).toEqual(['c', 'b', 'a']);
    expect(sortQuestionRows(rows, 'weakest').map((r) => r.card.id)).toEqual(['c', 'b', 'a']);
    expect(QUESTION_SORTS).toEqual(['deck', 'due', 'weakest']);
  });
});
