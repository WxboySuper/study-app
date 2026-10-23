/**
 * The merge of the decks of the server with the local store.
 *
 * `GET /api/sync?since=<ms>` answers with every deck that changed after the
 * last sync. This module turns that answer into a plan the local store can
 * apply in one transaction: which decks and questions are new, which ones are
 * updated, which ones left and which classes have to be created.
 *
 * The merge is pure: it never touches SQLite and never fetches anything, so
 * the rules are tested in `packages/core/test/sync.test.ts`.
 */

import { parseStoredMathSpec, type MathSpec } from './mathQuestion';

/** A question as `GET /api/sync` answers it. */
export interface RemoteSyncQuestion {
  /** The id of the question on the server. */
  id: string;
  /** The question itself. */
  question: string;
  /** The correct answer. */
  correct: string;
  /** The wrong answers the author wrote (0 to 3). */
  wrong: string[];
  /** The order of the question inside its deck. */
  position: number;
  /** `true` when the question has no wrong answer of its own. */
  selfGraded: boolean;
  /** `true` when the question left the deck (hidden from play, progress kept). */
  retired: boolean;
  /** The math part of a math question (`type: 'math'` in the answer). */
  math?: MathSpec;
}

/** A deck as `GET /api/sync` answers it. */
export interface RemoteSyncDeck {
  /** The id of the deck on the server. */
  id: string;
  /** The name of the deck. */
  name: string;
  /** The name of the class of the deck (`null` when it has none). */
  class: string | null;
  /** When the deck changed (epoch milliseconds). */
  updatedAt: number;
  /** `true` when the deck is deleted (a tombstone). */
  deleted: boolean;
  /** The questions of the deck (empty for a tombstone). */
  questions: RemoteSyncQuestion[];
}

/** The answer of `GET /api/sync`. */
export interface RemoteSyncSnapshot {
  /** The moment of the answer (epoch milliseconds). */
  now: number;
  /** The decks that changed. */
  decks: RemoteSyncDeck[];
}

/** A class of the local store, as the merge sees it. */
export interface LocalSyncClass {
  id: string;
  name: string;
}

/** A deck of the local store, as the merge sees it. */
export interface LocalSyncDeck {
  id: string;
  /** The id of the deck on the server (`null` for an imported deck). */
  remoteId: string | null;
  title: string;
}

/** A question of the local store, as the merge sees it. */
export interface LocalSyncQuestion {
  id: string;
  /** The id of the question on the server (`null` for an imported one). */
  remoteId: string | null;
  /** The local deck that owns the question. */
  setId: string;
}

/** Everything the merge needs to know about the local store. */
export interface LocalSyncState {
  classes: LocalSyncClass[];
  decks: LocalSyncDeck[];
  questions: LocalSyncQuestion[];
}

/** A class that the merge creates. */
export interface PlannedClass {
  id: string;
  name: string;
}

/** A question that the merge writes. */
export interface PlannedQuestion {
  localId: string;
  remoteId: string;
  setId: string;
  position: number;
  question: string;
  correct: string;
  wrong: string[];
  /** `true` when the local store has to create the card (and its state). */
  created: boolean;
  /** The question left the deck on the server: hidden from play, progress kept. */
  retired: boolean;
  /** The math part of a math question. */
  math?: MathSpec;
}

/** A deck that the merge writes. */
export interface PlannedDeck {
  localId: string;
  remoteId: string;
  title: string;
  classId: string | null;
  updatedAt: number;
  /** `true` when the local store has to create the deck). */
  created: boolean;
  questions: PlannedQuestion[];
  /** The local questions that left the server (they are deleted locally). */
  removedQuestionIds: string[];
}

/** The plan the local store applies in one transaction. */
export interface SyncPlan {
  /** The cursor of the next sync (the server time of the answer). */
  cursor: number;
  /** The classes that have to be created before the decks. */
  classes: PlannedClass[];
  /** The decks to upsert. */
  decks: PlannedDeck[];
  /** The local ids of the decks that the server deleted. */
  deletedDeckIds: string[];
}

/** The id makers of a plan (the tests and the app can give their own). */
export interface SyncPlanOptions {
  /** The id of a new local deck. */
  makeDeckId?: (remoteId: string) => string;
  /** The id of a new local question. */
  makeQuestionId?: (deckId: string, remoteId: string) => string;
  /** The id of a new local class. */
  makeClassId?: (name: string) => string;
}

/**
 * Reads the answer of `GET /api/sync`.
 *
 * A broken answer is `null` (the sync says nothing). A broken deck is
 * skipped, so one bad row never stops the whole sync.
 */
export function parseSyncSnapshot(payload: unknown): RemoteSyncSnapshot | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const answer = payload as { now?: unknown; decks?: unknown };
  if (typeof answer.now !== 'number' || !Number.isFinite(answer.now)) {
    return null;
  }

  if (!Array.isArray(answer.decks)) {
    return null;
  }

  const decks: RemoteSyncDeck[] = [];
  for (const entry of answer.decks) {
    const deck = parseSyncDeck(entry);
    if (deck !== null) {
      decks.push(deck);
    }
  }

  return { now: answer.now, decks };
}

/** Reads one deck of the answer (`null` when it cannot be read). */
function parseSyncDeck(payload: unknown): RemoteSyncDeck | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const deck = payload as {
    id?: unknown;
    name?: unknown;
    class?: unknown;
    updatedAt?: unknown;
    deleted?: unknown;
    questions?: unknown;
  };

  if (
    typeof deck.id !== 'string' ||
    deck.id.trim() === '' ||
    typeof deck.name !== 'string' ||
    typeof deck.updatedAt !== 'number' ||
    !Number.isFinite(deck.updatedAt) ||
    typeof deck.deleted !== 'boolean'
  ) {
    return null;
  }

  const questions: RemoteSyncQuestion[] = [];
  if (Array.isArray(deck.questions)) {
    for (const entry of deck.questions) {
      const question = parseSyncQuestion(entry);
      if (question !== null) {
        questions.push(question);
      }
    }
  }

  return {
    id: deck.id,
    name: deck.name,
    class: typeof deck.class === 'string' && deck.class.trim() !== '' ? deck.class.trim() : null,
    updatedAt: deck.updatedAt,
    deleted: deck.deleted,
    questions: deck.deleted ? [] : questions,
  };
}

/** Reads one question of the answer (`null` when it cannot be read). */
function parseSyncQuestion(payload: unknown): RemoteSyncQuestion | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const question = payload as {
    id?: unknown;
    question?: unknown;
    correct?: unknown;
    wrong?: unknown;
    position?: unknown;
    selfGraded?: unknown;
    retired?: unknown;
    type?: unknown;
    math?: unknown;
  };

  if (
    typeof question.id !== 'string' ||
    question.id.trim() === '' ||
    typeof question.question !== 'string' ||
    typeof question.correct !== 'string' ||
    typeof question.position !== 'number' ||
    !Number.isFinite(question.position)
  ) {
    return null;
  }

  const wrong = Array.isArray(question.wrong)
    ? question.wrong.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    id: question.id,
    question: question.question,
    correct: question.correct,
    wrong,
    position: question.position,
    selfGraded: typeof question.selfGraded === 'boolean' ? question.selfGraded : wrong.length === 0,
    retired: question.retired === true,
    ...withMath(question.type === 'math' ? parseStoredMathSpec(question.math) : undefined),
  };
}

/** The `math` field of a question, only when there is one. */
function withMath(math: MathSpec | undefined): { math?: MathSpec } {
  return math === undefined ? {} : { math };
}

/**
 * Plans the merge of the server decks into the local store.
 *
 * The decks are matched by their `remoteId` (a deck the player imported
 * locally is never overwritten: it becomes a second deck). The questions are
 * matched by their `remoteId`, so the scheduling state of a question survives
 * an update of its text. A class is found by its name (case insensitive) and
 * created when it is missing. A tombstone deletes the local deck.
 */
export function planDeckSync(
  local: LocalSyncState,
  remote: RemoteSyncSnapshot,
  options: SyncPlanOptions = {},
): SyncPlan {
  const makeDeckId = options.makeDeckId ?? defaultDeckId;
  const makeQuestionId = options.makeQuestionId ?? defaultQuestionId;
  const makeClassId = options.makeClassId ?? defaultClassId;

  const usedDeckIds = new Set(local.decks.map((deck) => deck.id));
  const usedQuestionIds = new Set(local.questions.map((question) => question.id));
  const usedClassIds = new Set(local.classes.map((entry) => entry.id));

  const classByName = new Map<string, string>();
  for (const entry of local.classes) {
    classByName.set(normalizeClassName(entry.name), entry.id);
  }

  const localDeckByRemote = new Map<string, LocalSyncDeck>();
  for (const deck of local.decks) {
    if (deck.remoteId !== null) {
      localDeckByRemote.set(deck.remoteId, deck);
    }
  }

  const localQuestionByRemote = new Map<string, LocalSyncQuestion>();
  for (const question of local.questions) {
    if (question.remoteId !== null) {
      localQuestionByRemote.set(question.remoteId, question);
    }
  }

  const localQuestionsByDeck = new Map<string, LocalSyncQuestion[]>();
  for (const question of local.questions) {
    const list = localQuestionsByDeck.get(question.setId);
    if (list === undefined) {
      localQuestionsByDeck.set(question.setId, [question]);
    } else {
      list.push(question);
    }
  }

  const classes: PlannedClass[] = [];
  const decks: PlannedDeck[] = [];
  const deletedDeckIds: string[] = [];
  let cursor = Number.isFinite(remote.now) ? remote.now : 0;

  for (const remoteDeck of remote.decks) {
    cursor = Math.max(cursor, remoteDeck.updatedAt);

    const knownDeck = localDeckByRemote.get(remoteDeck.id);

    if (remoteDeck.deleted) {
      if (knownDeck !== undefined) {
        deletedDeckIds.push(knownDeck.id);
      }
      continue;
    }

    const classId = resolveClass(
      remoteDeck.class,
      classByName,
      usedClassIds,
      makeClassId,
      classes,
    );

    const deckId =
      knownDeck?.id ?? uniqueId(makeDeckId(remoteDeck.id), usedDeckIds);
    const title = remoteDeck.name.trim() === '' ? remoteDeck.id : remoteDeck.name.trim();

    const knownQuestions = localQuestionsByDeck.get(deckId) ?? [];
    const remoteQuestionIds = new Set<string>();
    const questions: PlannedQuestion[] = [];

    const ordered = [...remoteDeck.questions].sort((left, right) => left.position - right.position);

    for (const remoteQuestion of ordered) {
      remoteQuestionIds.add(remoteQuestion.id);

      const knownQuestion = localQuestionByRemote.get(remoteQuestion.id);
      const questionId =
        knownQuestion?.id ??
        uniqueId(makeQuestionId(deckId, remoteQuestion.id), usedQuestionIds);

      questions.push({
        localId: questionId,
        remoteId: remoteQuestion.id,
        setId: deckId,
        position: remoteQuestion.position,
        question: remoteQuestion.question,
        correct: remoteQuestion.correct,
        wrong: [...remoteQuestion.wrong],
        created: knownQuestion === undefined,
        retired: remoteQuestion.retired,
        ...withMath(remoteQuestion.math),
      });
    }

    const removedQuestionIds: string[] = [];
    if (knownDeck !== undefined) {
      for (const question of knownQuestions) {
        if (question.remoteId !== null && !remoteQuestionIds.has(question.remoteId)) {
          removedQuestionIds.push(question.id);
        }
      }
    }

    decks.push({
      localId: deckId,
      remoteId: remoteDeck.id,
      title,
      classId,
      updatedAt: remoteDeck.updatedAt,
      created: knownDeck === undefined,
      questions,
      removedQuestionIds,
    });
  }

  return { cursor, classes, decks, deletedDeckIds };
}

/**
 * Resolves the class of a deck by its name.
 *
 * A class is created once per plan: two decks of the same class share the
 * same local class, even when their names differ in case or in spaces.
 */
function resolveClass(
  name: string | null,
  classByName: Map<string, string>,
  usedClassIds: Set<string>,
  makeClassId: (name: string) => string,
  classes: PlannedClass[],
): string | null {
  if (name === null) {
    return null;
  }

  const title = name.trim();
  if (title === '') {
    return null;
  }

  const key = normalizeClassName(title);
  const known = classByName.get(key);
  if (known !== undefined) {
    return known;
  }

  const id = uniqueId(makeClassId(title), usedClassIds);
  classByName.set(key, id);
  classes.push({ id, name: title });
  return id;
}

/** The key that makes two class names the same class. */
function normalizeClassName(name: string): string {
  return name.trim().toLowerCase();
}

/** Makes an id unique inside the local store. */
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;

  while (used.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }

  used.add(id);
  return id;
}

/** The id of a new local deck. */
function defaultDeckId(remoteId: string): string {
  return `set_sync_${remoteId}`;
}

/** The id of a new local question. */
function defaultQuestionId(deckId: string, remoteId: string): string {
  return `${deckId}_card_${remoteId}`;
}

/** The id of a new local class. */
function defaultClassId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `class_sync_${slug === '' ? 'class' : slug}`;
}
