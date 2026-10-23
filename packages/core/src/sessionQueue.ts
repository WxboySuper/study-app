import {
  answerAnkiCard,
  buildAnkiQueues,
  pickNextAnki,
  removeAnkiCard,
  requeueAnkiCard,
  type AnkiCard,
  type AnkiPickGroup,
  type AnkiQueues,
  type AnkiSettings,
} from './anki';
import { DEFAULT_ANKI_SETTINGS, ankiCardFromState } from './anki/types';
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
 * The picker is a port of Anki's scheduler design (see
 * `src/anki/`): new, learning and review cards live in separate queues,
 * learning steps are measured in questions, a miss goes to a short
 * relearning step, and a correct answer graduates the card towards a longer
 * interval. The wrapper maps Anki's minutes and days to question gaps so a
 * 1 minute step is about three questions and a 10 minute step about ten.
 *
 * Mastery mode uses the same picker, but a question leaves the session as
 * soon as it graduates to the review queue (Anki's rule). The n/3 count of
 * {@link MASTERY_REQUIRED_CORRECT} is only a visual meter.
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
  /**
   * Cards that share a sibling key are buried together, like the cards of
   * one Anki note. A question without one is never buried.
   */
  siblingKey?: string;
}

/** What the session knows about one question. */
export interface MasteryRecord {
  /** Correct answers in a row (the mastery rule of the game). */
  correctStreak: number;
  /** `true` when the player missed the question at some point. */
  missed: boolean;
  /** `true` when the question is mastered. */
  mastered: boolean;
}

/**
 * How many right answers (not necessarily in a row; a miss resets the count) a question needs to be mastered.
 *
 * Every question of the scope needs the same number: a missed question is
 * not harder than the others, it only has to be learned again.
 */
export const MASTERY_REQUIRED_CORRECT = 3;

/**
 * The floor between two serves of the same question.
 *
 * The Anki learning and relearning steps already provide a much longer gap;
 * this is only the safety net for a tiny deck.
 */
export const MASTERY_MIN_GAP = 3;

/** How many questions later a missed question comes back. */
export const DEFAULT_REINSERT_MIN = 3;

/** The most questions later a missed question comes back. */
export const DEFAULT_REINSERT_MAX = 5;

/** How many questions later a question that is not mastered yet comes back. */
export const DEFAULT_CORRECT_REINSERT_MIN = 3;

/** The most questions later a question that is not mastered yet comes back. */
export const DEFAULT_CORRECT_REINSERT_MAX = 10;

/** The stability (in days) under which a card counts as weak. */
export const DEFAULT_WEAK_STABILITY = 7;

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
  /** The scheduler settings. Defaults to {@link DEFAULT_ANKI_SETTINGS}. */
  settings?: Partial<AnkiSettings>;
  /** How many right answers (not necessarily in a row; a miss resets the count) a question needs to be mastered. */
  masteryRequired?: number;
  /** How many questions are asked between two serves of the same question. */
  minGap?: number;
  /**
   * The correct answers each question already has toward mastery, from
   * earlier sessions (by question id). Mastery is spread over sessions: a
   * question with 2 earlier correct answers is mastered by its next one.
   */
  masteryCounts?: Readonly<Record<string, number>>;
}

/** The state of the queue of a session. */
export interface SessionQueueState {
  /** The mode of the session. */
  mode: SessionMode;
  /** Every question of the scope. */
  questions: readonly SessionQuestion[];
  /**
   * The questions that are not mastered yet.
   *
   * It is a view of the whole deck, not a small working set: the picker
   * chooses from every eligible question of the session.
   */
  pending: readonly string[];
  /** What the session knows about every question. */
  records: Readonly<Record<string, MasteryRecord>>;
  /** The scheduling states of the questions. */
  states: Readonly<Record<string, CardState | undefined>>;
  /** The Anki queue state of every question. */
  cards: Readonly<Record<string, AnkiCard>>;
  /** The new, learning and review queues. */
  queues: AnkiQueues;
  /** The group of the question that was asked last. */
  lastGroup: AnkiPickGroup | null;
  /** The questions that were missed and not answered correctly since. */
  missedIds: readonly string[];
  /** The question that was asked last: it is never asked again right away. */
  lastAskedId: string | null;
  /** The position (1-based) at which every question was last asked. */
  askedAt: Readonly<Record<string, number>>;
  /** How many questions were asked. */
  asked: number;
  /** The random source of the session. */
  rng: Rng;
  /** The time of the session (epoch milliseconds). */
  now: number;
  /** How many right answers (not necessarily in a row; a miss resets the count) a question needs to be mastered. */
  masteryRequired: number;
  /** How many questions are asked between two serves of the same question. */
  minGap: number;
  /** The scheduler settings of the session. */
  settings: AnkiSettings;
}

/** Creates the queue of a session. */
export function createSessionQueue(options: SessionQueueOptions): SessionQueueState {
  const now = options.now ?? Date.now();
  const settings: AnkiSettings = {
    ...DEFAULT_ANKI_SETTINGS,
    ...options.settings,
  };
  const questions = [...options.questions];
  const cards: Record<string, AnkiCard> = {};
  const records: Record<string, MasteryRecord> = {};
  const states: Record<string, CardState | undefined> = {};

  for (const question of questions) {
    records[question.id] = { correctStreak: 0, missed: false, mastered: false };
    states[question.id] = question.state;
    cards[question.id] = createCard(question, settings, now, questions.length);
  }

  // The progress of earlier sessions. The n/3 count is a display-only
  // meter (sync design §6.1): it never masters a card by itself. In a
  // Mastery session a card is done when it graduates (passes its last
  // learning step) or, for a due review, when it is answered right. The
  // pool of the session is already cut to today's due, learning and new
  // cards by the daily limits, so every card of it is still to do.
  const required = toCount(options.masteryRequired, MASTERY_REQUIRED_CORRECT, 1);
  const seeds = options.masteryCounts ?? {};
  for (const question of questions) {
    const value = seeds[question.id];
    const count =
      typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    records[question.id] = { correctStreak: count, missed: false, mastered: false };
  }

  const queues = buildAnkiQueues(cards, options.rng);
  const pending = questions
    .map((question) => question.id);

  return {
    mode: options.mode,
    questions,
    pending,
    records,
    states,
    cards,
    queues,
    lastGroup: null,
    missedIds: [],
    lastAskedId: null,
    askedAt: {},
    asked: 0,
    rng: options.rng,
    now,
    masteryRequired: required,
    minGap: toCount(options.minGap, MASTERY_MIN_GAP, 0),
    settings,
  };
}

/**
 * Takes the next question of the session.
 *
 * The Anki queue builder decides: a due learning card first, then the mixed
 * new/review queue, then the cards that are only slightly ahead. The whole
 * deck is eligible; there is no small working set.
 */
export function nextSessionQuestion(state: SessionQueueState): {
  state: SessionQueueState;
  question: SessionQuestion | null;
} {
  if (state.mode === 'mastery' && sessionComplete(state)) {
    return { state, question: null };
  }

  const mastered: Record<string, boolean> = {};
  for (const [id, record] of Object.entries(state.records)) {
    mastered[id] = record.mastered;
  }

  const pick = pickNextAnki(state.cards, state.queues, state.asked, state.rng, {
    settings: state.settings,
    endless: state.mode === 'endless',
    lastAskedId: state.lastAskedId,
    askedAt: state.askedAt,
    minGap: state.minGap,
    mastered,
  });

  if (pick === null) {
    return { state, question: null };
  }

  return {
    state: {
      ...state,
      queues: pick.queues,
      lastGroup: pick.group,
      lastAskedId: pick.id,
      askedAt: { ...state.askedAt, [pick.id]: state.asked + 1 },
      asked: state.asked + 1,
    },
    question: findQuestion(state, pick.id),
  };
}

/**
 * Records the answer of the player.
 *
 * The Anki scheduler computes the next state: a miss goes to the short
 * relearning step, a correct answer follows the learning steps and then a
 * growing review interval. In mastery mode a question that graduates to the
 * review queue is done for today and leaves the session; otherwise it stays
 * in the queues and comes back when it is due.
 */
export function answerSessionQuestion(
  state: SessionQueueState,
  questionId: string,
  correct: boolean,
  nextState?: CardState,
): SessionQueueState {
  const record = state.records[questionId] ?? {
    correctStreak: 0,
    missed: false,
    mastered: false,
  };

  const nextRecord: MasteryRecord = correct
    ? { ...record, correctStreak: record.correctStreak + 1 }
    : { ...record, correctStreak: 0, missed: true };

  const states = { ...state.states, [questionId]: nextState ?? state.states[questionId] };

  const missedIds = correct
    ? state.missedIds.filter((id) => id !== questionId)
    : state.missedIds.includes(questionId)
      ? state.missedIds
      : [...state.missedIds, questionId];

  const current = state.cards[questionId] ?? createCard(
    { id: questionId, card: placeholderCard(questionId) },
    state.settings,
    state.now,
    state.questions.length,
  );

  const answer = answerAnkiCard(current, {
    correct,
    asked: state.asked,
    deckSize: Math.max(1, state.questions.length),
    now: state.now,
    rng: state.rng,
    settings: state.settings,
  });

  // The gap is measured from the question that was just asked. Without this
  // the card would keep its old due position (0 for a new card) and come
  // back immediately.
  const answered: AnkiCard = {
    ...answer.card,
    dueAt: state.asked + Math.max(1, answer.gap),
  };

  // Graduation (passing the last learning step) is what masters a card in a
  // Mastery session; the n/3 count is only a visual meter.
  const mastered = state.mode === 'mastery' && correct && answered.queue === 'review';
  const finalRecord: MasteryRecord = { ...nextRecord, mastered };
  const records = { ...state.records, [questionId]: finalRecord };
  const cards = { ...state.cards, [questionId]: answered };
  let queues = requeueAnkiCard(state.queues, answered, state.lastGroup ?? 'new');

  // A mastered card leaves the mastery session. In endless mode it stays in
  // the review queue and comes back rarely (its interval is now long).
  if (state.mode === 'mastery' && mastered) {
    queues = removeAnkiCard(queues, questionId);
  }

  const pending =
    state.mode === 'mastery'
      ? state.questions
          .filter((question) => records[question.id]?.mastered !== true)
          .map((question) => question.id)
      : state.pending.filter((id) => id !== questionId || !mastered);

  return {
    ...state,
    records,
    states,
    cards,
    queues,
    missedIds,
    pending,
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

/** The progress of one question of the scope. */
export interface MasteryProgress {
  id: string;
  correct: number;
  required: number;
  mastered: boolean;
}

/** The progress of every question of the scope. */
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

/** `true` when the session has nothing left to do. */
export function sessionComplete(state: SessionQueueState): boolean {
  if (state.mode === 'endless') {
    return false;
  }
  if (state.questions.length === 0) {
    return true;
  }
  return masteredCount(state) >= state.questions.length;
}

/** How many questions are still to be studied. */
export function sessionRemaining(state: SessionQueueState): number {
  if (state.mode === 'mastery') {
    return state.questions.length - masteredCount(state);
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

/** Builds the scheduler card of a question. */
function createCard(
  question: SessionQuestion,
  settings: AnkiSettings,
  now: number,
  deckSize: number,
): AnkiCard {
  return ankiCard(question.id, question.state, settings, now, deckSize, question.siblingKey);
}

/** Wraps `ankiCardFromState` so the import stays in one place. */
function ankiCard(
  id: string,
  state: CardState | undefined,
  settings: AnkiSettings,
  now: number,
  deckSize: number,
  siblingKey?: string,
): AnkiCard {
  return ankiCardFromState(id, state, settings, now, deckSize, siblingKey);
}

/** A whole number of the options, with a floor and a fallback. */
function toCount(value: number | undefined, fallback: number, min: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.floor(value));
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

/** A placeholder card for an answer about a question the queue does not know. */
function placeholderCard(id: string): StudyCard {
  return { id, setId: '', type: 'mc', front: '', back: '' };
}

function lookupState(states: StateLookup, cardId: string): CardState | undefined {
  if (states instanceof Map) {
    return states.get(cardId);
  }
  return (states as Readonly<Record<string, CardState | undefined>>)[cardId];
}

/** The correct answers of every question toward mastery (to persist). */
export function masteryCounts(state: SessionQueueState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [id, record] of Object.entries(state.records)) {
    counts[id] = record.correctStreak;
  }
  return counts;
}

/** The Anki stage of a question, as the Mastery HUD and badge show it. */
export type SessionStage = 'new' | 'learning' | 'review';

/** The stage of one question of the session. */
export function sessionStageOf(state: SessionQueueState, questionId: string): SessionStage {
  const card = state.cards[questionId];
  if (card === undefined || card.queue === 'new') {
    return 'new';
  }
  return card.queue === 'review' ? 'review' : 'learning';
}

/** The questions still to do today, by stage (the Mastery HUD). */
export interface SessionStageCounts {
  new: number;
  learning: number;
  review: number;
  /** Questions done today (graduated or reviewed). */
  done: number;
  /** Every question of today's session. */
  total: number;
}

/** Counts the questions of a Mastery session by stage. */
export function sessionStageCounts(state: SessionQueueState): SessionStageCounts {
  const counts: SessionStageCounts = { new: 0, learning: 0, review: 0, done: 0, total: state.questions.length };
  for (const question of state.questions) {
    if (state.records[question.id]?.mastered === true) {
      counts.done += 1;
      continue;
    }
    counts[sessionStageOf(state, question.id)] += 1;
  }
  return counts;
}
