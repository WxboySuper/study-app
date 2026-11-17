import { describe, expect, it } from 'vitest';

import { splitSyncPlan, type PlannedDeck, type SyncPlan } from '../src/index';

function deck(id: string): PlannedDeck {
  return {
    localId: id,
    remoteId: id,
    title: id,
    classId: null,
    updatedAt: 1,
    created: true,
    questions: [],
    removedQuestionIds: [],
  };
}

describe('splitSyncPlan', () => {
  const plan: SyncPlan = {
    cursor: 9,
    classes: [{ id: 'c1', name: 'Math' }],
    decks: ['a', 'b', 'c', 'd', 'e'].map(deck),
    deletedDeckIds: ['gone'],
  };

  it('puts the classes first, the decks in groups and the deletions last', () => {
    const parts = splitSyncPlan(plan, 2);
    expect(parts.map((part) => part.decks.map((entry) => entry.localId))).toEqual([
      [],
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
      [],
    ]);
    expect(parts[0]?.classes).toHaveLength(1);
    expect(parts.at(-1)?.deletedDeckIds).toEqual(['gone']);
    expect(parts.every((part) => part.cursor === 9)).toBe(true);
  });

  it('gives no parts for an empty plan', () => {
    expect(splitSyncPlan({ cursor: 1, classes: [], decks: [], deletedDeckIds: [] }, 8)).toEqual([]);
  });
});
