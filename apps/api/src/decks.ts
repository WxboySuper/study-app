import {
  mathSpecToEntry,
  parseDeck,
  parseStoredMathSpec,
  type ImportCard,
  type MathSpec,
} from '@study-app/core';

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
  /** `true` when the question is retired (only sent when asked for). */
  retired?: boolean;
  /** `math` for a math question (only sent for them; the others are `mc`). */
  type?: 'math';
  /** The math part of a math question (only sent for them). */
  math?: MathSpec;
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
  retired: number;
  type: string | null;
  math_json: string | null;
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

/** The ids that a push kept, added and retired. */
export interface DeckChanges {
  /** The questions that were already there (their progress is kept). */
  kept: string[];
  /** The questions that are new. */
  added: string[];
  /** The questions that left the deck (hidden from play, history kept). */
  retired: string[];
}

/** A deck write that went wrong (the route answers it with a 4xx). */
export class DeckError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** What an id of a deck or a question may look like. */
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/** The row of a question with what the matching needs. */
interface MatchRow {
  id: string;
  question: string;
  retired: number;
}

/**
 * Saves a deck and its questions.
 *
 * The deck is found by its id, or by its name when it has none: a deck that
 * is pushed twice without an id does not become two decks.
 *
 * Every question keeps a **stable id**, so the progress of the player (the
 * scheduling state, the review history, the quiz results) survives an edit:
 *
 * 1. a question with an `id` that the deck already has is that question
 *    (its wording and its answers are updated);
 * 2. a question without an `id` is matched by its text (case and spaces
 *    ignored) with a question of the deck that is not matched yet;
 * 3. anything else is a new question (with the `id` it was given, or a new
 *    one).
 *
 * The questions of the deck that the push does not name are **retired**:
 * hidden from play and from new quizzes, their row kept. A retired question
 * that is pushed again comes back with its progress.
 */
export async function upsertDeck(
  db: D1Database,
  input: DeckInput,
  now: number = Date.now(),
): Promise<{ deck: DeckSummary; created: boolean; changes: DeckChanges }> {
  if (input.id !== null && !ID_PATTERN.test(input.id)) {
    throw new DeckError(400, 'invalid_deck', 'The id of the deck must be 1-128 chars of [A-Za-z0-9_.:-].');
  }

  const known =
    input.id === null
      ? await findDeckIdByName(db, input.name)
      : ((await db.prepare('SELECT id FROM decks WHERE id = ?').bind(input.id).first<{ id: string }>())
          ?.id ?? null);
  const deckId = known ?? input.id ?? makeId('deck');
  const created = known === null;

  const existing = await listMatchRows(db, deckId);
  const byId = new Map(existing.map((row) => [row.id, row]));
  const matched = new Set<string>();
  const seenIds = new Set<string>();
  const changes: DeckChanges = { kept: [], added: [], retired: [] };

  const assigned: { id: string; isNew: boolean }[] = [];
  for (const [index, card] of input.cards.entries()) {
    if (card.id !== undefined) {
      if (!ID_PATTERN.test(card.id)) {
        throw new DeckError(400, 'invalid_deck', `Question ${index + 1}: the id must be 1-128 chars of [A-Za-z0-9_.:-].`);
      }
      if (seenIds.has(card.id)) {
        throw new DeckError(400, 'invalid_deck', `Question ${index + 1}: the id "${card.id}" is used twice.`);
      }
    }
    assigned.push({ id: card.id ?? '', isNew: false });
    if (card.id !== undefined) {
      seenIds.add(card.id);
    }
  }

  // Pass 1: the questions that name an id of the deck.
  for (const [index, card] of input.cards.entries()) {
    if (card.id !== undefined && byId.has(card.id)) {
      matched.add(card.id);
      assigned[index] = { id: card.id, isNew: false };
    }
  }

  // Pass 2: the questions without an id, matched by their text (a question
  // that is still in play wins over a retired one).
  const free = (key: string) =>
    existing
      .filter((row) => !matched.has(row.id) && !seenIds.has(row.id) && textKey(row.question) === key)
      .sort((left, right) => left.retired - right.retired)[0];
  for (const [index, card] of input.cards.entries()) {
    if (card.id !== undefined) {
      continue;
    }
    const row = free(textKey(card.front));
    if (row !== undefined) {
      matched.add(row.id);
      assigned[index] = { id: row.id, isNew: false };
    }
  }

  // Pass 3: the new questions.
  for (const [index, card] of input.cards.entries()) {
    const slot = assigned[index] as { id: string; isNew: boolean };
    if (slot.id !== '' && matched.has(slot.id)) {
      continue;
    }
    if (card.id !== undefined) {
      const owner = await db
        .prepare('SELECT deck_id FROM questions WHERE id = ?')
        .bind(card.id)
        .first<{ deck_id: string }>();
      if (owner !== null && owner.deck_id !== deckId) {
        throw new DeckError(409, 'question_id_taken', `Question ${index + 1}: the id "${card.id}" belongs to another deck.`);
      }
    }
    assigned[index] = { id: card.id ?? makeId('q'), isNew: true };
  }

  const questions: DeckQuestion[] = input.cards.map((card, index) =>
    toDeckQuestion(card, (assigned[index] as { id: string }).id, index),
  );

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
  ];

  for (const [index, question] of questions.entries()) {
    if ((assigned[index] as { isNew: boolean }).isNew) {
      changes.added.push(question.id);
      statements.push(insertQuestion(db, deckId, question, now));
    } else {
      changes.kept.push(question.id);
      statements.push(updateQuestion(db, question, now));
    }
  }

  const named = new Set(questions.map((question) => question.id));
  for (const row of existing) {
    if (!named.has(row.id) && row.retired === 0) {
      changes.retired.push(row.id);
      statements.push(
        db.prepare('UPDATE questions SET retired = 1, updated_at = ? WHERE id = ?').bind(now, row.id),
      );
    }
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
    changes,
  };
}

/** A deck as Muse lists it. */
export interface DeckListEntry {
  id: string;
  name: string;
  class: string | null;
  updatedAt: number;
  /** The questions in play. */
  questionCount: number;
  /** The retired questions (hidden from play). */
  retiredCount: number;
}

/** Lists the decks that are not deleted (`GET /api/decks`). */
export async function listDecks(db: D1Database): Promise<DeckListEntry[]> {
  const rows = await db
    .prepare(
      `SELECT d.id, d.name, d.class_name, d.updated_at,
         (SELECT COUNT(*) FROM questions q WHERE q.deck_id = d.id AND q.retired = 0) AS active,
         (SELECT COUNT(*) FROM questions q WHERE q.deck_id = d.id AND q.retired = 1) AS retired
       FROM decks d
       WHERE d.deleted = 0
       ORDER BY d.name ASC, d.id ASC`,
    )
    .all<DeckRow & { active: number; retired: number }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    class: row.class_name,
    updatedAt: row.updated_at,
    questionCount: Number(row.active),
    retiredCount: Number(row.retired),
  }));
}

/** One deck with its questions (`GET /api/decks/:id`), `null` when unknown. */
export async function getDeck(
  db: D1Database,
  id: string,
  includeRetired: boolean,
): Promise<SyncDeck | null> {
  const row = await db
    .prepare('SELECT id, name, class_name, updated_at, deleted FROM decks WHERE id = ? AND deleted = 0')
    .bind(id)
    .first<DeckRow>();
  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    class: row.class_name,
    updatedAt: row.updated_at,
    deleted: false,
    questions: await readQuestions(db, row.id, includeRetired),
  };
}

/** Renames a deck and/or moves it to a class (`PATCH /api/decks/:id`). */
export async function patchDeck(
  db: D1Database,
  id: string,
  patch: { name?: string; class?: string | null },
  now: number = Date.now(),
): Promise<SyncDeck> {
  const deck = await getDeck(db, id, false);
  if (deck === null) {
    throw new DeckError(404, 'not_found', 'The deck does not exist.');
  }

  const name = patch.name === undefined ? deck.name : patch.name.trim();
  if (name === '') {
    throw new DeckError(400, 'invalid_deck', 'The deck needs a name.');
  }
  if (name !== deck.name) {
    const other = await db
      .prepare('SELECT id FROM decks WHERE name = ? AND id <> ? AND deleted = 0 LIMIT 1')
      .bind(name, id)
      .first<{ id: string }>();
    if (other !== null) {
      throw new DeckError(409, 'name_taken', `Another deck is already named "${name}".`);
    }
  }

  const className =
    patch.class === undefined ? deck.class : patch.class === null || patch.class.trim() === '' ? null : patch.class.trim();

  await db
    .prepare('UPDATE decks SET name = ?, class_name = ?, updated_at = ? WHERE id = ?')
    .bind(name, className, now, id)
    .run();

  return { ...deck, name, class: className, updatedAt: now };
}

/** The fields of one question that Muse sends (the deck format, one entry). */
export type QuestionBody = Record<string, unknown>;

/**
 * Adds one question at the end of a deck (`POST /api/decks/:id/questions`).
 *
 * A retired question with the same id (or, without an id, the same text)
 * comes back instead, with its progress.
 */
export async function addQuestion(
  db: D1Database,
  deckId: string,
  body: QuestionBody,
  now: number = Date.now(),
): Promise<{ question: DeckQuestion; restored: boolean }> {
  const deck = await getDeck(db, deckId, false);
  if (deck === null) {
    throw new DeckError(404, 'not_found', 'The deck does not exist.');
  }

  const card = readOneQuestion(body);
  const rows = await listMatchRows(db, deckId);
  const key = textKey(card.front);

  let target: MatchRow | undefined;
  if (card.id !== undefined) {
    if (!ID_PATTERN.test(card.id)) {
      throw new DeckError(400, 'invalid_question', 'The id must be 1-128 chars of [A-Za-z0-9_.:-].');
    }
    target = rows.find((row) => row.id === card.id);
    if (target === undefined) {
      const owner = await db.prepare('SELECT deck_id FROM questions WHERE id = ?').bind(card.id).first();
      if (owner !== null) {
        throw new DeckError(409, 'question_id_taken', `The id "${card.id}" belongs to another deck.`);
      }
    }
  } else {
    target = rows.find((row) => row.retired === 1 && textKey(row.question) === key);
  }

  if (target !== undefined && target.retired === 0) {
    throw new DeckError(409, 'question_exists', `The deck already has the question "${target.id}" (use PATCH).`);
  }
  if (card.id === undefined && rows.some((row) => row.retired === 0 && textKey(row.question) === key)) {
    throw new DeckError(409, 'question_exists', 'The deck already has this question (use PATCH).');
  }

  const max = await db
    .prepare('SELECT MAX(position) AS position FROM questions WHERE deck_id = ? AND retired = 0')
    .bind(deckId)
    .first<{ position: number | null }>();

  const question = toDeckQuestion(card, target?.id ?? card.id ?? makeId('q'), (max?.position ?? -1) + 1);

  await db.batch([
    target === undefined ? insertQuestion(db, deckId, question, now) : updateQuestion(db, question, now),
    touchDeck(db, deckId, now),
  ]);

  return { question, restored: target !== undefined };
}

/**
 * Edits one question (`PATCH /api/decks/:id/questions/:qid`).
 *
 * The id stays, so the progress of the player stays. The fields that the
 * body does not send keep their value; a retired question is restored.
 */
export async function editQuestion(
  db: D1Database,
  deckId: string,
  questionId: string,
  body: QuestionBody,
  now: number = Date.now(),
): Promise<DeckQuestion> {
  const deck = await getDeck(db, deckId, true);
  const current = deck?.questions.find((question) => question.id === questionId);
  if (deck === null || current === undefined) {
    throw new DeckError(404, 'not_found', 'The question is not in this deck.');
  }

  // A math question stays a math question (with its answers) unless the
  // body says otherwise; a body with `"type": "mc"` turns it back.
  const keepsMath = current.math !== undefined && body.type !== 'mc';
  const merged: QuestionBody = keepsMath
    ? {
        question: current.question,
        ...mathSpecToEntry(current.math as MathSpec),
        ...(body.answer !== undefined ? { answers: undefined } : {}),
        ...body,
      }
    : {
        question: current.question,
        ...(Array.isArray(body.answers) || body.type === 'math'
          ? {}
          : { correct: current.correct, wrong: current.wrong }),
        ...body,
      };
  if (merged.type === 'mc') {
    delete merged.type;
  }
  delete merged.id;
  const card = readOneQuestion(merged);

  const position = current.retired
    ? ((
        await db
          .prepare('SELECT MAX(position) AS position FROM questions WHERE deck_id = ? AND retired = 0')
          .bind(deckId)
          .first<{ position: number | null }>()
      )?.position ?? -1) + 1
    : current.position;

  const question = toDeckQuestion(card, questionId, position);

  await db.batch([updateQuestion(db, question, now), touchDeck(db, deckId, now)]);

  return question;
}

/** Retires one question (`DELETE /api/decks/:id/questions/:qid`). */
export async function retireQuestion(
  db: D1Database,
  deckId: string,
  questionId: string,
  now: number = Date.now(),
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT q.id FROM questions q JOIN decks d ON d.id = q.deck_id
       WHERE q.id = ? AND q.deck_id = ? AND d.deleted = 0`,
    )
    .bind(questionId, deckId)
    .first<{ id: string }>();
  if (row === null) {
    return false;
  }

  await db.batch([
    db.prepare('UPDATE questions SET retired = 1, updated_at = ? WHERE id = ?').bind(now, questionId),
    touchDeck(db, deckId, now),
  ]);
  return true;
}

/** Reads one question with the parser of the decks (the same rules). */
function readOneQuestion(body: QuestionBody): ImportCard {
  const parsed = parseDeck(JSON.stringify({ name: 'question', questions: [body] }), 'question');
  const card = parsed.cards[0];
  if (parsed.errors.length > 0 || card === undefined) {
    throw new DeckError(
      400,
      'invalid_question',
      (parsed.errors[0] ?? 'The question could not be read.').replace(/^Question 1: /, ''),
    );
  }
  return card;
}

/** The question of a deck that a parsed card makes. */
function toDeckQuestion(card: ImportCard, id: string, position: number): DeckQuestion {
  return {
    id,
    question: card.front,
    correct: card.back,
    wrong: [...card.wrong],
    position,
    selfGraded: card.math === undefined && card.wrong.length === 0,
    ...(card.math === undefined ? {} : { type: 'math' as const, math: card.math }),
  };
}

/** The statement that writes a new question. */
function insertQuestion(
  db: D1Database,
  deckId: string,
  question: DeckQuestion,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO questions (id, deck_id, position, question, correct, wrong_json, updated_at, retired, type, math_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      question.id,
      deckId,
      question.position,
      question.question,
      question.correct,
      JSON.stringify(question.wrong),
      now,
      question.type ?? 'mc',
      question.math === undefined ? null : JSON.stringify(question.math),
    );
}

/** The statement that rewrites a question that is already there (and restores it). */
function updateQuestion(db: D1Database, question: DeckQuestion, now: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE questions
       SET position = ?, question = ?, correct = ?, wrong_json = ?, updated_at = ?, retired = 0,
           type = ?, math_json = ?
       WHERE id = ?`,
    )
    .bind(
      question.position,
      question.question,
      question.correct,
      JSON.stringify(question.wrong),
      now,
      question.type ?? 'mc',
      question.math === undefined ? null : JSON.stringify(question.math),
      question.id,
    );
}

/** The statement that makes the sync send the deck again. */
function touchDeck(db: D1Database, deckId: string, now: number): D1PreparedStatement {
  return db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').bind(now, deckId);
}

/** The key two wordings of a question are compared with. */
function textKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Reads every question of a deck (retired ones too) for the matching. */
async function listMatchRows(db: D1Database, deckId: string): Promise<MatchRow[]> {
  const rows = await db
    .prepare('SELECT id, question, retired FROM questions WHERE deck_id = ? ORDER BY position ASC, id ASC')
    .bind(deckId)
    .all<MatchRow>();
  return rows.results ?? [];
}

/** Reads the questions of a deck, in their order. */
async function readQuestions(
  db: D1Database,
  deckId: string,
  includeRetired: boolean,
): Promise<DeckQuestion[]> {
  const rows = await db
    .prepare(
      `SELECT id, position, question, correct, wrong_json, retired, type, math_json
       FROM questions
       WHERE deck_id = ?${includeRetired ? '' : ' AND retired = 0'}
       ORDER BY retired ASC, position ASC, id ASC`,
    )
    .bind(deckId)
    .all<QuestionRow>();
  return toQuestions(rows.results ?? []);
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
export async function readDecksSince(
  db: D1Database,
  since: number,
  includeRetired = false,
): Promise<SyncDeck[]> {
  const decks = await db
    .prepare(
      `SELECT id, name, class_name, updated_at, deleted
       FROM decks
       WHERE updated_at > ?
       ORDER BY updated_at ASC, id ASC`,
    )
    .bind(since)
    .all<DeckRow>();

  const out: SyncDeck[] = [];
  for (const deck of decks.results ?? []) {
    out.push({
      id: deck.id,
      name: deck.name,
      class: deck.class_name,
      updatedAt: deck.updated_at,
      deleted: deck.deleted === 1,
      questions: deck.deleted === 1 ? [] : await readQuestions(db, deck.id, includeRetired),
    });
  }
  return out;
}

/** Finds the id of a deck by its name (`null` when there is none). */
async function findDeckIdByName(db: D1Database, name: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM decks WHERE name = ? ORDER BY deleted ASC, updated_at DESC LIMIT 1')
    .bind(name)
    .first<{ id: string }>();

  return row?.id ?? null;
}

/** Turns the rows of D1 into the questions of a deck. */
function toQuestions(rows: readonly QuestionRow[]): DeckQuestion[] {
  return rows.map((row) => {
    const wrong = readWrongAnswers(row.wrong_json);
    const math = row.type === 'math' ? parseStoredMathSpec(row.math_json) : undefined;

    return {
      id: row.id,
      question: row.question,
      correct: row.correct,
      wrong,
      position: row.position,
      selfGraded: math === undefined && wrong.length === 0,
      ...(row.retired === 1 ? { retired: true } : {}),
      ...(math === undefined ? {} : { type: 'math' as const, math }),
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
