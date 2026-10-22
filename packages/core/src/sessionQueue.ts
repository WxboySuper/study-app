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
 *   mastered. Every question needs the same number of right answers
 *   ({@link MASTERY_REQUIRED_CORRECT}) and a miss throws the streak of the
 *   question away. The right answers are spread out: a question that was
 *   just answered is not asked again before {@link MASTERY_MIN_GAP} other
 *   questions (the gap shrinks with the deck, a deck of a single question
 *   has no other choice).
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
  /**
   * How many correct answers in a row the question got.
   *
   * A miss puts it back to zero: the question has to be learned again
   * from the start.
   */
  correctStreak: number;
  /** `true` when the player missed the question at some point. */
  missed: boolean;
  /** `true` when the question is mastered. */
  mastered: boolean;
}

/**
 * How many right answers in a row a question needs to be mastered.
 *
 * Every question of the scope needs the same number: a missed question is
 * not harder than the others, it only has to be learned again.
 */
export const MASTERY_REQUIRED_CORRECT = 3;

/**
 * How many questions are asked between two serves of the same question.
 *
 * The right answers of a question are spread out: the player reads (and
 * thinks about) the other questions in between, so a question is not asked
 * again right after it was answered. The gap is clamped by the size of the
 * deck: a deck that holds fewer questions than the gap cannot wait that
 * long.
 */
export const MASTERY_MIN_GAP = 3;

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
  /**
   * How many right answers in a row a question needs to be mastered.
   * Defaults to {@link MASTERY_REQUIRED_CORRECT}.
   */
  masteryRequired?: number;
  /**
   * How many questions are asked between two serves of the same question.
   * Defaults to {@link MASTERY_MIN_GAP}.
   */
  minGap?: number;
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
  /** How many right answers in a row a question needs to be mastered. */
  masteryRequired: number;
  /** How many questions are asked between two serves of the same question. */
  minGap: number;
  /** The stability (in days) under which a card counts as weak. */
  weakStabilityThreshold: number;
}

/** How many questions later a missed question comes back. */
export const DEFAULT_REINSERT_MIN = 3;

/** The most questions later a missed question comes back. */
export const DEFAULT_REINSERT_MAX = 5;

/** How many questions later a question that is not mastered yet comes back. */
export const DEFAULT_CORRECT_REINSERT_MIN = 1;

/**
 * The most questions later a question that is not mastered yet comes back.
 *
 * The gap ({@link MASTERY_MIN_GAP}) is the floor of the distance, so the
 * real distance is never under it.
 */
export const DEFAULT_CORRECT_REINSERT_MAX = 5;

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
    masteryRequired: toCount(options.masteryRequired, MASTERY_REQUIRED_CORRECT, 1),
    minGap: toCount(options.minGap, MASTERY_MIN_GAP, 0),
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
    const id = takeNextMastery(state);
    if (id === undefined) {
      return { state, question: null };
    }

    return {
      state: {
        ...state,
        pending: state.pending.filter((entry) => entry !== id),
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
 * In mastery mode every question needs the same number of right answers
 * ({@link MASTERY_REQUIRED_CORRECT}) to be mastered, and a miss throws the
 * streak of the question away. A question that is not mastered yet comes
 * back a few questions later: a missed one waits three to five questions
 * (so the player really learns it), a correct one waits at least the gap
 * ({@link MASTERY_MIN_GAP}) so the right answers are spread out. A question
 * that is mastered leaves the queue for good.
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

  // Every question needs the same number of right answers in a row: a miss
  // puts the streak of the question back to zero, so it has to be learned
  // again from the start.
  const mastered = nextRecord.correctStreak >= state.masteryRequired;
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
  // (so the player really learns it), a correct one waits at least the gap
  // (so the right answers of a question are spread out).
  const gap = gapOf(state);
  const distance = correct
    ? Math.max(gap, state.rng.int(state.correctReinsertMin, state.correctReinsertMax))
    : Math.max(gap, state.rng.int(state.reinsertMin, state.reinsertMax));

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
 * The progress of one question of the scope.
 *
 * It is what the mastery view draws: a dot per right answer of the question
 * and the number of right answers it still needs.
 */
export interface MasteryProgress {
  /** The id of the question. */
  id: string;
  /**
   * How many right answers the question has in a row.
   *
   * It is the number of filled dots of the question, and it never goes over
   * the number of right answers the question needs.
   */
  correct: number;
  /** How many right answers in a row the question needs to be mastered. */
  required: number;
  /** `true` when the question is mastered. */
  mastered: boolean;
}

/**
 * The progress of every question of the scope.
 *
 * The mastery view shows "3/12 mastered" and one dot per right answer of
 * every question (the dots of a question that was missed are empty again).
 */
export function masteryProgress(state: SessionQueueState): MasteryProgress[] {
  return state.questions.map((question) => {
    const record = state.records[question.id];
    const correct = Math.min(record?.correctStreak ?? 0, state.masteryRequired);

    return {
      id: question.id,
      correct,
      required: state.masteryRequired,
      mastered: record?.mastered ?? false,
    };
  });
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
 * Takes the next question of the mastery queue.
 *
 * The question that was asked last is never asked again right away: the
 * other questions of the queue come first. A queue that holds nothing but
 * the last question (a deck of a single question) has no other choice.
 */
function takeNextMastery(state: SessionQueueState): string | undefined {
  const first = state.pending[0];
  if (first === undefined) {
    return undefined;
  }

  const alternative = state.pending.find((id) => id !== state.lastAskedId);
  return alternative ?? first;
}

/**
 * The gap between two serves of the same question.
 *
 * The gap is clamped by the size of the deck: a deck that holds fewer
 * questions than the gap cannot wait that long, so the gap shrinks with it.
 */
function gapOf(state: SessionQueueState): number {
  const others = Math.max(0, state.questions.length - 1);
  return Math.max(0, Math.min(state.minGap, others));
}

/** A whole number of the options, with a floor and a fallback. */
function toCount(value: number | undefined, fallback: number, min: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.floor(value));
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
