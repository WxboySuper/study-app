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
