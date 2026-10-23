import { State } from "ts-fsrs";

import { createInitialState } from "./scheduler";
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

/**
 * The latest cutoff of the plain-mode undo (v0.1.23 shipped Oct 23, 2026;
 * midnight America/Chicago). A device runs the undo once, at its first start
 * on v0.1.23, with `min(now, this)` as the cutoff: every older scheduling
 * state without a Mastery answer came from a plain mode.
 */
export const NORMAL_MODE_FIX_AT = Date.UTC(2026, 9, 24, 5, 0, 0);

/**
 * The questions a plain Normal / Math session scheduled before
 * {@link NORMAL_MODE_FIX_AT}, back to New.
 *
 * Only states last reviewed before the fix, of questions with no Mastery
 * answer (`masteryCounts`), are reset. The fresh New state is stamped with
 * `now` as its last review, so it wins the sync's last-writer-wins merge on
 * the server log and every other device. States from Mastery are untouched,
 * and a second run finds nothing to reset.
 */
export function normalModeResets(
  states: Iterable<CardState>,
  masteryCounts: Readonly<Record<string, number>>,
  now: number,
  cutoff: number = NORMAL_MODE_FIX_AT,
): CardState[] {
  const resets: CardState[] = [];
  for (const state of states) {
    if (state.state === State.New) continue;
    if ((masteryCounts[state.cardId] ?? 0) > 0) continue;
    if ((state.lastReview ?? 0) >= cutoff) continue;
    resets.push({ ...createInitialState(state.cardId, now), lastReview: now });
  }
  return resets;
}
