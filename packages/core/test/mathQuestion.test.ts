import { describe, expect, it } from 'vitest';

import { parseDeck } from '../src/import';
import { mathSpecToEntry, parseStoredMathSpec, readMathSpec } from '../src/mathQuestion';
import { parseSyncSnapshot, planDeckSync } from '../src/sync';

const deck = (questions: unknown[]) => JSON.stringify({ name: 'Calc', questions });

describe('math questions in the deck format', () => {
  it('reads an expression question', () => {
    const parsed = parseDeck(
      deck([{ id: 'd1', type: 'math', question: '$\\frac{d}{dx}x^3$', answer: '3x^2' }]),
      'x',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards).toEqual([
      {
        id: 'd1',
        front: '$\\frac{d}{dx}x^3$',
        back: '3x^2',
        wrong: [],
        math: { kind: 'expression', answers: ['3x^2'] },
      },
    ]);
    expect(parsed.counts).toEqual({ total: 1, multipleChoice: 0, selfGrade: 0, math: 1 });
  });

  it('reads setup questions, several answers, numbers, + C and steps', () => {
    const parsed = parseDeck(
      deck([
        { type: 'math', question: 'Set up', setup: true, answer: 'int(x^2, x, 0, 2)' },
        { type: 'math', question: 'Antiderivative of 2x', answers: ['x^2 + C', 'x^2'] },
        { type: 'math', question: '2+2', answer: 4 },
        {
          type: 'math',
          question: 'Area between',
          answer: '4/3',
          steps: [
            { prompt: 'Set it up', answer: 'int(2x - x^2, x, 0, 2)', setup: true },
            { prompt: 'Antiderivative', answer: 'x^2 - x^3/3' },
          ],
        },
      ]),
      'x',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards.map((card) => card.math)).toEqual([
      { kind: 'setup', answers: ['int(x^2, x, 0, 2)'] },
      { kind: 'expression', answers: ['x^2 + C', 'x^2'], constant: true },
      { kind: 'expression', answers: ['4'] },
      {
        kind: 'expression',
        answers: ['4/3'],
        steps: [
          { prompt: 'Set it up', answers: ['int(2x - x^2, x, 0, 2)'], kind: 'setup' },
          { prompt: 'Antiderivative', answers: ['x^2 - x^3/3'], kind: 'expression' },
        ],
      },
    ]);
  });

  it('reports broken math questions', () => {
    const parsed = parseDeck(
      deck([
        { type: 'math', question: '', answer: '1' },
        { type: 'math', question: 'a' },
        { type: 'math', question: 'b', answer: '1', steps: 'no' },
        { type: 'math', question: 'c', answer: '1', steps: [{ answer: '1' }] },
        { type: 'math', question: 'd', answer: '1', steps: [{ prompt: 'p' }] },
        { type: 'math', question: 'e', answers: Array.from({ length: 9 }, (_, i) => String(i)) },
        { type: 'math', question: 'f', answer: 'x'.repeat(301) },
        { type: 'math', question: 'g', answer: '1', steps: Array.from({ length: 9 }, () => ({ prompt: 'p', answer: '1' })) },
      ]),
      'x',
    );
    expect(parsed.cards).toEqual([]);
    expect(parsed.errors).toHaveLength(8);
  });

  it('round-trips a stored spec', () => {
    const spec = readMathSpec({
      setup: true,
      answers: ['int(x, x, 0, 1)'],
      constant: true,
      steps: [{ prompt: 'p', answer: 'x', kind: 'setup' }],
    });
    expect(typeof spec).toBe('object');
    if (typeof spec === 'string') return;
    expect(parseStoredMathSpec(JSON.stringify(spec))).toEqual(spec);
    expect(parseStoredMathSpec({ math: spec })).toEqual(spec);
    expect(readMathSpec(mathSpecToEntry(spec))).toEqual(spec);
    expect(mathSpecToEntry({ kind: 'expression', answers: ['1'] })).toEqual({ type: 'math', answers: ['1'] });
    expect(parseStoredMathSpec('{nope')).toBeUndefined();
    expect(parseStoredMathSpec(['x'])).toBeUndefined();
    expect(parseStoredMathSpec({})).toBeUndefined();
  });

  it('passes the math of a synced question through', () => {
    const snapshot = parseSyncSnapshot({
      now: 1,
      decks: [
        {
          id: 'deck',
          name: 'Calc',
          class: null,
          updatedAt: 1,
          deleted: false,
          questions: [
            { id: 'q1', question: 'd/dx x^2', correct: '2x', wrong: [], position: 0, type: 'math', math: { kind: 'expression', answers: ['2x'] } },
            { id: 'q2', question: 'Q', correct: 'a', wrong: ['b'], position: 1 },
          ],
        },
      ],
    });
    const questions = snapshot?.decks[0]?.questions ?? [];
    expect(questions[0]?.math).toEqual({ kind: 'expression', answers: ['2x'] });
    expect(questions[1]?.math).toBeUndefined();

    if (snapshot === null) return;
    const plan = planDeckSync({ classes: [], decks: [], questions: [] }, snapshot);
    expect(plan.decks[0]?.questions[0]?.math).toEqual({ kind: 'expression', answers: ['2x'] });
    expect(plan.decks[0]?.questions[1]).not.toHaveProperty('math');
  });
});
