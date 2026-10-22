/**
 * The types of the in-session scheduler.
 *
 * This folder is a TypeScript port of the *design* of Anki's scheduler
 * (github.com/ankitects/anki, AGPL-3.0). Anki schedules real days and
 * minutes; the game has no clock during a session, so the wrapper maps those
 * delays onto "questions later" (see `scheduler.ts`). See `NOTICE` and
 * `LICENSE` in this folder, and `docs/design/session-queue.md`.
 */

import type { CardState } from '../types';

/** The queue a card is in. Anki keeps these three queues separately. */
export type AnkiQueue = 'new' | 'learning' | 'review';

/**
 * The scheduling state of one question inside a session.
 *
 * `dueAt` is a question position, not a timestamp: the card becomes eligible
 * when `asked >= dueAt`. Anki's intraday learning queue uses timestamps in
 * the same way, and its due ordering is what the game's learning queue keeps.
 */
export interface AnkiCard {
  id: string;
  /**
   * The note (or deck) the card belongs to. Cards that share a sibling key
   * are buried together, like Anki's sibling cards of one note.
   */
  siblingKey?: string;
  queue: AnkiQueue;
  /**
   * The number of learning/relearning steps that are still to come.
   *
   * This is Anki's `remaining_steps`: a new card starts with every step,
   * `Again` resets it, `Good` consumes one step, and a card graduates when
   * there is no step left.
   */
  step: number;
  /** The question position at which the card becomes eligible again. */
  dueAt: number;
  /** The current review interval, in days (0 for a new card). */
  intervalDays: number;
  /** The FSRS memory state, carried across answers and sessions. */
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  /** Epoch milliseconds of the last review, `null` for a new card. */
  lastReview: number | null;
}

/** The knobs of the scheduler. The defaults are Anki's defaults, except for
 * the relearn step: the game uses a single one-minute step so a miss comes
 * back after a few questions instead of after ten. */
export interface AnkiSettings {
  /** Learning steps, in minutes. Anki's default is `[1, 10]`. */
  learnStepsMinutes: readonly number[];
  /** Relearning steps, in minutes. */
  relearnStepsMinutes: readonly number[];
  /** The interval a card graduates with after `Good`, in days. */
  graduatingIntervalDays: number;
  /** The interval a card graduates with after `Easy`, in days. */
  easyIntervalDays: number;
  /** The retention ts-fsrs schedules for. */
  desiredRetention: number;
  /** The longest review interval, in days. */
  maximumIntervalDays: number;
  /**
   * Stability (in days) above which a card is "well known". Endless mode
   * shows such a card only rarely.
   */
  highStabilityDays: number;
}

/** Anki's defaults, with the game's short relearning step. */
export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  learnStepsMinutes: [1, 10],
  relearnStepsMinutes: [1],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  desiredRetention: 0.9,
  maximumIntervalDays: 36_500,
  highStabilityDays: 30,
};

/** The in-session delay a review answer gets. */
export interface AnkiAnswerResult {
  /** The card after the answer. */
  card: AnkiCard;
  /** How many questions later the card is eligible again. */
  gap: number;
  /** `true` when the card moved to the review queue. */
  graduated: boolean;
}

/** What the queue remembers about one question. */
export interface AnkiRecord {
  /** Correct answers in a row (the mastery rule of the game). */
  correctStreak: number;
  missed: boolean;
  mastered: boolean;
}

/** Converts a persisted FSRS state into an Anki card. */
export function ankiCardFromState(
  id: string,
  state: CardState | undefined,
  settings: AnkiSettings,
  now: number,
  deckSize: number,
  siblingKey?: string,
): AnkiCard {
  const base: AnkiCard = {
    id,
    ...(siblingKey === undefined ? {} : { siblingKey }),
    queue: 'new',
    step: settings.learnStepsMinutes.length,
    dueAt: 0,
    intervalDays: 0,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
  };

  if (state === undefined || state.state === 0) {
    return base;
  }

  const common = {
    ...base,
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    lastReview: state.lastReview,
    intervalDays: state.scheduledDays,
  };

  if (state.state === 1 || state.state === 3) {
    const steps = state.state === 3 ? settings.relearnStepsMinutes : settings.learnStepsMinutes;
    const done = Math.max(0, state.learningSteps ?? 0);
    return {
      ...common,
      queue: 'learning',
      step: Math.max(1, steps.length - done),
      dueAt: state.due <= now ? 0 : dueInQuestions(state.due, now, deckSize),
    };
  }

  const daysLeft = Math.max(0, Math.ceil((state.due - now) / 86_400_000));
  return {
    ...common,
    queue: 'review',
    step: 0,
    dueAt: daysLeft === 0 ? 0 : reviewGapQuestions(daysLeft, deckSize),
  };
}

/** Maps a real due date to a rough in-session question gap. */
function dueInQuestions(due: number, now: number, deckSize: number): number {
  const minutes = Math.max(1, Math.ceil((due - now) / 60_000));
  return learningGapQuestions(minutes * 60, deckSize);
}

/**
 * The in-session gap of a learning step.
 *
 * Anki's 1 minute step is about three questions and its 10 minute step is
 * about ten; the mapping stays monotonic for unusual step settings. The
 * deck size caps the gap so a small deck can still show the card again.
 */
export function learningGapQuestions(seconds: number, deckSize: number): number {
  const minutes = Math.max(0, seconds / 60);
  let gap: number;
  if (minutes <= 1) {
    gap = 3;
  } else if (minutes <= 10) {
    gap = Math.round(3 + ((minutes - 1) * 7) / 9);
  } else {
    gap = Math.round(10 + (minutes - 10) * 0.5);
  }
  return Math.max(1, Math.min(gap, Math.max(1, deckSize - 1)));
}

/**
 * The in-session gap of a review interval.
 *
 * A card that graduates with one day goes far to the back of the session; a
 * four day card is effectively out of it. The gap scales with the deck so a
 * 60 question deck still covers every question early on, while a long
 * interval can park a well-known card for the rest of the session.
 */
export function reviewGapQuestions(days: number, deckSize: number): number {
  const deck = Math.max(1, deckSize);
  const base = Math.max(30, Math.round(deck * 0.75));
  const cap = Math.max(35, deck * 4);
  return Math.max(1, Math.min(cap, Math.round(base + Math.max(0, days) * 20)));
}
