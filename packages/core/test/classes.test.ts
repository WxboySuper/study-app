import { describe, expect, it } from 'vitest';

import { buildDeckClassMap, decksOfClass } from '../src/classes';

describe('buildDeckClassMap', () => {
  it('maps every deck to its class', () => {
    const map = buildDeckClassMap([
      { id: 'set-a', classId: 'class-1' },
      { id: 'set-b', classId: null },
      { id: 'set-c' },
    ]);

    expect(map.get('set-a')).toBe('class-1');
    expect(map.get('set-b')).toBeNull();
    expect(map.get('set-c')).toBeNull();
  });
});

describe('decksOfClass', () => {
  const decks = [
    { id: 'set-a', classId: 'class-1' },
    { id: 'set-b', classId: 'class-1' },
    { id: 'set-c', classId: 'class-2' },
    { id: 'set-d', classId: null },
  ];

  it('returns the decks of a class', () => {
    expect(decksOfClass(decks, 'class-1').map((deck) => deck.id)).toEqual(['set-a', 'set-b']);
  });

  it('returns the decks without a class for the unsorted bucket', () => {
    expect(decksOfClass(decks, null).map((deck) => deck.id)).toEqual(['set-d']);
  });

  it('returns nothing for a class without decks', () => {
    expect(decksOfClass(decks, 'class-9')).toEqual([]);
  });
});
