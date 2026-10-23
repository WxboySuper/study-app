import { describe, expect, it } from 'vitest';

import {
  parseSyncSnapshot,
  planDeckSync,
  type LocalSyncState,
  type RemoteSyncSnapshot,
} from '../src/sync';

/** A question of the server. */
function question(id: string, position: number) {
  return {
    id,
    question: `Question ${id}`,
    correct: `Correct ${id}`,
    wrong: [`Wrong ${id}`],
    position,
    selfGraded: false,
    retired: false,
  };
}

/** A deck of the server. */
function deck(id: string, overrides: Partial<RemoteSyncSnapshot['decks'][number]> = {}) {
  return {
    id,
    name: `Deck ${id}`,
    class: null,
    updatedAt: 100,
    deleted: false,
    questions: [question(`${id}-q1`, 0)],
    ...overrides,
  };
}

/** An empty local store. */
const EMPTY: LocalSyncState = { classes: [], decks: [], questions: [] };

describe('parseSyncSnapshot', () => {
  it('reads the answer of the API', () => {
    const snapshot = parseSyncSnapshot({
      now: 1234,
      decks: [
        {
          id: 'deck1',
          name: 'European capitals',
          class: ' Geography ',
          updatedAt: 1200,
          deleted: false,
          questions: [
            {
              id: 'q1',
              question: 'Capital of France',
              correct: 'Paris',
              wrong: ['Lyon', 3, 'Marseille'],
              position: 0,
              selfGraded: false,
            },
          ],
        },
      ],
    });

    expect(snapshot).toEqual({
      now: 1234,
      decks: [
        {
          id: 'deck1',
          name: 'European capitals',
          class: 'Geography',
          updatedAt: 1200,
          deleted: false,
          questions: [
            {
              id: 'q1',
              question: 'Capital of France',
              correct: 'Paris',
              wrong: ['Lyon', 'Marseille'],
              position: 0,
              selfGraded: false,
              retired: false,
            },
          ],
        },
      ],
    });
  });

  it('reads a self-graded question without a flag and drops its questions when deleted', () => {
    const snapshot = parseSyncSnapshot({
      now: 5,
      decks: [
        {
          id: 'deck1',
          name: 'Deck',
          class: '',
          updatedAt: 4,
          deleted: true,
          questions: [question('q1', 0)],
        },
        {
          id: 'deck2',
          name: 'Deck 2',
          class: null,
          updatedAt: 3,
          deleted: false,
          questions: [
            {
              id: 'q2',
              question: 'Question',
              correct: 'Answer',
              wrong: [],
              position: 1,
            },
          ],
        },
      ],
    });

    expect(snapshot?.decks[0]?.class).toBeNull();
    expect(snapshot?.decks[0]?.questions).toEqual([]);
    expect(snapshot?.decks[1]?.questions[0]?.selfGraded).toBe(true);
  });

  it('refuses an answer that is not the one of the API', () => {
    expect(parseSyncSnapshot(null)).toBeNull();
    expect(parseSyncSnapshot('nope')).toBeNull();
    expect(parseSyncSnapshot([])).toBeNull();
    expect(parseSyncSnapshot({ decks: [] })).toBeNull();
    expect(parseSyncSnapshot({ now: 'today', decks: [] })).toBeNull();
    expect(parseSyncSnapshot({ now: Number.POSITIVE_INFINITY, decks: [] })).toBeNull();
    expect(parseSyncSnapshot({ now: 1, decks: 'nope' })).toBeNull();
  });

  it('skips a broken deck and a broken question', () => {
    const snapshot = parseSyncSnapshot({
      now: 1,
      decks: [
        null,
        [],
        { id: '', name: 'Deck', updatedAt: 1, deleted: false },
        { id: 'deck1', name: 'Deck', updatedAt: 'soon', deleted: false },
        { id: 'deck2', name: 3, updatedAt: 1, deleted: false },
        { id: 'deck3', name: 'Deck', updatedAt: 1, deleted: 'no' },
        {
          id: 'deck4',
          name: 'Deck',
          class: 'Math',
          updatedAt: 1,
          deleted: false,
          questions: [
            null,
            { id: '', question: 'q', correct: 'a', wrong: [], position: 0 },
            { id: 'q1', question: 3, correct: 'a', wrong: [], position: 0 },
            { id: 'q2', question: 'q', correct: 3, wrong: [], position: 0 },
            { id: 'q3', question: 'q', correct: 'a', wrong: [], position: 'first' },
            { id: 'q4', question: 'q', correct: 'a', wrong: [], position: 0 },
          ],
        },
        {
          id: 'deck5',
          name: 'Deck',
          updatedAt: 1,
          deleted: false,
          questions: 'not a list',
        },
      ],
    });

    expect(snapshot?.decks).toHaveLength(2);
    expect(snapshot?.decks[0]?.id).toBe('deck4');
    expect(snapshot?.decks[0]?.questions.map((entry) => entry.id)).toEqual(['q4']);
    expect(snapshot?.decks[1]?.id).toBe('deck5');
    expect(snapshot?.decks[1]?.questions).toEqual([]);
  });
});

describe('planDeckSync', () => {
  it('creates the deck, its class and its questions', () => {
    const plan = planDeckSync(EMPTY, {
      now: 1000,
      decks: [
        deck('deck1', {
          name: ' European capitals ',
          class: 'Science',
          updatedAt: 900,
          questions: [question('q2', 2), question('q1', 1)],
        }),
      ],
    });

    expect(plan.cursor).toBe(1000);
    expect(plan.classes).toEqual([{ id: 'class_sync_science', name: 'Science' }]);
    expect(plan.deletedDeckIds).toEqual([]);
    expect(plan.decks).toHaveLength(1);

    const planned = plan.decks[0];
    expect(planned?.created).toBe(true);
    expect(planned?.localId).toBe('set_sync_deck1');
    expect(planned?.remoteId).toBe('deck1');
    expect(planned?.title).toBe('European capitals');
    expect(planned?.classId).toBe('class_sync_science');
    expect(planned?.removedQuestionIds).toEqual([]);
    expect(planned?.questions.map((entry) => entry.remoteId)).toEqual(['q1', 'q2']);
    expect(planned?.questions.map((entry) => entry.position)).toEqual([1, 2]);
    expect(planned?.questions.every((entry) => entry.created)).toBe(true);
    expect(planned?.questions[0]?.wrong).toEqual(['Wrong q1']);
  });

  it('updates the deck and keeps the questions it already knows', () => {
    const local: LocalSyncState = {
      classes: [{ id: 'class1', name: 'science' }],
      decks: [{ id: 'set1', remoteId: 'deck1', title: 'Old name' }],
      questions: [
        { id: 'card1', remoteId: 'q1', setId: 'set1' },
        { id: 'cardGone', remoteId: 'q2', setId: 'set1' },
        { id: 'localCard', remoteId: null, setId: 'set1' },
      ],
    };

    const plan = planDeckSync(local, {
      now: 500,
      decks: [
        deck('deck1', {
          name: 'New name',
          class: ' Science ',
          updatedAt: 400,
          questions: [question('q1', 0), question('q3', 1)],
        }),
      ],
    });

    expect(plan.classes).toEqual([]);
    expect(plan.decks[0]?.created).toBe(false);
    expect(plan.decks[0]?.localId).toBe('set1');
    expect(plan.decks[0]?.title).toBe('New name');
    expect(plan.decks[0]?.classId).toBe('class1');
    expect(plan.decks[0]?.questions[0]?.localId).toBe('card1');
    expect(plan.decks[0]?.questions[0]?.created).toBe(false);
    expect(plan.decks[0]?.questions[1]?.localId).toBe('set1_card_q3');
    expect(plan.decks[0]?.questions[1]?.created).toBe(true);
    // A local question without a remote id is never deleted by the sync.
    expect(plan.decks[0]?.removedQuestionIds).toEqual(['cardGone']);
  });

  it('deletes the local decks the server deleted', () => {
    const local: LocalSyncState = {
      classes: [],
      decks: [
        { id: 'set1', remoteId: 'deck1', title: 'Deck 1' },
        { id: 'set2', remoteId: 'deck2', title: 'Deck 2' },
      ],
      questions: [],
    };

    const plan = planDeckSync(local, {
      now: 10,
      decks: [
        deck('deck1', { deleted: true, updatedAt: 5, questions: [] }),
        deck('unknown', { deleted: true, updatedAt: 5, questions: [] }),
      ],
    });

    expect(plan.deletedDeckIds).toEqual(['set1']);
    expect(plan.decks).toEqual([]);
    expect(plan.cursor).toBe(10);
  });

  it('creates one class for the names that differ in case and spaces', () => {
    const plan = planDeckSync(EMPTY, {
      now: 10,
      decks: [
        deck('deck1', { class: 'Math', updatedAt: 10 }),
        deck('deck2', { class: ' math ', updatedAt: 20 }),
      ],
    });

    expect(plan.classes).toEqual([{ id: 'class_sync_math', name: 'Math' }]);
    expect(plan.decks[0]?.classId).toBe('class_sync_math');
    expect(plan.decks[1]?.classId).toBe('class_sync_math');
    expect(plan.cursor).toBe(20);
  });

  it('never overwrites a local id', () => {
    const local: LocalSyncState = {
      classes: [{ id: 'class_sync_science', name: 'Other' }],
      decks: [{ id: 'set_sync_deck1', remoteId: null, title: 'Imported' }],
      questions: [{ id: 'set_sync_deck1_card_q1', remoteId: null, setId: 'set_sync_deck1' }],
    };

    const plan = planDeckSync(local, {
      now: 10,
      decks: [
        deck('deck1', {
          class: 'Science',
          questions: [question('q1', 0)],
        }),
      ],
    });

    expect(plan.classes[0]?.id).toBe('class_sync_science_2');
    expect(plan.decks[0]?.localId).toBe('set_sync_deck1_2');
    expect(plan.decks[0]?.questions[0]?.localId).toBe('set_sync_deck1_2_card_q1');
  });

  it('uses the id makers of the caller', () => {
    const plan = planDeckSync(
      EMPTY,
      { now: 10, decks: [deck('deck1', { class: 'History' })] },
      {
        makeDeckId: (remoteId) => `deck:${remoteId}`,
        makeQuestionId: (deckId, remoteId) => `${deckId}/${remoteId}`,
        makeClassId: (name) => `class:${name.toLowerCase()}`,
      },
    );

    expect(plan.classes[0]?.id).toBe('class:history');
    expect(plan.decks[0]?.localId).toBe('deck:deck1');
    expect(plan.decks[0]?.questions[0]?.localId).toBe('deck:deck1/deck1-q1');
  });

  it('falls back to the remote id for a deck without a name, and to no class', () => {
    const plan = planDeckSync(EMPTY, {
      now: 10,
      decks: [deck('deck1', { name: '   ', class: null })],
    });

    expect(plan.decks[0]?.title).toBe('deck1');
    expect(plan.decks[0]?.classId).toBeNull();
  });

  it('does nothing when the server has no deck', () => {
    const plan = planDeckSync(EMPTY, { now: 42, decks: [] });

    expect(plan).toEqual({
      cursor: 42,
      classes: [],
      decks: [],
      deletedDeckIds: [],
    });
  });
});
