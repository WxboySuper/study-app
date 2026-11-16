import { describe, expect, it } from 'vitest';

import app from '../src/index';
import type { Bindings } from '../src/types';
import { fakeDatabase, type FakeD1 } from './fake-d1';

/**
 * The tests of the sync.
 *
 * The endpoint is public and read only: the app calls it to know what
 * changed since the last time it called it.
 */

/** The token of the Worker of the tests. */
const MUSE_TOKEN = 'muse-token-of-the-tests';

/** A deck of the tests. */
const DECK = {
  name: 'European capitals',
  class: 'Geography',
  questions: [
    {
      question: 'Capital of France',
      correct: 'Paris',
      wrong: ['Marseille', 'Lyon'],
    },
  ],
};

/** A Worker of the tests, with its own database. */
function setup(): { env: Bindings; fake: FakeD1 } {
  const { db, fake } = fakeDatabase();
  return { env: { DB: db, MUSE_TOKEN }, fake };
}

/** Calls the Worker. */
async function call(env: Bindings, path: string, init: RequestInit = {}): Promise<Response> {
  return app.fetch(new Request(`https://api.cramcritters.test${path}`, init), env);
}

/** Pushes a deck and waits for the answer. */
async function pushDeck(env: Bindings, deck: unknown = DECK): Promise<Response> {
  return call(env, '/api/decks', {
    method: 'POST',
    headers: { authorization: `Bearer ${MUSE_TOKEN}` },
    body: JSON.stringify(deck),
  });
}

describe('GET /api/sync', () => {
  it('answers with the decks of the server', async () => {
    const { env } = setup();

    const response = await call(env, '/api/sync');
    expect(response.status).toBe(200);

    const answer = (await response.json()) as { now: number; decks: unknown[] };
    expect(typeof answer.now).toBe('number');
    expect(answer.decks).toEqual([]);
  });

  it('answers with the decks that changed after the moment of the client', async () => {
    const { env } = setup();

    expect((await pushDeck(env)).status).toBe(201);

    const response = await call(env, '/api/sync');
    const answer = (await response.json()) as {
      now: number;
      decks: {
        id: string;
        name: string;
        class: string;
        updatedAt: number;
        deleted: boolean;
      }[];
    };

    expect(answer.decks).toHaveLength(1);
    expect(answer.decks[0]?.name).toBe('European capitals');
    expect(answer.decks[0]?.class).toBe('Geography');
    expect(answer.decks[0]?.deleted).toBe(false);
    expect(answer.decks[0]?.updatedAt).toBeGreaterThan(0);

    // The client that is up to date asks for nothing.
    const since = answer.decks[0]?.updatedAt ?? 0;
    const nothing = await call(env, `/api/sync?since=${since}`);
    const empty = (await nothing.json()) as { decks: unknown[] };
    expect(empty.decks).toEqual([]);
  });

  it('answers with the questions of a deck', async () => {
    const { env } = setup();
    await pushDeck(env);

    const response = await call(env, '/api/sync');
    const answer = (await response.json()) as {
      decks: { questions: { question: string; correct: string; wrong: string[] }[] }[];
    };

    expect(answer.decks[0]?.questions).toHaveLength(1);
    expect(answer.decks[0]?.questions[0]?.question).toBe('Capital of France');
    expect(answer.decks[0]?.questions[0]?.wrong).toEqual(['Marseille', 'Lyon']);
  });

  it('answers with the tombstone of a deleted deck', async () => {
    const { env } = setup();
    await pushDeck(env);

    const before = await call(env, '/api/sync');
    const decks = (await before.json()) as { decks: { id: string }[] };
    const id = decks.decks[0]?.id ?? '';

    const deleted = await call(env, `/api/decks/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${MUSE_TOKEN}` },
    });
    expect(deleted.status).toBe(200);

    const response = await call(env, '/api/sync');
    const answer = (await response.json()) as {
      decks: { deleted: boolean; questions: unknown[] }[];
    };

    expect(answer.decks).toHaveLength(1);
    expect(answer.decks[0]?.deleted).toBe(true);
    expect(answer.decks[0]?.questions).toEqual([]);
  });

  it('reads a broken moment as "everything"', async () => {
    const { env } = setup();
    await pushDeck(env);

    const response = await call(env, '/api/sync?since=not-a-moment');
    const answer = (await response.json()) as { decks: unknown[] };

    expect(answer.decks).toHaveLength(1);
  });

  it('answers with the CORS headers of a public endpoint', async () => {
    const { env } = setup();

    const response = await call(env, '/api/sync', {
      headers: { origin: 'https://cramcritters.app' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});

/**
 * The sync of a library of many decks.
 *
 * The phone once failed to sync 220 decks because the Worker read the
 * questions of every deck with a query of its own (about 17 seconds). The
 * questions are now read in one round trip; these tests keep the answer the
 * same as the answer of the per-deck reads (`GET /api/decks/:id`) and keep
 * the number of D1 calls flat.
 */

/** A deck of the answer. */
interface SyncedDeck {
  id: string;
  name: string;
  class: string | null;
  updatedAt: number;
  deleted: boolean;
  questions: unknown[];
}

/** How many decks the library of the tests has (more than any chunk of a bind list). */
const LIBRARY_SIZE = 250;

/** Writes a library straight into the database: some deleted decks, some retired questions, ties of `updated_at`. */
function seedLibrary(fake: FakeD1, count: number = LIBRARY_SIZE): void {
  const addDeck = fake.raw.prepare(
    'INSERT INTO decks (id, name, class_name, updated_at, deleted) VALUES (?, ?, ?, ?, ?)',
  );
  const addQuestion = fake.raw.prepare(
    `INSERT INTO questions (id, deck_id, position, question, correct, wrong_json, updated_at, retired)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < count; i += 1) {
    const id = `deck-${String(i).padStart(3, '0')}`;
    // Every 17th deck is a tombstone (it keeps its questions in the table).
    const deleted = i % 17 === 0 ? 1 : 0;
    // Three decks share every moment, so the order falls back to the id.
    addDeck.run(id, `Deck ${i}`, i % 2 === 0 ? 'Biology' : null, 1_000 + Math.floor(i / 3), deleted);

    for (let q = 0; q < 4; q += 1) {
      // The last question of every fifth deck is retired. The positions are
      // written backwards so the order of the answer has to come from the query.
      const retired = q === 3 && i % 5 === 0 ? 1 : 0;
      addQuestion.run(
        `${id}-q${q}`,
        id,
        3 - q,
        `Question ${i}.${q}`,
        `Answer ${i}.${q}`,
        JSON.stringify([`Wrong ${i}.${q}a`, `Wrong ${i}.${q}b`]),
        1_000,
        retired,
      );
    }
  }
}

/** Reads the decks of the sync. */
async function readSync(env: Bindings, query: string): Promise<SyncedDeck[]> {
  const response = await call(env, `/api/sync${query}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { decks: SyncedDeck[] }).decks;
}

/** Reads the questions of a deck with the read of one deck. */
async function readDeckQuestions(env: Bindings, id: string, retired: boolean): Promise<unknown[]> {
  const response = await call(env, `/api/decks/${id}${retired ? '?retired=1' : ''}`, {
    headers: { authorization: `Bearer ${MUSE_TOKEN}` },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { questions: unknown[] }).questions;
}

describe('GET /api/sync with a library of many decks', () => {
  it('answers every deck, in the order of the moment and then the id', async () => {
    const { env, fake } = setup();
    seedLibrary(fake);

    const decks = await readSync(env, '?since=0');

    expect(decks).toHaveLength(LIBRARY_SIZE);
    const order = decks.map((deck) => `${String(deck.updatedAt).padStart(6, '0')}${deck.id}`);
    expect(order).toEqual([...order].sort());
    expect(decks.filter((deck) => deck.deleted)).toHaveLength(Math.ceil(LIBRARY_SIZE / 17));
  });

  it('answers the same questions as the read of every deck, retired ones left out', async () => {
    const { env, fake } = setup();
    seedLibrary(fake);

    const decks = await readSync(env, '?since=0');

    for (const deck of decks) {
      if (deck.deleted) {
        // A tombstone has no questions, even if its rows are still in the table.
        expect(deck.questions).toEqual([]);
      } else {
        expect(deck.questions).toEqual(await readDeckQuestions(env, deck.id, false));
      }
    }

    // The retired questions are not in the answer, and the others are in order.
    const live = decks.find((deck) => deck.id === 'deck-006');
    expect(live?.questions).toHaveLength(4);
    const retiredDeck = decks.find((deck) => deck.id === 'deck-010');
    expect(retiredDeck?.questions).toHaveLength(3);
    expect((retiredDeck?.questions as { position: number }[]).map((q) => q.position)).toEqual([1, 2, 3]);
  });

  it('answers the same questions as the read of every deck with retired=1, retired ones last', async () => {
    const { env, fake } = setup();
    seedLibrary(fake);

    const decks = await readSync(env, '?since=0&retired=1');

    for (const deck of decks) {
      if (deck.deleted) {
        expect(deck.questions).toEqual([]);
      } else {
        expect(deck.questions).toEqual(await readDeckQuestions(env, deck.id, true));
      }
    }

    // deck-010 has a retired question and it comes after the live ones.
    const withRetired = decks.find((deck) => deck.id === 'deck-010');
    expect(withRetired?.questions).toHaveLength(4);
    expect((withRetired?.questions as { id: string }[]).at(-1)?.id).toBe('deck-010-q3');
  });

  it('only answers the decks that changed after the cursor, with their questions', async () => {
    const { env, fake } = setup();
    seedLibrary(fake);

    const since = 1_040;
    const decks = await readSync(env, `?since=${since}`);
    const expected = fake.decks.filter((deck) => deck.updated_at > since);

    expect(decks.length).toBeGreaterThan(0);
    expect(decks.length).toBeLessThan(LIBRARY_SIZE);
    expect(decks.map((deck) => deck.id).sort()).toEqual(expected.map((deck) => deck.id).sort());
    for (const deck of decks) {
      expect(deck.updatedAt).toBeGreaterThan(since);
    }
    // The decks are complete: every live deck still brings its questions.
    expect(decks.filter((deck) => !deck.deleted).every((deck) => deck.questions.length > 0)).toBe(true);
  });

  it('reads the library with one D1 round trip, however many decks there are', async () => {
    const { env, fake } = setup();
    seedLibrary(fake);

    const counts = { prepare: 0, batch: 0 };
    const counted = {
      prepare: (sql: string) => {
        counts.prepare += 1;
        return env.DB.prepare(sql);
      },
      batch: (list: D1PreparedStatement[]) => {
        counts.batch += 1;
        return env.DB.batch(list);
      },
    } as unknown as D1Database;

    const decks = await readSync({ ...env, DB: counted }, '?since=0&retired=1');

    expect(decks).toHaveLength(LIBRARY_SIZE);
    // The decks and the questions: two statements, one round trip. The old
    // read was 1 + one statement for every live deck.
    expect(counts).toEqual({ prepare: 2, batch: 1 });
  });
});
