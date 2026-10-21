import * as SQLite from 'expo-sqlite';

import type { CardState, ReviewLogRecord, State, StudyCard } from '@study-app/core';

/** The name of the local (on device) SQLite database. */
export const LOCAL_DATABASE_NAME = 'study-app.db';

/** A review that is waiting to be synced to the server. */
export interface PendingReview extends ReviewLogRecord {
  /** Client generated id, makes the sync idempotent. */
  clientId: string;
  cardId: string;
  sessionId: string | null;
  durationMs: number | null;
  createdAt: number;
}

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
  const db = await SQLite.openDatabaseAsync(LOCAL_DATABASE_NAME);
  await db.execAsync(SCHEMA);
  return db;
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
    choices: row.choices_json ? (JSON.parse(row.choices_json) as string[]) : undefined,
    answerIndex: row.answer_index ?? undefined,
  }));
}

/** A set of the local store. */
export interface LocalSet {
  id: string;
  topicId: string | null;
  title: string;
}

/** A topic of the local store. */
export interface LocalTopic {
  id: string;
  name: string;
  color: string | null;
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
    card.choices ? JSON.stringify(card.choices) : null,
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
