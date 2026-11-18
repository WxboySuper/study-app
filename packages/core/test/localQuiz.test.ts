import { describe, expect, it } from 'vitest';

import {
  bestQuizPercent,
  parseLocalQuizzes,
  quizDueLabel,
  quizQuestionIds,
} from '../src/localQuiz';

const cards = [
  { id: 'a1', setId: 'A' },
  { id: 'a2', setId: 'A' },
  { id: 'b1', setId: 'B' },
  { id: 'c1', setId: 'C' },
  { id: 'c2', setId: 'C' },
];
const classes = new Map<string, string | null>([
  ['A', 'x'],
  ['B', 'x'],
  ['C', null],
]);

describe('quizQuestionIds', () => {
  it('takes the questions of the chosen decks', () => {
    const ids = quizQuestionIds({ id: 'q', deckIds: ['A'], classIds: [], limit: null }, cards, classes);
    expect(ids.sort()).toEqual(['a1', 'a2']);
  });

  it('takes every deck of a chosen class', () => {
    const ids = quizQuestionIds({ id: 'q', deckIds: [], classIds: ['x'], limit: null }, cards, classes);
    expect(ids.sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('does not repeat a question that is in a deck and a class', () => {
    const ids = quizQuestionIds(
      { id: 'q', deckIds: ['A', 'C'], classIds: ['x'], limit: null },
      cards,
      classes,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(5);
  });

  it('is stable for a quiz and respects the limit', () => {
    const quiz = { id: 'q', deckIds: ['A', 'B', 'C'], classIds: [], limit: 3 };
    const first = quizQuestionIds(quiz, cards, classes);
    expect(first).toHaveLength(3);
    expect(quizQuestionIds(quiz, cards, classes)).toEqual(first);
    expect(quizQuestionIds({ ...quiz, id: 'other' }, cards, classes)).toHaveLength(3);
  });
});

describe('quizDueLabel', () => {
  it('describes the due day', () => {
    expect(quizDueLabel(null, '2026-11-18')).toBe('No due date');
    expect(quizDueLabel('2026-11-17', '2026-11-18')).toBe('Overdue');
    expect(quizDueLabel('2026-11-18', '2026-11-18')).toBe('Due today');
    expect(quizDueLabel('2026-11-19', '2026-11-18')).toBe('Due tomorrow');
    expect(quizDueLabel('2026-11-25', '2026-11-18')).toBe('Due in 7 days');
  });
});

describe('parseLocalQuizzes and scores', () => {
  it('drops broken data and keeps good quizzes', () => {
    expect(parseLocalQuizzes(null)).toEqual([]);
    expect(parseLocalQuizzes('nope')).toEqual([]);
    const parsed = parseLocalQuizzes(
      JSON.stringify([
        {
          id: 'q1',
          title: 'T',
          deckIds: ['A', 3],
          limit: 10,
          dueDay: '2026-12-01',
          results: [{ day: 'd', score: 4, total: 5 }, 7],
        },
        { title: 'no id' },
        { id: 'q2', title: 'U', dueDay: 'tomorrow', limit: -1 },
      ]),
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.deckIds).toEqual(['A']);
    expect(parsed[0]?.results).toHaveLength(1);
    expect(parsed[1]?.dueDay).toBeNull();
    expect(parsed[1]?.limit).toBeNull();
  });

  it('finds the best score', () => {
    expect(bestQuizPercent([])).toBeNull();
    expect(
      bestQuizPercent([
        { day: 'a', score: 3, total: 5 },
        { day: 'b', score: 5, total: 5 },
      ]),
    ).toBe(100);
    expect(bestQuizPercent([{ day: 'a', score: 0, total: 0 }])).toBeNull();
  });
});
