import { describe, expect, it } from 'vitest';

import { MAX_IMPORT_CARDS, parseDeck } from '../src/import';

describe('parseDeck', () => {
  it('reads a TSV deck', () => {
    const deck = parseDeck('front one\tback one\nfront two\tback two', 'Fallback');

    expect(deck.format).toBe('tsv');
    expect(deck.name).toBe('Fallback');
    expect(deck.cards).toEqual([
      { front: 'front one', back: 'back one', wrong: [] },
      { front: 'front two', back: 'back two', wrong: [] },
    ]);
    expect(deck.errors).toEqual([]);
  });

  it('reads a double colon deck, with and without spaces', () => {
    const spaced = parseDeck('Capital of France :: Paris', 'Fallback');
    const tight = parseDeck('Capital of France::Paris', 'Fallback');

    expect(spaced.format).toBe('double-colon');
    expect(spaced.cards).toEqual([{ front: 'Capital of France', back: 'Paris', wrong: [] }]);
    expect(tight.format).toBe('double-colon');
    expect(tight.cards).toEqual([{ front: 'Capital of France', back: 'Paris', wrong: [] }]);
  });

  it('reads a pipe deck, with and without spaces', () => {
    const spaced = parseDeck('Capital of France | Paris', 'Fallback');
    const tight = parseDeck('Capital of France|Paris', 'Fallback');

    expect(spaced.format).toBe('pipe');
    expect(spaced.cards).toEqual([{ front: 'Capital of France', back: 'Paris', wrong: [] }]);
    expect(tight.format).toBe('pipe');
    expect(tight.cards).toEqual([{ front: 'Capital of France', back: 'Paris', wrong: [] }]);
  });

  it('reads the wrong answers of a card', () => {
    const deck = parseDeck(
      'Capital of France :: Paris :: Marseille :: Lyon :: Nice\nCapital of Japan :: Tokyo :: Kyoto :: Osaka',
      'Fallback',
    );

    expect(deck.cards).toEqual([
      {
        front: 'Capital of France',
        back: 'Paris',
        wrong: ['Marseille', 'Lyon', 'Nice'],
      },
      { front: 'Capital of Japan', back: 'Tokyo', wrong: ['Kyoto', 'Osaka'] },
    ]);
    expect(deck.errors).toEqual([]);
  });

  it('keeps the separator of the first card line for the whole deck', () => {
    const deck = parseDeck('a | b | c\nd | e | f', 'Fallback');

    expect(deck.format).toBe('pipe');
    expect(deck.cards).toEqual([
      { front: 'a', back: 'b', wrong: ['c'] },
      { front: 'd', back: 'e', wrong: ['f'] },
    ]);
  });

  it('drops the wrong answers that repeat or that are the correct one', () => {
    const deck = parseDeck('a :: b :: b :: c :: c', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'a', back: 'b', wrong: ['c'] }]);
    expect(deck.errors).toEqual([]);
  });

  it('reports the lines with more than three wrong answers', () => {
    const deck = parseDeck('a :: b :: c :: d :: e :: f', 'Fallback');

    expect(deck.cards).toEqual([]);
    expect(deck.errors).toHaveLength(1);
    expect(deck.errors[0]).toContain('Line 1');
  });

  it('counts the multiple choice cards and the self-graded ones', () => {
    const deck = parseDeck('a :: b :: c\nd :: e', 'Fallback');

    expect(deck.counts).toEqual({ total: 2, multipleChoice: 1, selfGrade: 1 });
  });

  it('reads a JSON deck with the questions of the native shape', () => {
    const deck = parseDeck(
      JSON.stringify({
        name: 'Capitals',
        questions: [
          { question: 'Capital of France', correct: 'Paris', wrong: ['Marseille', 'Lyon'] },
          { question: 'Capital of Japan', correct: 'Tokyo', wrong: [] },
        ],
      }),
      'Fallback',
    );

    expect(deck.format).toBe('json');
    expect(deck.name).toBe('Capitals');
    expect(deck.cards).toEqual([
      { front: 'Capital of France', back: 'Paris', wrong: ['Marseille', 'Lyon'] },
      { front: 'Capital of Japan', back: 'Tokyo', wrong: [] },
    ]);
    expect(deck.counts).toEqual({ total: 2, multipleChoice: 1, selfGrade: 1 });
    expect(deck.errors).toEqual([]);
  });

  it('reads a JSON deck in the Blooket shape', () => {
    const byIndex = parseDeck(
      JSON.stringify({
        questions: [
          {
            question: 'Capital of France',
            answers: ['Paris', 'Marseille', 'Lyon', 'Nice'],
            correct: 0,
          },
        ],
      }),
      'Fallback',
    );

    expect(byIndex.cards).toEqual([
      { front: 'Capital of France', back: 'Paris', wrong: ['Marseille', 'Lyon', 'Nice'] },
    ]);

    const byAnswer = parseDeck(
      JSON.stringify({
        questions: [
          {
            question: 'Capital of France',
            answers: ['Paris', 'Marseille', 'Lyon', 'Nice'],
            correct: 'Paris',
          },
        ],
      }),
      'Fallback',
    );

    expect(byAnswer.cards).toEqual([
      { front: 'Capital of France', back: 'Paris', wrong: ['Marseille', 'Lyon', 'Nice'] },
    ]);
    expect(byAnswer.errors).toEqual([]);
  });

  it('still reads the legacy JSON cards', () => {
    const deck = parseDeck(
      JSON.stringify({ name: 'Capitals', cards: [{ front: 'Capital of France', back: 'Paris' }] }),
      'Fallback',
    );

    expect(deck.name).toBe('Capitals');
    expect(deck.cards).toEqual([{ front: 'Capital of France', back: 'Paris', wrong: [] }]);
    expect(deck.counts.selfGrade).toBe(1);
  });

  it('uses the fallback name when the JSON has none', () => {
    const deck = parseDeck(
      JSON.stringify({ questions: [{ question: 'a', correct: 'b' }] }),
      'Fallback',
    );

    expect(deck.name).toBe('Fallback');
    expect(deck.cards).toHaveLength(1);
  });

  it('reports the broken JSON', () => {
    const deck = parseDeck('{ not json', 'Fallback');

    expect(deck.format).toBe('json');
    expect(deck.cards).toEqual([]);
    expect(deck.errors).toHaveLength(1);
  });

  it('reports the JSON questions without a correct answer', () => {
    const deck = parseDeck(
      JSON.stringify({ questions: [{ question: 'a', correct: '' }, { question: 'b' }] }),
      'Fallback',
    );

    expect(deck.cards).toEqual([]);
    expect(deck.errors).toHaveLength(2);
    expect(deck.errors[0]).toContain('Question 1');
  });

  it('reports an empty text', () => {
    const deck = parseDeck('   \n  ', 'Fallback');

    expect(deck.cards).toEqual([]);
    expect(deck.errors).toHaveLength(1);
  });

  it('skips blank lines and comments', () => {
    const deck = parseDeck('# a comment\n\n  \nfront\tback\n# another', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'front', back: 'back', wrong: [] }]);
    expect(deck.errors).toEqual([]);
  });

  it('trims the fields', () => {
    const deck = parseDeck('  front  \t  back  ', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'front', back: 'back', wrong: [] }]);
  });

  it('counts the lines with an empty side as errors', () => {
    const deck = parseDeck('front\tback\n\tback only\nfront only\t\nno separator', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'front', back: 'back', wrong: [] }]);
    expect(deck.errors).toHaveLength(3);
    expect(deck.errors[0]).toContain('Line 2');
    expect(deck.errors[1]).toContain('Line 3');
    expect(deck.errors[2]).toContain('Line 4');
  });

  it('drops the duplicated cards', () => {
    const deck = parseDeck('front\tback\nfront\tback\nother\tback', 'Fallback');

    expect(deck.cards).toEqual([
      { front: 'front', back: 'back', wrong: [] },
      { front: 'other', back: 'back', wrong: [] },
    ]);
  });

  it('keeps at most 2000 cards', () => {
    const lines: string[] = [];
    for (let index = 0; index < MAX_IMPORT_CARDS + 10; index += 1) {
      lines.push(`front ${index}\tback ${index}`);
    }

    const deck = parseDeck(lines.join('\n'), 'Fallback');

    expect(deck.cards).toHaveLength(MAX_IMPORT_CARDS);
    expect(deck.errors).toHaveLength(1);
  });
});
