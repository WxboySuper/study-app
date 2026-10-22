import type { Rng } from './fishing/roll';
import type { StateLookup } from './queue';
import type { CardState, StudyCard } from './types';

/**
 * The queue of a session.
 *
 * The queue decides *what* is asked and *in which order*. It is pure: the
 * state of the queue is a plain value and every function returns a new one,
 * so the whole thing can be tested without a renderer.
 *
 * The two modes of the game live here:
 *
 * - **mastery**: the session lasts until every question of the scope is
 *   mastered. A question is mastered when it was answered correctly twice
 *   in a row (once, when it was never missed). A missed question comes back
 *   a few questions later, so the player really learns it.
 * - **endless**: the session never ends by itself. The questions are picked
 *   with a weight: the ones that are due come first, then the ones with a
 *   weak memory, then the others. The same question is never asked twice in
 *   a row.
 */

/** How a session treats its questions. */
export type SessionMode = 'mastery' | 'endless';

/** One question of a session: a card and its scheduling state. */
export interface SessionQuestion {
  /** The id of the card. */
  id: string;
  /** The card itself. */
  card: StudyCard;
  /** The scheduling state of the card, when it has one. */
  state?: CardState;
}

/** What the session knows about one question. */
export interface MasteryRecord {
  /** How many correct answers in a row the question got. */
  correctStreak: number;
  /** `true` when the player missed the question at some point. */
  missed: boolean;
  /** `true` when the question is mastered. */
  mastered: boolean;
}

/** How the queue is built. */
export interface SessionQueueOptions {
  /** The questions of the scope, in any order. */
  questions: readonly SessionQuestion[];
  /** The mode of the session. */
  mode: SessionMode;
  /** The random source: it shuffles the questions and picks them. */
  rng: Rng;
  /** The time of the session (epoch milliseconds). Defaults to `Date.now()`. */
  now?: number;
  /** How many questions later a missed question comes back. Defaults to 3. */
  reinsertMin?: number;
  /** The most questions later a missed question comes back. Defaults to 5. */
  reinsertMax?: number;
  /** How many questions later a question that is not mastered yet comes back. */
  correctReinsertMin?: number;
  /** The most questions later a question that is not mastered yet comes back. */
  correctReinsertMax?: number;
  /** The stability (in days) under which a card counts as weak. */
  weakStabilityThreshold?: number;
}

/** The state of the queue of a session. */
export interface SessionQueueState {
  /** The mode of the session. */
  mode: SessionMode;
  /** Every question of the scope. */
  questions: readonly SessionQuestion[];
  /**
   * The questions that are still to be asked.
   *
   * In mastery mode it is the list of the questions that wait for their
   * turn (a missed question is put back into it). In endless mode it is the
   * pool of the session: every question is in it.
   */
  pending: readonly string[];
  /** What the session knows about every question. */
  records: Readonly<Record<string, MasteryRecord>>;
  /** The scheduling states of the questions (they change while the session runs). */
  states: Readonly<Record<string, CardState | undefined>>;
  /** The questions that were missed and not answered correctly since. */
  missedIds: readonly string[];
  /** The question that was asked last: it is never asked again right away. */
  lastAskedId: string | null;
  /** How many questions were asked. */
  asked: number;
  /** The random source of the session. */
  rng: Rng;
  /** The time of the session (epoch milliseconds). */
  now: number;
  /** How many questions later a missed question comes back. */
  reinsertMin: number;
  /** The most questions later a missed question comes back. */
  reinsertMax: number;
  /** How many questions later a question that is not mastered yet comes back. */
  correctReinsertMin: number;
  /** The most questions later a question that is not mastered yet comes back. */
  correctReinsertMax: number;
  /** The stability (in days) under which a card counts as weak. */
  weakStabilityThreshold: number;
}

/** How many questions later a missed question comes back. */
export const DEFAULT_REINSERT_MIN = 3;

/** The most questions later a missed question comes back. */
export const DEFAULT_REINSERT_MAX = 5;

/** How many questions later a question that is not mastered yet comes back. */
export const DEFAULT_CORRECT_REINSERT_MIN = 1;

/** The most questions later a question that is not mastered yet comes back. */
export const DEFAULT_CORRECT_REINSERT_MAX = 3;

/** The stability (in days) under which a card counts as weak. */
export const DEFAULT_WEAK_STABILITY = 7;

/**
 * The weight of the questions that are due.
 *
 * The weights of the tiers of the endless mode: the due questions come
 * first, then the ones that were missed, then the ones with a weak memory,
 * then the others.
 */
const WEIGHT_DUE = 8;
const WEIGHT_MISSED = 5;
const WEIGHT_WEAK = 3;
const WEIGHT_OTHER = 1;

/**
 * Creates the queue of a session.
 *
 * The questions are shuffled right away: the order of a session is never
 * the order of the deck.
 */
export function createSessionQueue(options: SessionQueueOptions): SessionQueueState {
  const questions = [...options.questions];
  const records: Record<string, MasteryRecord> = {};
  const states: Record<string, CardState | undefined> = {};

  for (const question of questions) {
    records[question.id] = { correctStreak: 0, missed: false, mastered: false };
    states[question.id] = question.state;
  }

  return {
    mode: options.mode,
    questions,
    pending: shuffle(questions.map((question) => question.id), options.rng),
    records,
    states,
    missedIds: [],
    lastAskedId: null,
    asked: 0,
    rng: options.rng,
    now: options.now ?? Date.now(),
    reinsertMin: options.reinsertMin ?? DEFAULT_REINSERT_MIN,
    reinsertMax: options.reinsertMax ?? DEFAULT_REINSERT_MAX,
    correctReinsertMin: options.correctReinsertMin ?? DEFAULT_CORRECT_REINSERT_MIN,
    correctReinsertMax: options.correctReinsertMax ?? DEFAULT_CORRECT_REINSERT_MAX,
    weakStabilityThreshold: options.weakStabilityThreshold ?? DEFAULT_WEAK_STABILITY,
  };
}

/**
 * Takes the next question of the session.
 *
 * In mastery mode the questions come in the order of the queue. In endless
 * mode they are picked with a weight: the due questions come first, then the
 * ones that were missed, then the ones with a weak memory, then the others.
 * The question that was asked last is never asked again right away.
 *
 * @return The question and the new state of the queue (`null` when the
 * session has nothing left to ask).
 */
export function nextSessionQuestion(state: SessionQueueState): {
  state: SessionQueueState;
  question: SessionQuestion | null;
} {
  if (state.mode === 'mastery') {
    const id = state.pending[0];
    if (id === undefined) {
      return { state, question: null };
    }

    return {
      state: {
        ...state,
        pending: state.pending.slice(1),
        lastAskedId: id,
        asked: state.asked + 1,
      },
      question: findQuestion(state, id),
    };
  }

  const picked = pickWeighted(state);
  if (picked === null) {
    return { state, question: null };
  }

  // The question goes to the end of the pool: it is not asked again right
  // away, but it stays in the session.
  const rest = state.pending.filter((id) => id !== picked);
  const pending = [...rest, picked];

  return {
    state: {
      ...state,
      pending,
      lastAskedId: picked,
      asked: state.asked + 1,
    },
    question: findQuestion(state, picked),
  };
}

/**
 * Records the answer of the player.
 *
 * In mastery mode a missed question comes back a few questions later (three
 * to five), and a question that was answered correctly but is not mastered
 * yet comes back too (one to three questions later). A question that is
 * mastered leaves the queue for good.
 *
 * @param state The state of the queue.
 * @param questionId The question that was answered.
 * @param correct `true` when the player answered right.
 * @param nextState The scheduling state of the card after the review.
 */
export function answerSessionQuestion(
  state: SessionQueueState,
  questionId: string,
  correct: boolean,
  nextState?: CardState,
): SessionQueueState {
  const record = state.records[questionId] ?? { correctStreak: 0, missed: false, mastered: false };

  const nextRecord: MasteryRecord = correct
    ? { ...record, correctStreak: record.correctStreak + 1 }
    : { ...record, correctStreak: 0, missed: true };

  // A question is mastered when it was answered correctly twice in a row
  // (once, when it was never missed).
  const needed = nextRecord.missed ? 2 : 1;
  const mastered = nextRecord.correctStreak >= needed;
  const finalRecord: MasteryRecord = { ...nextRecord, mastered };

  const records = { ...state.records, [questionId]: finalRecord };
  const states = { ...state.states, [questionId]: nextState ?? state.states[questionId] };

  // The questions that were missed and not answered correctly since are the
  // ones the player has to see again.
  const missedIds = correct
    ? state.missedIds.filter((id) => id !== questionId)
    : state.missedIds.includes(questionId)
      ? state.missedIds
      : [...state.missedIds, questionId];

  if (state.mode === 'endless') {
    return { ...state, records, states, missedIds };
  }

  // In mastery mode the question leaves the queue when it is mastered.
  if (mastered) {
    return {
      ...state,
      records,
      states,
      missedIds,
      pending: state.pending.filter((id) => id !== questionId),
    };
  }

  // The question comes back: a missed one waits three to five questions
  // (so the player really learns it), a correct one waits one to three.
  const distance = correct
    ? state.rng.int(state.correctReinsertMin, state.correctReinsertMax)
    : state.rng.int(state.reinsertMin, state.reinsertMax);

  return {
    ...state,
    records,
    states,
    missedIds,
    pending: insertAt(state.pending, questionId, distance),
  };
}

/**
 * Updates the scheduling states of the questions.
 *
 * The FSRS state of a card changes with every review: the endless mode
 * needs the fresh state to know what is due and what is weak.
 */
export function updateSessionStates(
  state: SessionQueueState,
  states: StateLookup,
): SessionQueueState {
  const next: Record<string, CardState | undefined> = { ...state.states };

  for (const question of state.questions) {
    const value = lookupState(states, question.id);
    if (value !== undefined) {
      next[question.id] = value;
    }
  }

  return { ...state, states: next };
}

/** How many questions of the scope are mastered. */
export function masteredCount(state: SessionQueueState): number {
  let count = 0;

  for (const record of Object.values(state.records)) {
    if (record.mastered) {
      count += 1;
    }
  }

  return count;
}

/** How many questions the scope holds. */
export function sessionTotal(state: SessionQueueState): number {
  return state.questions.length;
}

/**
 * `true` when the session has nothing left to do.
 *
 * Only the mastery mode can end by itself: the endless mode plays until the
 * player ends it.
 */
export function sessionComplete(state: SessionQueueState): boolean {
  if (state.mode === 'endless') {
    return false;
  }

  if (state.questions.length === 0) {
    return true;
  }

  return masteredCount(state) >= state.questions.length;
}

/**
 * How many questions are still to be asked.
 *
 * In the endless mode it is the number of questions the player does not
 * know yet (the ones that were never answered correctly).
 */
export function sessionRemaining(state: SessionQueueState): number {
  if (state.mode === 'mastery') {
    return state.pending.length;
  }

  let remaining = 0;

  for (const question of state.questions) {
    const record = state.records[question.id];
    if (record === undefined || record.correctStreak === 0) {
      remaining += 1;
    }
  }

  return remaining;
}

/**
 * Picks a question of the endless mode.
 *
 * The questions are sorted into four tiers (due, missed, weak, other) and a
 * tier is picked with a weight: the due questions come first. Inside a tier
 * the question is picked at random, so the session never plays the same
 * order twice.
 */
function pickWeighted(state: SessionQueueState): string | null {
  const pool = state.pending.length > 0 ? state.pending : state.questions.map((q) => q.id);
  if (pool.length === 0) {
    return null;
  }

  // The question that was asked last is not asked again right away (unless
  // it is the only one left).
  const candidates = pool.length > 1 ? pool.filter((id) => id !== state.lastAskedId) : pool;
  if (candidates.length === 0) {
    return null;
  }

  const tiers: { weight: number; ids: string[] }[] = [
    { weight: WEIGHT_DUE, ids: [] },
    { weight: WEIGHT_MISSED, ids: [] },
    { weight: WEIGHT_WEAK, ids: [] },
    { weight: WEIGHT_OTHER, ids: [] },
  ];

  for (const id of candidates) {
    const cardState = state.states[id];
    const due = cardState !== undefined && cardState.due <= state.now;
    const missed = state.missedIds.includes(id);
    const weak = cardState !== undefined && cardState.stability <= state.weakStabilityThreshold;

    if (due) {
      tiers[0]!.ids.push(id);
    } else if (missed) {
      tiers[1]!.ids.push(id);
    } else if (weak) {
      tiers[2]!.ids.push(id);
    } else {
      tiers[3]!.ids.push(id);
    }
  }

  // The tiers are sorted inside themselves, so the random pick is stable.
  for (const tier of tiers) {
    tier.ids.sort((a, b) => compareIds(a, b));
  }

  const groups = tiers.filter((tier) => tier.ids.length > 0);
  if (groups.length === 0) {
    return null;
  }

  const total = groups.reduce((sum, tier) => sum + tier.weight * tier.ids.length, 0);
  let roll = state.rng.next() * total;

  for (const tier of groups) {
    roll -= tier.weight * tier.ids.length;
    if (roll < 0) {
      const index = state.rng.int(0, tier.ids.length - 1);
      return tier.ids[index] ?? null;
    }
  }

  const last = groups[groups.length - 1];
  return last === undefined ? null : (last.ids[0] ?? null);
}

/** Finds a question by its id. */
function findQuestion(state: SessionQueueState, id: string): SessionQuestion | null {
  for (const question of state.questions) {
    if (question.id === id) {
      return question;
    }
  }
  return null;
}

/**
 * Puts a question back into the queue.
 *
 * The distance is the number of questions that are asked before it comes
 * back. A distance that is longer than the queue puts it at the end.
 */
function insertAt(pending: readonly string[], id: string, distance: number): string[] {
  const rest = pending.filter((entry) => entry !== id);
  const at = Math.max(0, Math.min(distance, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Shuffles a list (Fisher-Yates). */
function shuffle<T>(values: readonly T[], rng: Rng): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    const current = result[index];
    const swap = result[other];
    if (current !== undefined && swap !== undefined) {
      result[index] = swap;
      result[other] = current;
    }
  }

  return result;
}

function lookupState(states: StateLookup, cardId: string): CardState | undefined {
  if (states instanceof Map) {
    return states.get(cardId);
  }
  return (states as Readonly<Record<string, CardState | undefined>>)[cardId];
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
