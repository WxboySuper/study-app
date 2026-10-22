import { State } from "ts-fsrs";

import { isLeech, isMatureMastered } from "./mastery";
import type { CardState, StudyCard } from "./types";

/** The numbers of the stats screen. */
export interface StudyStats {
  total: number;
  new: number;
  learning: number;
  /** In Review, not mature yet. */
  young: number;
  /** ★ Mastered (Review, stability ≥ 21 days). */
  mature: number;
  leeches: number;
  /** Due now or later today. */
  dueToday: number;
  /** Cards reviewed since the start of today. */
  reviewedToday: number;
  /** Cards due on each of the next 7 days (index 0 is tomorrow). */
  forecast: number[];
  /** Share of reviewed cards that never lapsed (0 to 1, `null` with none). */
  retention: number | null;
}

const DAY_MS = 86_400_000;

/** Stats of some cards. `dayStart` is the start of today (local time). */
export function computeStudyStats(
  cards: readonly Pick<StudyCard, "id">[],
  states: ReadonlyMap<string, CardState>,
  now: number,
  dayStart: number,
): StudyStats {
  const stats: StudyStats = {
    total: cards.length,
    new: 0,
    learning: 0,
    young: 0,
    mature: 0,
    leeches: 0,
    dueToday: 0,
    reviewedToday: 0,
    forecast: [0, 0, 0, 0, 0, 0, 0],
    retention: null,
  };
  const endOfToday = dayStart + DAY_MS;
  let reviewed = 0;
  let clean = 0;
  for (const card of cards) {
    const state = states.get(card.id);
    if (state === undefined || state.state === State.New) {
      stats.new += 1;
      continue;
    }
    reviewed += 1;
    if (state.lapses === 0) clean += 1;
    if (state.state === State.Learning || state.state === State.Relearning)
      stats.learning += 1;
    else if (isMatureMastered(state)) stats.mature += 1;
    else stats.young += 1;
    if (isLeech(state)) stats.leeches += 1;
    if (state.lastReview !== null && state.lastReview >= dayStart)
      stats.reviewedToday += 1;
    if (state.due < endOfToday) stats.dueToday += 1;
    else {
      const day = Math.floor((state.due - endOfToday) / DAY_MS);
      if (day < 7) stats.forecast[day]! += 1;
    }
  }
  void now;
  stats.retention = reviewed === 0 ? null : clean / reviewed;
  return stats;
}
