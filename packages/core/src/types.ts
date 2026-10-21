import type { Card, Grade, ReviewLog, State } from 'ts-fsrs';

/**
 * A card as stored by the app (server side in D1, client side in SQLite).
 *
 * `type` is intentionally an open string: only `'mc'` (multiple choice) is
 * implemented in the MVP, but the schema keeps room for `'short' | 'math' |
 * 'cloze'` later on (see docs/SPEC.md §5).
 */
export interface StudyCard {
  id: string;
  setId: string;
  topicId?: string | null;
  type: string;
  front: string;
  back: string;
  /** Multiple choice options. MVP only. */
  choices?: string[];
  /** Index of the correct choice in `choices`. MVP only. */
  answerIndex?: number;
}

/**
 * The persisted FSRS scheduling state of a card.
 *
 * The field names mirror the ts-fsrs `Card` interface one-to-one (snake_case
 * on the wire/database, camelCase in TypeScript) so the client can schedule
 * offline and the server can re-validate the exact same way.
 */
export interface CardState {
  cardId: string;
  /** Epoch milliseconds. */
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: State;
  /** Epoch milliseconds, `null` when the card has never been reviewed. */
  lastReview: number | null;
}

/** A single review, flattened for storage in `review_logs`. */
export interface ReviewLogRecord {
  rating: number;
  state: State;
  /** Epoch milliseconds. */
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  /** Epoch milliseconds. */
  review: number;
}

export type { Card, Grade, ReviewLog, State };

/** Normalizes a `Date | number` into epoch milliseconds. */
export function toEpochMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}
