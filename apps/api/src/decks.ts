import { parseDeck, type ImportCard } from '@study-app/core';

/**
 * The decks of the game.
 *
 * A deck is a pile of questions that the player shares between their
 * devices. The rules are the ones of the importer of the app
 * (`parseDeck` of `@study-app/core`): every question carries its own wrong
 * answers, and a question without wrong answers is a **self-graded** one
 * (the player grades itself).
 *
 * The service never invents a format of its own: the body of a deck is
 * read by the very parser that reads the pasted decks of the app.
 */

/** A question of a deck, as the API answers it. */
export interface DeckQuestion {
  /** The id of the question (the client keys its cards with it). */
  id: string;
  /** The question itself. */
  question: string;
  /** The correct answer. */
  correct: string;
  /** The wrong answers of the author (0 to 3). */
  wrong: string[];
  /** The order of the question inside its deck. */
  position: number;
  /** `true` when the question has no wrong answer of its own. */
  selfGraded: boolean;
}

/** The deck as the API answers it (the answer of a `POST /api/decks`). */
export interface DeckSummary {
  /** The id of the deck. */
  id: string;
  /** The name of the deck. */
  name: string;
  /** The questions of the deck. */
  questions: DeckQuestion[];
  /** `true` when at least one question of the deck is self-graded. */
  selfGraded: boolean;
}

/** A deck as the sync answers it. */
export interface SyncDeck {
  /** The id of the deck. */
  id: string;
  /** The name of the deck. */
  name: string;
  /** The class of the deck (`null` when it has none). */
  class: string | null;
  /** When the deck changed (epoch milliseconds). */
  updatedAt: number;
  /** `true` when the deck is deleted (the client drops it). */
  deleted: boolean;
  /** The questions of the deck (empty for a deleted deck). */
  questions: DeckQuestion[];
}

/** What the caller of {@link upsertDeck} hands over. */
export interface DeckInput {
  /** The id of the deck (`null` when the deck is new). */
  id: string | null;
  /** The name of the deck. */
  name: string;
  /** The class of the deck (`null` when it has none). */
  class: string | null;
  /** The questions of the deck, already parsed. */
  cards: readonly ImportCard[];
}

/** The row of a deck in D1. */
interface DeckRow {
  id: string;
  name: string;
  class_name: string | null;
  updated_at: number;
  deleted: number;
}

/** The row of a question in D1. */
interface QuestionRow {
  id: string;
  position: number;
  question: string;
  correct: string;
  wrong_json: string;
}

/**
 * Reads a deck of a text (a JSON deck or a pasted deck).
 *
 * The parser of the core does the work: the JSON shape of the app (the
 * question, the correct answer and the wrong answers) and the shape of
 * Blooket (the answers and the index of the right one) are both read, and
 * a question with more than three wrong answers is an error.
 */
export function readDeck(
  text: string,
  fallbackName: string,
): { name: string; cards: ImportCard[]; errors: string[] } {
  const parsed = parseDeck(text, fallbackName);
  return { name: parsed.name, cards: parsed.cards, errors: parsed.errors };
}

/**
 * Saves a deck and replaces its questions.
 *
 * The deck is found by its id, or by its name when it has none: a deck that
 * is pushed twice without an id does not become two decks.
 *
 * The questions of the deck are replaced by the ones of the push, but they
 * keep their id when they sit at the same place: the scheduling state of a
 * question (what the player already reviewed) survives an update.
 */
export async function upsertDeck(
  db: D1Database,
  input: DeckInput,
  now: number = Date.now(),
): Promise<{ deck: DeckSummary; created: boolean }> {
  const known = input.id === null ? await findDeckIdByName(db, input.name) : input.id;
  const deckId = known ?? makeId('deck');
  const created = known === null;
  const previous = await listQuestionIds(db, deckId);

  const questions: DeckQuestion[] = input.cards.map((card, index) => ({
    id: previous[index] ?? makeId('q'),
    question: card.front,
    correct: card.back,
    wrong: [...card.wrong],
    position: index,
    selfGraded: card.wrong.length === 0,
  }));

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO decks (id, name, class_name, updated_at, deleted)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           class_name = excluded.class_name,
           updated_at = excluded.updated_at,
           deleted = 0`,
      )
      .bind(deckId, input.name, input.class, now),
    db.prepare('DELETE FROM questions WHERE deck_id = ?').bind(deckId),
  ];

  for (const question of questions) {
    statements.push(
      db
        .prepare(
          `INSERT INTO questions (id, deck_id, position, question, correct, wrong_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          question.id,
          deckId,
          question.position,
          question.question,
          question.correct,
          JSON.stringify(question.wrong),
          now,
        ),
    );
  }

  // The batch is atomic: the deck and its questions are written together.
  await db.batch(statements);

  return {
    deck: {
      id: deckId,
      name: input.name,
      questions,
      selfGraded: questions.some((question) => question.selfGraded),
    },
    created,
  };
}

/**
 * Flags a deck as deleted.
 *
 * The deck is not thrown away: the tombstone is what the other devices
 * read to drop the deck (and its questions) from their own store.
 *
 * @returns `false` when the deck does not exist.
 */
export async function deleteDeck(
  db: D1Database,
  id: string,
  now: number = Date.now(),
): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM decks WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();

  if (row === null) {
    return false;
  }

  await db
    .prepare('UPDATE decks SET deleted = 1, updated_at = ? WHERE id = ?')
    .bind(now, id)
    .run();

  return true;
}

/**
 * Reads the decks that changed after a moment in time.
 *
 * The deleted decks are part of the answer (with their tombstone), so the
 * client can drop them.
 */
export async function readDecksSince(db: D1Database, since: number): Promise<SyncDeck[]> {
  const decks = await db
    .prepare(
      `SELECT id, name, class_name, updated_at, deleted
       FROM decks
       WHERE updated_at > ?
       ORDER BY updated_at ASC, id ASC`,
    )
    .bind(since)
    .all<DeckRow>();

  const rows = decks.results ?? [];
  if (rows.length === 0) {
    return [];
  }

  const statements = rows.map((deck) =>
    db
      .prepare(
        `SELECT id, position, question, correct, wrong_json
         FROM questions
         WHERE deck_id = ?
         ORDER BY position ASC`,
      )
      .bind(deck.id),
  );

  const questions = await db.batch(statements);

  return rows.map((deck, index) => ({
    id: deck.id,
    name: deck.name,
    class: deck.class_name,
    updatedAt: deck.updated_at,
    deleted: deck.deleted === 1,
    questions: deck.deleted === 1 ? [] : toQuestions((questions[index]?.results ?? []) as QuestionRow[]),
  }));
}

/** Finds the id of a deck by its name (`null` when there is none). */
async function findDeckIdByName(db: D1Database, name: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM decks WHERE name = ? LIMIT 1')
    .bind(name)
    .first<{ id: string }>();

  return row?.id ?? null;
}

/** Reads the ids of the questions of a deck, in their order. */
async function listQuestionIds(db: D1Database, deckId: string): Promise<string[]> {
  const rows = await db
    .prepare('SELECT id FROM questions WHERE deck_id = ? ORDER BY position ASC')
    .bind(deckId)
    .all<{ id: string }>();

  return (rows.results ?? []).map((row) => row.id);
}

/** Turns the rows of D1 into the questions of a deck. */
function toQuestions(rows: readonly QuestionRow[]): DeckQuestion[] {
  return rows.map((row) => {
    const wrong = readWrongAnswers(row.wrong_json);

    return {
      id: row.id,
      question: row.question,
      correct: row.correct,
      wrong,
      position: row.position,
      selfGraded: wrong.length === 0,
    };
  });
}

/**
 * Reads the wrong answers of a question.
 *
 * Broken data never breaks the sync: a question whose answers cannot be
 * read is a self-graded one.
 */
function readWrongAnswers(wrongJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(wrongJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

/** A unique id. */
function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
