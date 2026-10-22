import { State } from 'ts-fsrs';

import { MASTERY_REQUIRED_CORRECT } from './sessionQueue';
import type { CardState, StudyCard } from './types';

/**
 * The deck detail screen (docs/design/deck-detail.md).
 *
 * Every question of a deck gets one review status, the FSRS view, and a
 * mastery count, the Mastery-mode view. The screen can filter by either.
 */

/** The review status of one question. */
export type QuestionStatusKind = 'new' | 'learning' | 'due' | 'scheduled';

/** One row of the deck detail screen. */
export interface QuestionRow {
  card: StudyCard;
  status: QuestionStatusKind;
  /** When the question is due (epoch ms); `null` for a new question. */
  dueAt: number | null;
  /** Correct answers toward mastery, clamped to `[0, required]`. */
  mastery: number;
  /** How many correct answers mastery needs. */
  masteryRequired: number;
  /** `true` once `mastery >= masteryRequired`. */
  mastered: boolean;
  /** `true` when the next session of this deck would ask this question. */
  queued: boolean;
}

/** The filters of the deck detail screen. */
export type QuestionFilter = 'all' | 'due' | 'queued' | 'new' | 'learning' | 'scheduled' | 'mastered';

export const QUESTION_FILTERS: readonly QuestionFilter[] = [
  'all',
  'due',
  'queued',
  'new',
  'learning',
  'scheduled',
  'mastered',
];

/**
 * The review status of a question.
 *
 * - A question with no state, or one still in the New state, is `new`.
 * - A question whose due time has passed is `due`. This matches
 *   `countScope`, so the badge on the deck tile and the Due filter agree.
 * - A question in (re)learning that is not due yet is `learning`.
 * - A question in review that is not due yet is `scheduled` ("Due in X").
 */
export function questionStatus(state: CardState | undefined, now: number): QuestionStatusKind {
  if (state === undefined || state.state === State.New) {
    return 'new';
  }
  if (state.due <= now) {
    return 'due';
  }
  if (state.state === State.Learning || state.state === State.Relearning) {
    return 'learning';
  }
  return 'scheduled';
}

/** Builds the rows of the deck detail screen, in deck order. */
export function buildQuestionRows(
  cards: readonly StudyCard[],
  states: ReadonlyMap<string, CardState>,
  masteryCounts: Readonly<Record<string, number>>,
  queuedIds: ReadonlySet<string>,
  now: number,
  masteryRequired: number = MASTERY_REQUIRED_CORRECT,
): QuestionRow[] {
  return cards.map((card) => {
    const state = states.get(card.id);
    const raw = masteryCounts[card.id];
    const count =
      typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    const mastery = Math.min(count, masteryRequired);
    const status = questionStatus(state, now);
    return {
      card,
      status,
      dueAt: status === 'new' || state === undefined ? null : state.due,
      mastery,
      masteryRequired,
      mastered: mastery >= masteryRequired,
      queued: queuedIds.has(card.id),
    };
  });
}

/** `true` when a row passes a filter. */
export function matchesQuestionFilter(row: QuestionRow, filter: QuestionFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'queued':
      return row.queued;
    case 'mastered':
      return row.mastered;
    default:
      return row.status === filter;
  }
}

/** How many rows pass each filter (for the tappable counts). */
export function countQuestionFilters(rows: readonly QuestionRow[]): Record<QuestionFilter, number> {
  const counts = Object.fromEntries(QUESTION_FILTERS.map((f) => [f, 0])) as Record<
    QuestionFilter,
    number
  >;
  for (const row of rows) {
    for (const filter of QUESTION_FILTERS) {
      if (matchesQuestionFilter(row, filter)) {
        counts[filter] += 1;
      }
    }
  }
  return counts;
}

/** A short "in 5m / 3h / 2d / 4w / 3mo" label for a time in the future. */
export function formatDueIn(dueAt: number, now: number): string {
  const ms = Math.max(0, dueAt - now);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms < hour) {
    return `${Math.max(1, Math.round(ms / minute))}m`;
  }
  if (ms < day) {
    return `${Math.round(ms / hour)}h`;
  }
  if (ms < 14 * day) {
    return `${Math.round(ms / day)}d`;
  }
  if (ms < 60 * day) {
    return `${Math.round(ms / (7 * day))}w`;
  }
  return `${Math.round(ms / (30 * day))}mo`;
}

/** Parses a `?filter=` route param (falls back to `all`). */
export function parseQuestionFilter(value: unknown): QuestionFilter {
  return typeof value === 'string' && (QUESTION_FILTERS as readonly string[]).includes(value)
    ? (value as QuestionFilter)
    : 'all';
}
