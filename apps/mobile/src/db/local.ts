import * as SQLite from 'expo-sqlite';

import {
  applyTokenAdminAction,
  applyWalletChanges,
  createInitialState,
  localDayKey,
  parseStoredMathSpec,
  type CardState,
  type ImportCard,
  type LocalSyncState,
  type RemoteChanges,
  type State,
  type StudyCard,
  type SyncPlan,
} from '@study-app/core';

import {
  buyAndOpenPack,
  ensurePacksSchema,
  readLastSpin,
  sellAllDuplicatesLocal,
  sellDuplicates,
  spinDailyWheelLocal,
} from './packs';
import type {
  ImportDeckResult,
  LocalClass,
  LocalSet,
  LocalTopic,
  LocalStore,
  PendingReview,
} from './types';
import { ensureMasteryReset, ensureNormalModeUndo } from '@/study/masteryReset';
import { withOutbox } from '@/sync/outbox';
import { readCollection, readWallet, settleLocalSession, writeWallet } from './wallet';

export type { LocalClass, LocalSet, LocalTopic, PendingReview } from './types';

/** The name of the local (on device) SQLite database. */
export const LOCAL_DATABASE_NAME = 'study-app.db';

/**
 * The version of the local schema.
 *
 * The version lives in the `user_version` pragma of SQLite: it is bumped by
 * the migrations below, which run once, in a transaction, when the database
 * is opened.
 */
export const LOCAL_SCHEMA_VERSION = 5;

/**
 * The schema of the local database.
 *
 * `local_cards.choices_json` holds the **wrong answers of the card** (a JSON
 * array of strings): the choices of a question belong to the question, they
 * are never taken from the other cards of the deck. The options that are
 * shown to the player (the correct answer and the wrong ones, shuffled) are
 * built when the card is shown, they are not stored.
 *
 * The column `answer_index` is kept (the databases of the old versions used
 * it to point at the right answer inside `choices_json`); the migration
 * below empties it.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_topics (
  id    TEXT PRIMARY KEY NOT NULL,
  name  TEXT NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS local_sets (
  id         TEXT PRIMARY KEY NOT NULL,
  topic_id   TEXT,
  class_id   TEXT,
  title      TEXT NOT NULL,
  remote_id  TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS local_classes (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT,
  sort       INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS local_kv (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
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
  remote_id    TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  retired      INTEGER NOT NULL DEFAULT 0
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
    if (version < 3) {
      await migrateClasses(db);
    }
    if (version < 4) {
      await migrateRemoteIds(db);
    }
    if (version < 5) {
      // Migration 5: a question retired on the server stays (with its
      // progress) but is hidden from play.
      await addColumnIfMissing(db, 'local_cards', 'retired', 'INTEGER NOT NULL DEFAULT 0');
    }
    await db.execAsync(`PRAGMA user_version = ${LOCAL_SCHEMA_VERSION}`);
  });
}

/**
 * Migration 3: the classes of the player.
 *
 * The classes are a new table, the decks get a `class_id` and a tiny
 * key/value store holds the small things of the app (the update the player
 * dismissed, for instance).
 *
 * The migration never deletes anything: the decks of the player that had no
 * class simply have a `NULL` class, which is the "Unsorted" bucket.
 */
async function migrateClasses(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS local_classes (
      id         TEXT PRIMARY KEY NOT NULL,
      name       TEXT NOT NULL,
      color      TEXT,
      sort       INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_kv (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `);

  // The column is added only when it is missing: the migration runs on every
  // database that is older than the version 3, and it has to be idempotent.
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(local_sets)');
  const hasClassColumn = columns.some((column) => column.name === 'class_id');

  if (!hasClassColumn) {
    await db.execAsync('ALTER TABLE local_sets ADD COLUMN class_id TEXT');
  }
}

/**
 * Migration 4: the link between the local rows and the server rows.
 *
 * A deck or a question that came from the server remembers its remote id, so
 * the next sync updates the same local row (and keeps the scheduling state of
 * a question). The decks and the questions that the player imported locally
 * keep a `NULL` remote id and are never touched by the sync.
 *
 * The indexes are unique so two local rows can never point at the same server
 * row. The migration is idempotent: the columns are added only when they are
 * missing.
 */
async function migrateRemoteIds(db: SQLite.SQLiteDatabase): Promise<void> {
  await addColumnIfMissing(db, 'local_sets', 'class_id', 'TEXT');
  await addColumnIfMissing(db, 'local_sets', 'remote_id', 'TEXT');
  await addColumnIfMissing(db, 'local_cards', 'remote_id', 'TEXT');

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS local_sets_remote_id
      ON local_sets (remote_id) WHERE remote_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS local_cards_remote_id
      ON local_cards (remote_id) WHERE remote_id IS NOT NULL;
  `);
}

/** Adds a column to a table when it is not there yet. */
async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
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
  const raw = await openRawLocalStore();
  await ensureMasteryReset(raw);
  const store = withOutbox(raw);
  await ensureNormalModeUndo(store);
  return store;
}

/** The store without the sync outbox (the outbox itself writes through it). */
async function openRawLocalStore(): Promise<LocalStore> {
  const db = await openLocalDatabase();

  return {
    applyRemoteChanges: (changes, options) => applyLocalRemoteChanges(db, changes, options),
    listCards: () => listLocalCards(db),
    listCardStates: () => listLocalCardStates(db),
    listSets: () => listLocalSets(db),
    listTopics: () => listLocalTopics(db),
    listClasses: () => listLocalClasses(db),
    createClass: (name, color) => createLocalClass(db, name, color),
    renameClass: (id, name) => renameLocalClass(db, id, name),
    deleteClass: (id) => deleteLocalClass(db, id),
    assignDeckToClass: (setId, classId) => assignLocalDeckToClass(db, setId, classId),
    importDeck: (name, cards, classId) => importLocalDeck(db, name, cards, classId),
    deleteDeck: (setId) => deleteLocalDeck(db, setId),
    upsertCardState: (state) => upsertLocalCardState(db, state),
    enqueueReview: (review) => enqueueReview(db, review),
    readSyncState: () => readLocalSyncState(db),
    applySyncPlan: (plan) => applyLocalSyncPlan(db, plan),
    readKv: (key) => readLocalKv(db, key),
    writeKv: (key, value) => writeLocalKv(db, key, value),
    readWallet: (today) => readWallet(db, today),
    readCollection: () => readCollection(db),
    settleSession: (sessionId, mode, outcome, today, now, sync) =>
      settleLocalSession(db, sessionId, mode, outcome, today, now, sync),
    readLastSpin: () => readLastSpin(db),
    buyAndOpenPack: (packId, options) => buyAndOpenPack(db, packId, options),
    sellDuplicates: (critterId, qty, now) => sellDuplicates(db, critterId, qty, now),
    sellAllDuplicates: (now) => sellAllDuplicatesLocal(db, now),
    spinDailyWheel: (today, options) => spinDailyWheelLocal(db, today, options),
    clearCollection: () => clearLocalCollection(db),
    resetTokens: () => resetLocalTokens(db),
    addTokens: (amount) => addLocalTokens(db, amount),
    addPackTickets: (amount) => addLocalPackTickets(db, amount),
    resetSpinCooldown: () => resetLocalSpinCooldown(db),
    resetScheduling: async () => {
      await db.execAsync('DELETE FROM local_card_state; DELETE FROM outbox;');
    },
  };
}

/** Reads every locally known card. */
export async function listLocalCards(db: SQLite.SQLiteDatabase): Promise<StudyCard[]> {
  const rows = await db.getAllAsync<LocalCardRow>(
    'SELECT id, set_id, topic_id, type, front, back, choices_json, answer_index FROM local_cards WHERE retired = 0 ORDER BY id ASC',
  );

  return rows.map((row) => {
    // A math question keeps its spec (`{ math }`) in `choices_json`: an
    // older app reads it as a self-graded card.
    const math = row.type === 'math' ? parseStoredMathSpec(row.choices_json) : undefined;
    return {
      id: row.id,
      setId: row.set_id,
      topicId: row.topic_id,
      type: row.type,
      front: row.front,
      back: row.back,
      // `choices_json` holds the wrong answers of the card (the options
      // themselves are built when the card is shown).
      wrong: math === undefined ? readWrongAnswers(row.choices_json) : [],
      answerIndex: row.answer_index ?? undefined,
      ...(math === undefined ? {} : { math }),
    };
  });
}

/**
 * What `choices_json` holds: the wrong answers of a card, or `{ math }` for
 * a math question (`null` for a self-graded card).
 */
function storedChoices(wrong: readonly string[], math: StudyCard['math']): string | null {
  if (math !== undefined) {
    return JSON.stringify({ math });
  }
  return wrong.length > 0 ? JSON.stringify(wrong) : null;
}

/**
 * Reads the wrong answers of a card.
 *
 * Broken data never breaks the app: a card without readable choices is a
 * self-graded card.
 */
function readWrongAnswers(choicesJson: string | null): string[] | undefined {
  if (choicesJson === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(choicesJson) as unknown;
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return undefined;
  }
}

/** Reads every locally known set, sorted by title. */
export async function listLocalSets(db: SQLite.SQLiteDatabase): Promise<LocalSet[]> {
  const rows = await db.getAllAsync<LocalSetRow>(
    'SELECT id, topic_id, class_id, title, remote_id FROM local_sets ORDER BY title ASC, id ASC',
  );

  return rows.map((row) => ({
    id: row.id,
    topicId: row.topic_id,
    classId: row.class_id,
    title: row.title,
    remoteId: row.remote_id,
  }));
}

/** Reads every class of the player, in the order of the picker. */
export async function listLocalClasses(db: SQLite.SQLiteDatabase): Promise<LocalClass[]> {
  const rows = await db.getAllAsync<LocalClassRow>(
    'SELECT id, name, color, sort, created_at FROM local_classes ORDER BY sort ASC, name ASC, id ASC',
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    sort: row.sort ?? 0,
    createdAt: row.created_at,
  }));
}

/**
 * Creates a class.
 *
 * The new class goes to the end of the picker. The decks of the player are
 * not touched: they stay where they are until the player moves them.
 */
export async function createLocalClass(
  db: SQLite.SQLiteDatabase,
  name: string,
  color: string | null = null,
  now: number = Date.now(),
): Promise<LocalClass> {
  const title = name.trim();
  const id = makeId('class');

  const row = await db.getFirstAsync<{ sort: number | null }>(
    'SELECT MAX(sort) AS sort FROM local_classes',
  );
  const sort = (row?.sort ?? 0) + 1;

  await db.runAsync(
    'INSERT INTO local_classes (id, name, color, sort, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    title,
    color,
    sort,
    now,
  );

  return { id, name: title, color, sort, createdAt: now };
}

/** Renames a class. */
export async function renameLocalClass(
  db: SQLite.SQLiteDatabase,
  id: string,
  name: string,
): Promise<void> {
  await db.runAsync('UPDATE local_classes SET name = ? WHERE id = ?', name.trim(), id);
}

/**
 * Deletes a class.
 *
 * The decks of the class are never deleted: they go back to the "Unsorted"
 * bucket, so the player never loses a question by removing a class.
 */
export async function deleteLocalClass(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE local_sets SET class_id = NULL WHERE class_id = ?', id);
    await db.runAsync('DELETE FROM local_classes WHERE id = ?', id);
  });
}

/**
 * Moves a deck to a class.
 *
 * `null` sends the deck back to the "Unsorted" bucket.
 */
export async function assignLocalDeckToClass(
  db: SQLite.SQLiteDatabase,
  setId: string,
  classId: string | null,
): Promise<void> {
  await db.runAsync('UPDATE local_sets SET class_id = ? WHERE id = ?', classId, setId);
}

/** Reads a value of the key/value store (`null` when the key is unknown). */
export async function readLocalKv(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM local_kv WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

/** Writes a value in the key/value store. */
export async function writeLocalKv(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
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
  classId: string | null = null,
  now: number = Date.now(),
): Promise<ImportDeckResult> {
  const title = name.trim();

  if (title === '') {
    return { ok: false, setId: null, topicId: null, classId: null, cards: 0, message: 'The deck needs a name.' };
  }

  if (cards.length === 0) {
    return { ok: false, setId: null, topicId: null, classId: null, cards: 0, message: 'The deck has no questions.' };
  }

  const setId = makeId('set');

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO local_sets (id, topic_id, class_id, title, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      setId,
      null,
      classId,
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
        card.math === undefined ? 'mc' : 'math',
        card.front,
        card.back,
        storedChoices(card.wrong, card.math),
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

  return { ok: true, setId, topicId: null, classId, cards: cards.length, message: null };
}

/**
 * Removes every critter from the collection.
 *
 * The wallet and the decks are not touched: this is the "start the collection
 * over" button of the hidden admin panel.
 */
export async function clearLocalCollection(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM collection');
}

/** Sets the token balance to zero. */
export async function resetLocalTokens(db: SQLite.SQLiteDatabase): Promise<void> {
  const today = localDayKey(new Date());
  const wallet = await readWallet(db, today);
  await writeWallet(db, applyTokenAdminAction(wallet, 'reset'));
}

/** Adds tokens to the wallet (the developer's gift). */
export async function addLocalTokens(
  db: SQLite.SQLiteDatabase,
  amount: number,
): Promise<void> {
  const today = localDayKey(new Date());
  const wallet = await readWallet(db, today);
  await writeWallet(db, applyTokenAdminAction(wallet, 'grant', amount));
}

/** Adds pack tickets to the wallet (a milestone reward). */
export async function addLocalPackTickets(
  db: SQLite.SQLiteDatabase,
  amount: number,
): Promise<void> {
  const wallet = await readWallet(db, localDayKey(new Date()));
  await writeWallet(db, { ...wallet, packTickets: wallet.packTickets + Math.max(0, Math.floor(amount)) });
}

/** Forgets the daily spins, so the wheel can be spun again. */
export async function resetLocalSpinCooldown(db: SQLite.SQLiteDatabase): Promise<void> {
  await ensurePacksSchema(db);
  await db.runAsync('DELETE FROM daily_spins');
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

/**
 * Reads the part of the local store that the merge of the server decks needs:
 * the classes, the decks and the questions with their remote ids.
 */
export async function readLocalSyncState(db: SQLite.SQLiteDatabase): Promise<LocalSyncState> {
  const [classes, sets, cards] = await Promise.all([
    db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM local_classes'),
    db.getAllAsync<{ id: string; remote_id: string | null; title: string }>(
      'SELECT id, remote_id, title FROM local_sets',
    ),
    db.getAllAsync<{ id: string; remote_id: string | null; set_id: string }>(
      'SELECT id, remote_id, set_id FROM local_cards',
    ),
  ]);

  return {
    classes: classes.map((entry) => ({ id: entry.id, name: entry.name })),
    decks: sets.map((entry) => ({
      id: entry.id,
      remoteId: entry.remote_id,
      title: entry.title,
    })),
    questions: cards.map((entry) => ({
      id: entry.id,
      remoteId: entry.remote_id,
      setId: entry.set_id,
    })),
  };
}

/**
 * Applies the plan of a server sync in one transaction.
 *
 * The classes are created first, then the decks and their questions are
 * upserted, and finally the rows that left the server are dropped. A question
 * that is already there keeps its scheduling state: only its text and its
 * answers are refreshed.
 */
export async function applyLocalSyncPlan(
  db: SQLite.SQLiteDatabase,
  plan: SyncPlan,
  now: number = Date.now(),
): Promise<void> {
  await db.withTransactionAsync(async () => {
    let sort = await nextClassSort(db);

    for (const entry of plan.classes) {
      await db.runAsync(
        'INSERT INTO local_classes (id, name, color, sort, created_at) VALUES (?, ?, NULL, ?, ?)',
        entry.id,
        entry.name,
        sort,
        now,
      );
      sort += 1;
    }

    for (const deck of plan.decks) {
      if (deck.created) {
        await db.runAsync(
          `INSERT INTO local_sets (id, topic_id, class_id, title, remote_id, updated_at)
           VALUES (?, NULL, ?, ?, ?, ?)`,
          deck.localId,
          deck.classId,
          deck.title,
          deck.remoteId,
          deck.updatedAt,
        );
      } else {
        await db.runAsync(
          `UPDATE local_sets
           SET title = ?, class_id = ?, remote_id = ?, updated_at = ?
           WHERE id = ?`,
          deck.title,
          deck.classId,
          deck.remoteId,
          deck.updatedAt,
          deck.localId,
        );
      }

      for (const question of deck.questions) {
        const choices = storedChoices(question.wrong, question.math);
        const type = question.math === undefined ? 'mc' : 'math';

        if (question.created) {
          await db.runAsync(
            `INSERT INTO local_cards
               (id, set_id, topic_id, type, front, back, choices_json, answer_index, remote_id, created_at, updated_at, retired)
             VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
            question.localId,
            deck.localId,
            type,
            question.question,
            question.correct,
            choices,
            question.remoteId,
            now,
            now,
            question.retired ? 1 : 0,
          );

          // A progress row left behind by a question that was deleted earlier
          // (same id) is replaced by the fresh one.
          const state = createInitialState(question.localId, new Date(now));
          await db.runAsync(
            `INSERT OR REPLACE INTO local_card_state
               (card_id, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
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
        } else {
          await db.runAsync(
            `UPDATE local_cards
             SET set_id = ?, type = ?, front = ?, back = ?, choices_json = ?, remote_id = ?, updated_at = ?, retired = ?
             WHERE id = ?`,
            deck.localId,
            type,
            question.question,
            question.correct,
            choices,
            question.remoteId,
            now,
            question.retired ? 1 : 0,
            question.localId,
          );
        }
      }

      for (const questionId of deck.removedQuestionIds) {
        await deleteLocalQuestion(db, questionId);
      }
    }

    for (const deckId of plan.deletedDeckIds) {
      await db.runAsync(
        'DELETE FROM outbox WHERE card_id IN (SELECT id FROM local_cards WHERE set_id = ?)',
        deckId,
      );
      await db.runAsync(
        'DELETE FROM local_card_state WHERE card_id IN (SELECT id FROM local_cards WHERE set_id = ?)',
        deckId,
      );
      await db.runAsync('DELETE FROM local_cards WHERE set_id = ?', deckId);
      await db.runAsync('DELETE FROM local_sets WHERE id = ?', deckId);
    }
  });
}

/** The sort of the next class that the sync creates. */
async function nextClassSort(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ sort: number | null }>(
    'SELECT MAX(sort) AS sort FROM local_classes',
  );
  return (row?.sort ?? 0) + 1;
}

/** Deletes one question with its scheduling state and its pending review. */
async function deleteLocalQuestion(db: SQLite.SQLiteDatabase, questionId: string): Promise<void> {
  await db.runAsync('DELETE FROM outbox WHERE card_id = ?', questionId);
  await db.runAsync('DELETE FROM local_card_state WHERE card_id = ?', questionId);
  await db.runAsync('DELETE FROM local_cards WHERE id = ?', questionId);
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
    storedChoices(card.wrong ?? [], card.math),
    card.answerIndex ?? null,
    now,
    now,
  );
}

/** Applies a pull (docs/design/sync.md §5) without recording outbox events. */
async function applyLocalRemoteChanges(
  db: SQLite.SQLiteDatabase,
  changes: RemoteChanges,
  options: { adoptBaseline: boolean },
): Promise<{ parkedCardStates: CardState[] }> {
  const parkedCardStates: CardState[] = [];
  await ensurePacksSchema(db);
  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM local_cards');
    const known = new Set(rows.map((row) => row.id));
    for (const cardState of changes.cardStates) {
      if (known.has(cardState.cardId)) await upsertLocalCardState(db, cardState);
      else parkedCardStates.push(cardState);
    }
    const wallet = await readWallet(db, localDayKey(new Date()));
    const collection = await readCollection(db);
    const next = applyWalletChanges({ wallet, collection }, changes, options.adoptBaseline);
    await writeWallet(db, { ...wallet, balance: next.balance, packTickets: next.packTickets });
    for (const id of collection.keys()) {
      if (!next.collection.has(id)) {
        await db.runAsync('DELETE FROM collection WHERE critter_id = ?', id);
      }
    }
    for (const [id, count] of next.collection) {
      if (collection.get(id) === count) continue;
      await db.runAsync(
        `INSERT INTO collection (critter_id, count, first_caught_at) VALUES (?, ?, ?)
         ON CONFLICT(critter_id) DO UPDATE SET count = excluded.count`,
        id,
        count,
        Date.now(),
      );
    }
    for (const [key, value] of Object.entries(changes.kv)) {
      await writeLocalKv(db, key, value);
    }
    if (changes.lastSpin !== null) {
      await db.runAsync(
        'INSERT OR IGNORE INTO daily_spins (local_date, reward, spun_at) VALUES (?, ?, ?)',
        changes.lastSpin.localDate,
        changes.lastSpin.reward,
        Date.now(),
      );
    }
  });
  return { parkedCardStates };
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
  class_id: string | null;
  title: string;
  remote_id: string | null;
}

interface LocalClassRow {
  id: string;
  name: string;
  color: string | null;
  sort: number | null;
  created_at: number;
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
