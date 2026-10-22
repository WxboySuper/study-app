import { describe, expect, it } from 'vitest';

import { MAX_IMPORT_CARDS, parseDeck } from '../src/import';

describe('parseDeck', () => {
  it('reads a TSV deck', () => {
    const deck = parseDeck('front one\tback one\nfront two\tback two', 'Fallback');

    expect(deck.format).toBe('tsv');
    expect(deck.name).toBe('Fallback');
    expect(deck.cards).toEqual([
      { front: 'front one', back: 'back one' },
      { front: 'front two', back: 'back two' },
    ]);
    expect(deck.errors).toEqual([]);
  });

  it('reads a double colon deck, with and without spaces', () => {
    const spaced = parseDeck('Capital of France :: Paris', 'Fallback');
    const tight = parseDeck('Capital of France::Paris', 'Fallback');

    expect(spaced.format).toBe('double-colon');
    expect(spaced.cards).toEqual([{ front: 'Capital of France', back: 'Paris' }]);
    expect(tight.format).toBe('double-colon');
    expect(tight.cards).toEqual([{ front: 'Capital of France', back: 'Paris' }]);
  });

  it('reads a pipe deck, with and without spaces', () => {
    const spaced = parseDeck('Capital of France | Paris', 'Fallback');
    const tight = parseDeck('Capital of France|Paris', 'Fallback');

    expect(spaced.format).toBe('pipe');
    expect(spaced.cards).toEqual([{ front: 'Capital of France', back: 'Paris' }]);
    expect(tight.format).toBe('pipe');
    expect(tight.cards).toEqual([{ front: 'Capital of France', back: 'Paris' }]);
  });

  it('splits on the first separator only', () => {
    const deck = parseDeck('a | b | c', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'a', back: 'b | c' }]);
  });

  it('skips blank lines and comments', () => {
    const deck = parseDeck('# a comment\n\n  \nfront\tback\n# another', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'front', back: 'back' }]);
    expect(deck.errors).toEqual([]);
  });

  it('trims the fields', () => {
    const deck = parseDeck('  front  \t  back  ', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'front', back: 'back' }]);
  });

  it('counts the lines with an empty side as errors', () => {
    const deck = parseDeck('front\tback\n\tback only\nfront only\t\nno separator', 'Fallback');

    expect(deck.cards).toEqual([{ front: 'front', back: 'back' }]);
    expect(deck.errors).toHaveLength(3);
    expect(deck.errors[0]).toContain('Line 2');
    expect(deck.errors[1]).toContain('Line 3');
    expect(deck.errors[2]).toContain('Line 4');
  });

  it('drops the duplicated cards', () => {
    const deck = parseDeck('front\tback\nfront\tback\nother\tback', 'Fallback');

    expect(deck.cards).toEqual([
      { front: 'front', back: 'back' },
      { front: 'other', back: 'back' },
    ]);
  });

  it('reads a JSON deck', () => {
    const deck = parseDeck(
      JSON.stringify({
        name: 'Capitals',
        cards: [
          { front: 'Capital of France', back: 'Paris' },
          { front: 'Capital of Japan', back: 'Tokyo' },
        ],
      }),
      'Fallback',
    );

    expect(deck.format).toBe('json');
    expect(deck.name).toBe('Capitals');
    expect(deck.cards).toHaveLength(2);
    expect(deck.errors).toEqual([]);
  });

  it('uses the fallback name when the JSON has none', () => {
    const deck = parseDeck(JSON.stringify({ cards: [{ front: 'a', back: 'b' }] }), 'Fallback');

    expect(deck.name).toBe('Fallback');
    expect(deck.cards).toHaveLength(1);
  });

  it('reports the broken JSON', () => {
    const deck = parseDeck('{ not json', 'Fallback');

    expect(deck.format).toBe('json');
    expect(deck.cards).toEqual([]);
    expect(deck.errors).toHaveLength(1);
  });

  it('reports the JSON cards without a front or a back', () => {
    const deck = parseDeck(
      JSON.stringify({ cards: [{ front: 'a', back: '' }, { front: 'b' }] }),
      'Fallback',
    );

    expect(deck.cards).toEqual([]);
    expect(deck.errors).toHaveLength(2);
    expect(deck.errors[0]).toContain('Card 1');
  });

  it('reports an empty text', () => {
    const deck = parseDeck('   \n  ', 'Fallback');

    expect(deck.cards).toEqual([]);
    expect(deck.errors).toHaveLength(1);
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
