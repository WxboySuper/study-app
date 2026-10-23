import type { CardState } from "./types";

/**
 * What a session answer writes (docs/design/sync.md).
 *
 * Only the Mastery modes (questions and math) schedule. A plain Normal or
 * Math answer still goes to the review history and the stats, but writes no
 * scheduling state: no due date, no learning step and no `card_state` sync
 * event, so it never makes a question due in Mastery.
 */
export function reviewWrites<S extends CardState>(
  review: { state: S },
  mastery: boolean,
): { cardState: S | null; history: true } {
  return { cardState: mastery ? review.state : null, history: true };
}
