import {
  createEmptyCard,
  fsrs,
  type Card as FsrsCard,
  type DateInput,
  type FSRSParameters,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';

import type { CardState, ReviewLogRecord, StudyCard } from './types';

/** Tuning knobs for {@link grade}. */
export interface GradeOptions {
  /** FSRS parameters. Defaults to the ts-fsrs defaults. */
  parameters?: Partial<FSRSParameters>;
}

/** The result of grading a single card. */
export interface GradeResult {
  /** The card that was graded. */
  cardId: string;
  /** The scheduling state after the review. */
  state: CardState;
  /** The review log, flattened for storage. */
  log: ReviewLogRecord;
}

/**
 * Grades a card with FSRS and returns the new scheduling state plus the
 * review log.
 *
 * This is the single place where the app touches ts-fsrs, so the client
 * (offline) and the server (re-validation on sync) always agree.
 */
export function grade(
  card: StudyCard,
  state: CardState | null | undefined,
  rating: Grade,
  now: DateInput = new Date(),
  options: GradeOptions = {},
): GradeResult {
  const scheduler = fsrs(options.parameters);
  const current = state ? toFsrsCard(state) : createEmptyCard(toDate(now));
  const result = scheduler.next(current, toDate(now), rating);

  return {
    cardId: card.id,
    state: fromFsrsCard(card.id, result.card),
    log: fromFsrsLog(result.log),
  };
}

/** Converts the persisted state back into a ts-fsrs card. */
export function toFsrsCard(state: CardState): FsrsCard {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps ?? 0,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview === null ? undefined : new Date(state.lastReview),
  };
}

/** Converts a ts-fsrs card into the persisted state shape. */
export function fromFsrsCard(cardId: string, card: FsrsCard): CardState {
  return {
    cardId,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.getTime() : null,
    learningSteps: card.learning_steps,
  };
}

/** Flattens a ts-fsrs review log into the shape stored in `review_logs`. */
export function fromFsrsLog(log: ReviewLog): ReviewLogRecord {
  return {
    rating: log.rating,
    state: log.state,
    due: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps,
    review: log.review.getTime(),
  };
}

/**
 * Creates the state of a brand new card (never reviewed).
 */
export function createInitialState(cardId: string, now: DateInput = new Date()): CardState {
  return fromFsrsCard(cardId, createEmptyCard(toDate(now)));
}

function toDate(value: DateInput): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  return new Date(value);
}
