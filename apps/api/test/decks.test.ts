import { describe, expect, it } from 'vitest';

import app from '../src/index';
import type { Bindings } from '../src/types';
import { fakeDatabase, type FakeD1 } from './fake-d1';

/**
 * The tests of the decks.
 *
 * The Worker is called directly (`app.fetch`): no network, no real database.
 * The D1 of the tests is the small in-memory database of `fake-d1.ts`.
 */

/** The token of the Worker of the tests. */
const MUSE_TOKEN = 'muse-token-of-the-tests';

/** The deck of the tests. */
const DECK = {
  name: 'European capitals',
  class: 'Geography',
  questions: [
    {
      question: 'Capital of France',
      correct: 'Paris',
      wrong: ['Marseille', 'Lyon', 'Nice'],
    },
    {
      question: 'Capital of Italy',
      correct: 'Rome',
      wrong: ['Milan', 'Venice'],
    },
  ],
};

/** A Worker of the tests, with its own database. */
function setup(secret: string | null = MUSE_TOKEN): { env: Bindings; fake: FakeD1 } {
  const { db, fake } = fakeDatabase();
  return { env: { DB: db, MUSE_TOKEN: secret ?? undefined }, fake };
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

describe('POST /api/decks', () => {
  it('refuses a request without a token', async () => {
    const { env } = setup();

    const response = await call(env, '/api/decks', {
      method: 'POST',
      body: JSON.stringify(DECK),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('refuses a request with a wrong token', async () => {
    const { env } = setup();

    const response = await call(env, '/api/decks', {
      method: 'POST',
      headers: { authorization: 'Bearer not-the-good-one' },
      body: JSON.stringify(DECK),
    });

    expect(response.status).toBe(401);
  });

  it('refuses a request when the Worker has no secret', async () => {
    const { env } = setup(null);

    const response = await call(env, '/api/decks', {
      method: 'POST',
      headers: { authorization: `Bearer ${MUSE_TOKEN}` },
      body: JSON.stringify(DECK),
    });

    expect(response.status).toBe(401);
  });

  it('saves the deck and answers with it', async () => {
    const { env, fake } = setup();

    const result = await pushDeck(env);
    expect(result.status).toBe(201);

    const answer = (await result.json()) as {
      id: string;
      name: string;
      selfGraded: boolean;
      questions: { question: string; correct: string; wrong: string[] }[];
    };

    expect(answer.name).toBe('European capitals');
    expect(answer.selfGraded).toBe(false);
    expect(answer.questions).toHaveLength(2);
    expect(answer.questions[0]?.question).toBe('Capital of France');
    expect(answer.questions[0]?.wrong).toEqual(['Marseille', 'Lyon', 'Nice']);

    // The deck and its questions are in the database.
    expect(fake.decks).toHaveLength(1);
    expect(fake.decks[0]?.name).toBe('European capitals');
    expect(fake.decks[0]?.class_name).toBe('Geography');
    expect(fake.decks[0]?.deleted).toBe(0);
    expect(fake.questions).toHaveLength(2);
    expect(JSON.parse(fake.questions[0]?.wrong_json ?? '[]')).toEqual([
      'Marseille',
      'Lyon',
      'Nice',
    ]);
  });

  it('reads the shape of Blooket', async () => {
    const { env, fake } = setup();

    const result = await pushDeck(env, {
      name: 'Blooket deck',
      questions: [
        {
          question: 'Capital of Spain',
          answers: ['Madrid', 'Barcelona', 'Valencia'],
          correct: 0,
        },
      ],
    });

    expect(result.status).toBe(201);
    expect(fake.questions[0]?.correct).toBe('Madrid');
    expect(JSON.parse(fake.questions[0]?.wrong_json ?? '[]')).toEqual([
      'Barcelona',
      'Valencia',
    ]);
  });

  it('flags a question without wrong answers as self-graded', async () => {
    const { env } = setup();

    const result = await pushDeck(env, {
      name: 'Self graded deck',
      questions: [{ question: 'What is 2 + 2?', correct: '4' }],
    });

    const answer = (await result.json()) as {
      selfGraded: boolean;
      questions: { selfGraded: boolean; wrong: string[] }[];
    };

    expect(answer.selfGraded).toBe(true);
    expect(answer.questions[0]?.selfGraded).toBe(true);
    expect(answer.questions[0]?.wrong).toEqual([]);
  });

  it('refuses a deck that cannot be read', async () => {
    const { env } = setup();

    const response = await call(env, '/api/decks', {
      method: 'POST',
      headers: { authorization: `Bearer ${MUSE_TOKEN}` },
      body: JSON.stringify({
        name: 'Broken deck',
        questions: [
          {
            question: 'Too many answers',
            correct: 'Yes',
            wrong: ['a', 'b', 'c', 'd'],
          },
        ],
      }),
    });

    expect(response.status).toBe(400);

    const answer = (await response.json()) as { error: string; errors: string[] };
    expect(answer.error).toBe('invalid_deck');
    expect(answer.errors.length).toBeGreaterThan(0);
  });

  it('refuses a deck without questions', async () => {
    const { env } = setup();

    const response = await call(env, '/api/decks', {
      method: 'POST',
      headers: { authorization: `Bearer ${MUSE_TOKEN}` },
      body: JSON.stringify({ name: 'Empty deck', questions: [] }),
    });

    expect(response.status).toBe(400);
  });

  it('saves the deck under the id of the body', async () => {
    const { env, fake } = setup();

    const result = await pushDeck(env, { ...DECK, id: 'deck_of_the_client' });
    const answer = (await result.json()) as { id: string };

    expect(answer.id).toBe('deck_of_the_client');
    expect(fake.decks[0]?.id).toBe('deck_of_the_client');
  });

  it('updates a deck that is pushed again with its id', async () => {
    const { env, fake } = setup();

    await pushDeck(env, { ...DECK, id: 'deck_of_the_client' });

    const response = await pushDeck(env, {
      id: 'deck_of_the_client',
      name: 'European capitals (2026)',
      questions: [{ question: 'Capital of Spain', correct: 'Madrid', wrong: ['Barcelona'] }],
    });

    expect(response.status).toBe(200);

    const answer = (await response.json()) as { id: string; name: string; questions: unknown[] };
    expect(answer.id).toBe('deck_of_the_client');
    expect(answer.name).toBe('European capitals (2026)');

    // The questions of the deck are replaced by the ones of the push.
    expect(fake.decks).toHaveLength(1);
    expect(fake.questions).toHaveLength(1);
    expect(fake.questions[0]?.question).toBe('Capital of Spain');
  });

  it('updates the deck of the same name when the body has no id', async () => {
    const { env, fake } = setup();

    const first = await pushDeck(env);
    const firstAnswer = (await first.json()) as { id: string };

    const response = await pushDeck(env);
    const answer = (await response.json()) as { id: string };

    expect(response.status).toBe(200);
    expect(answer.id).toBe(firstAnswer.id);
    expect(fake.decks).toHaveLength(1);
  });

  it('keeps the id of a question that stays at its place', async () => {
    const { env, fake } = setup();

    await pushDeck(env);
    const questionId = fake.questions[0]?.id;

    await pushDeck(env);

    // The client keys its cards with the id of the question: the id has to
    // survive an update, or the player loses what they already reviewed.
    expect(fake.questions[0]?.id).toBe(questionId);
  });
});

describe('DELETE /api/decks/:id', () => {
  it('refuses a request without a token', async () => {
    const { env } = setup();

    const response = await call(env, '/api/decks/deck_of_the_client', { method: 'DELETE' });

    expect(response.status).toBe(401);
  });

  it('flags the deck as deleted', async () => {
    const { env, fake } = setup();

    await pushDeck(env, { ...DECK, id: 'deck_of_the_client' });

    const deleted = await call(env, '/api/decks/deck_of_the_client', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${MUSE_TOKEN}` },
    });

    expect(deleted.status).toBe(200);
    expect(fake.decks[0]?.deleted).toBe(1);
  });

  it('answers 404 for a deck that does not exist', async () => {
    const { env } = setup();

    const response = await call(env, '/api/decks/nope', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${MUSE_TOKEN}` },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});
