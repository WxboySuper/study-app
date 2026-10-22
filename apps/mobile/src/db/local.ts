import * as SQLite from 'expo-sqlite';

import { createInitialState, type CardState, type ImportCard, type State, type StudyCard } from '@study-app/core';

import {
  buyAndOpenPack,
  readLastSpin,
  sellAllDuplicatesLocal,
  sellDuplicates,
  spinDailyWheelLocal,
} from './packs';
import type {
  ImportDeckResult,
  LocalSet,
  LocalTopic,
  LocalStore,
  PendingReview,
} from './types';
import { readCollection, readWallet, settleLocalSession } from './wallet';

export type { LocalSet, LocalTopic, PendingReview } from './types';

/** The name of the local (on device) SQLite database. */
export const LOCAL_DATABASE_NAME = 'study-app.db';

/**
 * The version of the local schema.
 *
 * The version lives in the `user_version` pragma of SQLite: it is bumped by
 * the migrations below, which run once, in a transaction, when the database
 * is opened.
 */
export const LOCAL_SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_topics (
  id    TEXT PRIMARY KEY NOT NULL,
  name  TEXT NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS local_sets (
  id         TEXT PRIMARY KEY NOT NULL,
  topic_id   TEXT,
  title      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS local_cards (
  id           TEXT PRIMARY KEY NOT NULL,
  set_id       TEXT NOT NULL,
  topic_id     TEXT,
  type         TEXT NOT NULL DEFAULT 'mc',
  front        TEXT NOT NULL,
  back         TEXT NOT NULL,
  choices_json TEXT,
  answer_index INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS local_card_state (
  card_id        TEXT PRIMARY KEY NOT NULL,
  due            INTEGER NOT NULL,
  stability      REAL NOT NULL DEFAULT 0,
  difficulty     REAL NOT NULL DEFAULT 0,
  elapsed_days   INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  state          INTEGER NOT NULL DEFAULT 0,
  last_review    INTEGER,
  FOREIGN KEY (card_id) REFERENCES local_cards (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outbox (
  client_id      TEXT PRIMARY KEY NOT NULL,
  card_id        TEXT NOT NULL,
  session_id     TEXT,
  rating         INTEGER NOT NULL,
  state          INTEGER NOT NULL,
  due            INTEGER NOT NULL,
  stability      REAL NOT NULL DEFAULT 0,
  difficulty     REAL NOT NULL DEFAULT 0,
  elapsed_days   INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  review         INTEGER NOT NULL,
  duration_ms    INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS outbox_created_at ON outbox (created_at);
`;

/**
 * Opens the local database and makes sure the schema exists.
 *
 * The local store holds the cards the player can study offline, their FSRS
 * state and the outbox of reviews that still have to be synced.
 */
export async function openLocalDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database === null) {
    database = SQLite.openDatabaseAsync(LOCAL_DATABASE_NAME).then(async (db) => {
      await db.execAsync(SCHEMA);
      await migrateLocalDatabase(db);
      return db;
    });
  }
  return database;
}

/**
 * Brings the local database up to date.
 *
 * The migrations run inside a transaction and are idempotent: a database
 * that is already up to date is left alone, and no user data is ever
 * deleted.
 */
async function migrateLocalDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const version = await readSchemaVersion(db);

  if (version >= LOCAL_SCHEMA_VERSION) {
    return;
  }

  await db.withTransactionAsync(async () => {
    if (version < 2) {
      await migrateChoicesToWrongAnswers(db);
    }
    await db.execAsync(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}`);
  });
}

/** The version of the local schema. */
async function readSchemaVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number | null }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Migration 2: the choices of a card belong to the card.
 *
 * Before this version, `choices_json` held the four options of the question
 * (the correct one included) and `answer_index` pointed at the right one.
 * Now `choices_json` holds only the wrong answers the author wrote, and
 * `answer_index` is not used anymore.
 *
 * The cards that had no choices keep their data and become self-graded
 * cards: nothing is deleted, every card stays in the game.
 */
async function migrateChoicesToWrongAnswers(db: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{
    id: string;
    back: string;
    choices_json: string | null;
    answer_index: number | null;
  }>('SELECT id, back, choices_json, answer_index FROM local_cards');

  for (const row of rows) {
    if (row.choices_json === null) {
      // A card without choices: it becomes a self-graded card.
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.choices_json);
    } catch {
      // Broken data: the card stays as it is (a self-graded card).
      continue;
    }

    if (!Array.isArray(parsed)) {
      continue;
    }

    const options = parsed.filter((value): value is string => typeof value === 'string');
    const index = row.answer_index;

    // The old format: every option, with the index of the right one.
    const wrong =
      index !== null && index >= 0 && index < options.length
        ? options.filter((_, position) => position !== index)
        : options.filter((option) => option !== row.back);

    await db.runAsync(
      'UPDATE local_cards SET choices_json = ?, answer_index = NULL WHERE id = ?',
      JSON.stringify(wrong),
      row.id,
    );
  }
}

/** The database of the app, opened once. */
let database: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens the local store of the app.
 *
 * On the phone the store is the SQLite database; on the web it is the
 * in-memory mock of `src/db/local.web.ts`. The screens only ever see the
 * {@link LocalStore} interface, so they do not care where the data lives.
 */
export async function openLocalStore(): Promise<LocalStore> {
  const db = await openLocalDatabase();

  return {
    listCards: () => listLocalCards(db),
    listCardStates: () => listLocalCardStates(db),
    listSets: () => listLocalSets(db),
    listTopics: () => listLocalTopics(db),
    importDeck: (name, cards) => importLocalDeck(db, name, cards),
    deleteDeck: (setId) => deleteLocalDeck(db, setId),
    upsertCardState: (state) => upsertLocalCardState(db, state),
    enqueueReview: (review) => enqueueReview(db, review),
    readWallet: (today) => readWallet(db, today),
    readCollection: () => readCollection(db),
    settleSession: (sessionId, mode, outcome, today, now, sync) =>
      settleLocalSession(db, sessionId, mode, outcome, today, now, sync),
    readLastSpin: () => readLastSpin(db),
    buyAndOpenPack: (packId, options) => buyAndOpenPack(db, packId, options),
    sellDuplicates: (critterId, qty, now) => sellDuplicates(db, critterId, qty, now),
    sellAllDuplicates: (now) => sellAllDuplicatesLocal(db, now),
    spinDailyWheel: (today, options) => spinDailyWheelLocal(db, today, options),
  };
}

/** Reads every locally known card. */
export async function listLocalCards(db: SQLite.SQLiteDatabase): Promise<StudyCard[]> {
  const rows = await db.getAllAsync<LocalCardRow>(
    'SELECT id, set_id, topic_id, type, front, back, choices_json, answer_index FROM local_cards ORDER BY id ASC',
  );

  return rows.map((row) => ({
    id: row.id,
    setId: row.set_id,
    topicId: row.topic_id,
    type: row.type,
    front: row.front,
    back: row.back,
    // `choices_json` holds the wrong answers of the card (the options
    // themselves are built when the card is shown).
    wrong: row.choices_json ? (JSON.parse(row.choices_json) as string[]) : undefined,
    answerIndex: row.answer_index ?? undefined,
  }));
}

/** Reads every locally known set, sorted by title. */
export async function listLocalSets(db: SQLite.SQLiteDatabase): Promise<LocalSet[]> {
  const rows = await db.getAllAsync<LocalSetRow>(
    'SELECT id, topic_id, title FROM local_sets ORDER BY title ASC, id ASC',
  );

  return rows.map((row) => ({
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
  }));
}

/** Reads every locally known topic, sorted by name. */
export async function listLocalTopics(db: SQLite.SQLiteDatabase): Promise<LocalTopic[]> {
  const rows = await db.getAllAsync<LocalTopicRow>(
    'SELECT id, name, color FROM local_topics ORDER BY name ASC, id ASC',
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
  }));
}

/** Inserts or updates a set. */
export async function upsertLocalSet(
  db: SQLite.SQLiteDatabase,
  set: LocalSet,
  now: number = Date.now(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_sets (id, topic_id, title, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       topic_id = excluded.topic_id,
       title = excluded.title,
       updated_at = excluded.updated_at`,
    set.id,
    set.topicId,
    set.title,
    now,
  );
}

/** Inserts or updates a topic. */
export async function upsertLocalTopic(db: SQLite.SQLiteDatabase, topic: LocalTopic): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_topics (id, name, color)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color`,
    topic.id,
    topic.name,
    topic.color,
  );
}

/**
 * Imports a deck: a new set, its cards and their fresh scheduling state.
 *
 * Everything happens in one transaction: the deck is either there with all of
 * its cards, or it is not there at all. Every card keeps its own wrong
 * answers (the cards without wrong answers are self-graded ones) and they
 * start as new cards, due right now.
 */
export async function importLocalDeck(
  db: SQLite.SQLiteDatabase,
  name: string,
  cards: readonly ImportCard[],
  now: number = Date.now(),
): Promise<ImportDeckResult> {
  const title = name.trim();

  if (title === '') {
    return { ok: false, setId: null, topicId: null, cards: 0, message: 'The deck needs a name.' };
  }

  if (cards.length === 0) {
    return { ok: false, setId: null, topicId: null, cards: 0, message: 'The deck has no cards.' };
  }

  const setId = makeId('set');

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO local_sets (id, topic_id, title, updated_at)
       VALUES (?, ?, ?, ?)`,
      setId,
      null,
      title,
      now,
    );

    for (const [index, card] of cards.entries()) {
      const cardId = `${setId}_card_${index + 1}`;

      await db.runAsync(
        `INSERT INTO local_cards (id, set_id, topic_id, type, front, back, choices_json, answer_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cardId,
        setId,
        null,
        'mc',
        card.front,
        card.back,
        card.wrong.length > 0 ? JSON.stringify(card.wrong) : null,
        null,
        now,
        now,
      );

      const state = createInitialState(cardId, new Date(now));
      await db.runAsync(
        `INSERT INTO local_card_state (card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        state.cardId,
        state.due,
        state.stability,
        state.difficulty,
        state.elapsedDays,
        state.scheduledDays,
        state.learningSteps ?? 0,
        state.reps,
        state.lapses,
        state.state,
        state.lastReview ?? null,
      );
    }
  });

  return { ok: true, setId, topicId: null, cards: cards.length, message: null };
}

/**
 * Deletes a deck with everything that belongs to it.
 *
 * The cards, their scheduling state and the reviews that still wait for the
 * server go away with the set, in one transaction.
 */
export async function deleteLocalDeck(
  db: SQLite.SQLiteDatabase,
  setId: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM outbox WHERE card_id IN (SELECT id FROM local_cards WHERE set_id = ?)',
      setId,
    );
    await db.runAsync(
      'DELETE FROM local_card_state WHERE card_id IN (SELECT id FROM local_cards WHERE set_id = ?)',
      setId,
    );
    await db.runAsync('DELETE FROM local_cards WHERE set_id = ?', setId);
    await db.runAsync('DELETE FROM local_sets WHERE id = ?', setId);
  });
}

/** A unique id for a new set. */
function makeId(prefix: string): string {
  const stamp = Date.now().toString(36);
  const noise = Math.floor(Math.random() * 1_000_000).toString(36);
  return `${prefix}_${stamp}_${noise}`;
}

/** Reads the scheduling state of every local card. */
export async function listLocalCardStates(
  db: SQLite.SQLiteDatabase,
): Promise<Map<string, CardState>> {
  const rows = await db.getAllAsync<LocalCardStateRow>(
    'SELECT card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review FROM local_card_state',
  );

  const states = new Map<string, CardState>();
  for (const row of rows) {
    states.set(row.card_id, {
      cardId: row.card_id,
      due: row.due,
      stability: row.stability,
      difficulty: row.difficulty,
      elapsedDays: row.elapsed_days,
      scheduledDays: row.scheduled_days,
      learningSteps: row.learning_steps,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state as State,
      lastReview: row.last_review ?? null,
    });
  }
  return states;
}

/** Inserts or updates a card. */
export async function upsertLocalCard(
  db: SQLite.SQLiteDatabase,
  card: StudyCard,
  now: number = Date.now(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_cards (id, set_id, topic_id, type, front, back, choices_json, answer_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       set_id = excluded.set_id,
       topic_id = excluded.topic_id,
       type = excluded.type,
       front = excluded.front,
       back = excluded.back,
       choices_json = excluded.choices_json,
       answer_index = excluded.answer_index,
       updated_at = excluded.updated_at`,
    card.id,
    card.setId,
    card.topicId ?? null,
    card.type,
    card.front,
    card.back,
    // The wrong answers of the card: the options are built when the card is
    // shown, they are never stored.
    card.wrong && card.wrong.length > 0 ? JSON.stringify(card.wrong) : null,
    card.answerIndex ?? null,
    now,
    now,
  );
}

/** Inserts or updates the scheduling state of a card. */
export async function upsertLocalCardState(
  db: SQLite.SQLiteDatabase,
  state: CardState,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_card_state (card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET
       due = excluded.due,
       stability = excluded.stability,
       difficulty = excluded.difficulty,
       elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days,
       learning_steps = excluded.learning_steps,
       reps = excluded.reps,
       lapses = excluded.lapses,
       state = excluded.state,
       last_review = excluded.last_review`,
    state.cardId,
    state.due,
    state.stability,
    state.difficulty,
    state.elapsedDays,
    state.scheduledDays,
    state.learningSteps ?? 0,
    state.reps,
    state.lapses,
    state.state,
    state.lastReview ?? null,
  );
}

/** Queues a review for the next sync. */
export async function enqueueReview(
  db: SQLite.SQLiteDatabase,
  review: PendingReview,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO outbox (client_id, card_id, session_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, review, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    review.clientId,
    review.cardId,
    review.sessionId,
    review.rating,
    review.state,
    review.due,
    review.stability,
    review.difficulty,
    review.elapsedDays,
    review.scheduledDays,
    review.learningSteps,
    review.review,
    review.durationMs,
    review.createdAt,
  );
}

/** Reads the reviews that still have to be synced, oldest first. */
export async function listOutbox(db: SQLite.SQLiteDatabase): Promise<PendingReview[]> {
  const rows = await db.getAllAsync<OutboxRow>(
    'SELECT client_id, card_id, session_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, review, duration_ms, created_at FROM outbox ORDER BY created_at ASC',
  );

  return rows.map((row) => ({
    clientId: row.client_id,
    cardId: row.card_id,
    sessionId: row.session_id,
    rating: row.rating,
    state: row.state,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    learningSteps: row.learning_steps,
    review: row.review,
    durationMs: row.duration_ms ?? null,
    createdAt: row.created_at,
  }));
}

/** Removes synced reviews from the outbox. */
export async function deleteOutboxEntries(
  db: SQLite.SQLiteDatabase,
  clientIds: readonly string[],
): Promise<void> {
  for (const clientId of clientIds) {
    await db.runAsync('DELETE FROM outbox WHERE client_id = ?', clientId);
  }
}

interface LocalCardRow {
  id: string;
  set_id: string;
  topic_id: string | null;
  type: string;
  front: string;
  back: string;
  choices_json: string | null;
  answer_index: number | null;
}

interface LocalSetRow {
  id: string;
  topic_id: string | null;
  title: string;
}

interface LocalTopicRow {
  id: string;
  name: string;
  color: string | null;
}

interface LocalCardStateRow {
  card_id: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
}

interface OutboxRow {
  client_id: string;
  card_id: string;
  session_id: string | null;
  rating: number;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: number;
  duration_ms: number | null;
  created_at: number;
}
