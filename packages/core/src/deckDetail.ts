import { plainText } from './math';
import { isLeech, isMatureMastered } from './mastery';
import { MASTERY_REQUIRED_CORRECT } from './sessionQueue';
import { limitKind } from './studyOptions';
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
  /** ★ Mastered: in Review with stability ≥ 21 days (Anki "mature"). */
  mastered: boolean;
  /** 🐛 8+ lapses. */
  leech: boolean;
  /** `true` when the next session of this deck would ask this question. */
  queued: boolean;
}

/** The filters of the deck detail screen. */
export type QuestionFilter = 'all' | 'due' | 'queued' | 'new' | 'learning' | 'scheduled' | 'mastered' | 'leech';

export const QUESTION_FILTERS: readonly QuestionFilter[] = [
  'all',
  'due',
  'queued',
  'new',
  'learning',
  'scheduled',
  'mastered',
  'leech',
];

/**
 * The review status of a question.
 *
 * - A question with no state, or one still in the New state, is `new`.
 * - A question in (re)learning whose step is due (within Anki's 20 minute
 *   learn-ahead) is `learning`.
 * - A review whose due time has passed is `due`.
 * - Anything else waits: `scheduled` ("Due in X").
 *
 * The same rule as `limitKind`, so the deck screen and Mastery's
 * "Today: new · learning · due" line agree.
 */
export function questionStatus(state: CardState | undefined, now: number): QuestionStatusKind {
  const kind = limitKind(state, now);
  return kind === 'later' ? 'scheduled' : kind;
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
      mastered: isMatureMastered(state),
      leech: isLeech(state),
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
    case 'leech':
      return row.leech;
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

/**
 * `true` when a question matches the search box: every word of the query
 * appears (case-insensitive) in its prompt or answer, as typed or as the
 * plain text of its math. An empty query matches everything.
 */
export function matchesQuestionSearch(row: QuestionRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return true;
  }
  const { front, back } = row.card;
  const haystack = [front, back, plainText(front), plainText(back)].join('\n').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The orders of the deck detail list. */
export type QuestionSort = 'deck' | 'due' | 'weakest';

export const QUESTION_SORTS: readonly QuestionSort[] = ['deck', 'due', 'weakest'];

/**
 * Sorts the rows (a copy; deck order stays the tie-break).
 *
 * - `deck`: the order of the deck.
 * - `due`: soonest due first; new questions (no due time) last.
 * - `weakest`: leeches first, then the fewest mastery dots, unmastered first.
 */
export function sortQuestionRows(rows: readonly QuestionRow[], sort: QuestionSort): QuestionRow[] {
  const indexed = rows.map((row, index) => ({ row, index }));
  const key = (row: QuestionRow): number[] => {
    switch (sort) {
      case 'due':
        return [row.dueAt ?? Number.POSITIVE_INFINITY];
      case 'weakest':
        return [row.leech ? 0 : 1, row.mastered ? 1 : 0, row.mastery];
      default:
        return [];
    }
  };
  indexed.sort((a, b) => {
    const ka = key(a.row);
    const kb = key(b.row);
    for (let i = 0; i < ka.length; i += 1) {
      const diff = (ka[i] as number) - (kb[i] as number);
      if (diff !== 0) {
        return diff;
      }
    }
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.row);
}

/** Parses a `?filter=` route param (falls back to `all`). */
export function parseQuestionFilter(value: unknown): QuestionFilter {
  return typeof value === 'string' && (QUESTION_FILTERS as readonly string[]).includes(value)
    ? (value as QuestionFilter)
    : 'all';
}
