/**
 * The queue builder of the in-session scheduler.
 *
 * Anki keeps three queues: new, learning (intraday) and review (main). This
 * port keeps the same separation and the same ordering rules:
 *
 * 1. a learning card that is due (or ahead) is shown before the main queue;
 * 2. the main queue mixes new and review cards with Anki's intersperser;
 * 3. new cards are mixed in steadily while any remain;
 * 4. siblings of a card (the same note) are buried for the session.
 *
 * Original Anki files that this module follows:
 * - rslib/src/scheduler/queue/builder/mod.rs
 * - rslib/src/scheduler/queue/builder/gathering.rs
 * - rslib/src/scheduler/queue/builder/intersperser.rs
 * - rslib/src/scheduler/queue/learning.rs
 * - rslib/src/scheduler/queue/main.rs
 *
 * Copyright: Ankitects Pty Ltd and contributors (design)
 * License: GNU AGPL, version 3 or later.
 */

import type { Rng } from '../fishing/roll';
import { burySiblings } from './bury';
import type { AnkiCard, AnkiSettings } from './types';

/** The three queues, with the in-session position of each card. */
export interface AnkiQueues {
  /** The unseen cards, in the shuffled order of the session. */
  newIds: string[];
  /** Learning and relearning cards, sorted by their due position. */
  learning: { id: string; dueAt: number }[];
  /** Review cards and the position at which they are due. */
  review: { id: string; dueAt: number }[];
  /** Sibling cards that Anki would bury for the rest of the session. */
  buried: string[];
  /** How many picks happened since the last new card. */
  sinceNew: number;
}

/** What a pick chose, for the counters of the wrapper. */
export type AnkiPickGroup = 'new' | 'learning' | 'review';

/** The result of {@link pickNextAnki}. */
export interface AnkiPick {
  id: string;
  group: AnkiPickGroup;
  queues: AnkiQueues;
}

/** Builds the initial queues of a session. */
export function buildAnkiQueues(
  cards: Readonly<Record<string, AnkiCard>>,
  rng: Rng,
): AnkiQueues {
  const newIds: string[] = [];
  const learning: { id: string; dueAt: number }[] = [];
  const review: { id: string; dueAt: number }[] = [];

  for (const card of Object.values(cards)) {
    if (card.queue === 'new') {
      newIds.push(card.id);
    } else if (card.queue === 'learning') {
      learning.push({ id: card.id, dueAt: card.dueAt });
    } else {
      review.push({ id: card.id, dueAt: card.dueAt });
    }
  }

  learning.sort((a, b) => a.dueAt - b.dueAt);
  review.sort((a, b) => a.dueAt - b.dueAt);

  return {
    newIds: shuffle(newIds, rng),
    learning,
    review,
    buried: [],
    sinceNew: 0,
  };
}

/**
 * Takes the next card of the session.
 *
 * `asked` is the number of questions that were already asked, so the next
 * question is at position `asked + 1`. A card becomes eligible when its
 * in-session due position is at most that number.
 *
 * @return `null` when every card is mastered (or the deck is empty).
 */
export function pickNextAnki(
  cards: Readonly<Record<string, AnkiCard>>,
  queues: AnkiQueues,
  asked: number,
  rng: Rng,
  options: {
    settings: AnkiSettings;
    endless: boolean;
    lastAskedId: string | null;
    /** The question position at which every card was last shown. */
    askedAt?: Readonly<Record<string, number>>;
    /** The minimum number of questions between two serves of one card. */
    minGap?: number;
    mastered?: Readonly<Record<string, boolean>>;
  },
): AnkiPick | null {
  // Prefer a card that is outside the minimum gap. When every remaining card
  // is still inside it (a tiny deck), fall back to the queue so the session
  // never stalls.
  return (
    selectNext(cards, queues, asked, rng, options, true) ??
    selectNext(cards, queues, asked, rng, options, false)
  );
}

/** One pass of the picker, with or without the minimum-gap rule. */
function selectNext(
  cards: Readonly<Record<string, AnkiCard>>,
  queues: AnkiQueues,
  asked: number,
  rng: Rng,
  options: {
    settings: AnkiSettings;
    endless: boolean;
    lastAskedId: string | null;
    askedAt?: Readonly<Record<string, number>>;
    minGap?: number;
    mastered?: Readonly<Record<string, boolean>>;
  },
  respectGap: boolean,
): AnkiPick | null {
  const nextPosition = asked + 1;
  const isAvailable = (id: string): boolean =>
    cards[id] !== undefined && !queues.buried.includes(id) && options.mastered?.[id] !== true;
  const gapOk = (id: string): boolean => {
    if (!respectGap) {
      return true;
    }
    const last = options.askedAt?.[id];
    if (last === undefined) {
      return true;
    }
    return nextPosition - last >= (options.minGap ?? 0);
  };

  // Never serve the same question twice in a row. If it is the only
  // question that can be asked (a one-question deck, or every other card is
  // buried), it has to come back right away.
  const lastAskedId = options.lastAskedId;
  const hasAlternative =
    lastAskedId !== null &&
    Object.keys(cards).some((id) => id !== lastAskedId && isAvailable(id) && gapOk(id));
  const available = (id: string): boolean =>
    isAvailable(id) && gapOk(id) && (id !== lastAskedId || !hasAlternative);

  // 1. The intraday learning queue comes before the main queue, exactly as
  //    in Anki's queue iterator.
  const dueLearning = queues.learning.filter(
    (entry) => available(entry.id) && entry.dueAt <= nextPosition,
  );
  if (dueLearning.length > 0) {
    const earliest = Math.min(...dueLearning.map((entry) => entry.dueAt));
    const choices = dueLearning.filter((entry) => entry.dueAt === earliest);
    const picked = choices[rng.int(0, choices.length - 1)];
    if (picked !== undefined) {
      return finish(cards, queues, picked.id, 'learning', rng);
    }
  }

  // 2. The main queue: the review cards that are due and the new cards,
  //    mixed with the intersperser. A new card is guaranteed at least every
  //    third pick while any remain, so a review-heavy deck still teaches the
  //    unseen questions.
  const reviewDue = queues.review
    .filter((entry) => available(entry.id) && entry.dueAt <= nextPosition)
    .sort((a, b) => a.dueAt - b.dueAt);
  const newIds = queues.newIds.filter(available);
  const group = chooseGroup(newIds, reviewDue.length, queues.sinceNew, rng);

  if (group === 'new') {
    const picked = pickRandom(newIds, rng);
    if (picked !== null) {
      return finish(cards, queues, picked, 'new', rng);
    }
  }

  if (group === 'review' && reviewDue.length > 0) {
    const picked = pickReview(cards, reviewDue.map((entry) => entry.id), options.settings, rng);
    if (picked !== null) {
      return finish(cards, queues, picked, 'review', rng);
    }
  }

  // The chosen group was empty (a stale queue): fall back to the other one.
  if (newIds.length > 0) {
    const picked = pickRandom(newIds, rng);
    if (picked !== null) {
      return finish(cards, queues, picked, 'new', rng);
    }
  }

  if (reviewDue.length > 0) {
    const picked = pickReview(cards, reviewDue.map((entry) => entry.id), options.settings, rng);
    if (picked !== null) {
      return finish(cards, queues, picked, 'review', rng);
    }
  }

  // 3. Nothing is due right now. Anki shows learning cards that are only
  //    slightly ahead when the main queue is empty; the game does the same,
  //    and for endless mode it also pulls the next review card forward so a
  //    session never dead-ends.
  const aheadLearning = queues.learning.filter((entry) => available(entry.id));
  if (aheadLearning.length > 0) {
    const earliest = Math.min(...aheadLearning.map((entry) => entry.dueAt));
    const choices = aheadLearning.filter((entry) => entry.dueAt === earliest);
    const picked = choices[rng.int(0, choices.length - 1)];
    if (picked !== undefined) {
      return finish(cards, queues, picked.id, 'learning', rng);
    }
  }

  const futureReview = queues.review.filter((entry) => available(entry.id));
  if (futureReview.length > 0) {
    const earliest = Math.min(...futureReview.map((entry) => entry.dueAt));
    const choices = futureReview.filter((entry) => entry.dueAt === earliest);
    const picked = choices[rng.int(0, choices.length - 1)];
    if (picked !== undefined) {
      return finish(cards, queues, picked.id, 'review', rng);
    }
  }

  return null;
}

/** Chooses between the new and the review group. */
function chooseGroup(
  newIds: readonly string[],
  reviewCount: number,
  sinceNew: number,
  rng: Rng,
): AnkiPickGroup {
  if (newIds.length === 0) {
    return 'review';
  }
  if (reviewCount === 0) {
    return 'new';
  }
  if (sinceNew >= 2) {
    return 'new';
  }
  // Anki's intersperser mixes the two queues in proportion to their length.
  // For the game the wrapper keeps one new card in roughly every three picks.
  return rng.next() < 0.4 ? 'new' : 'review';
}

/** Picks a review card, showing well-known cards only rarely in endless mode. */
function pickReview(
  cards: Readonly<Record<string, AnkiCard>>,
  ids: readonly string[],
  settings: AnkiSettings,
  rng: Rng,
): string | null {
  if (ids.length === 0) {
    return null;
  }

  const rare = ids.filter((id) => (cards[id]?.stability ?? 0) >= settings.highStabilityDays);
  const normal = ids.filter((id) => (cards[id]?.stability ?? 0) < settings.highStabilityDays);

  if (normal.length === 0) {
    return ids[rng.int(0, ids.length - 1)] ?? null;
  }

  // A high-stability card is eligible, but it should not crowd the session.
  if (rare.length > 0 && rng.next() < 0.15) {
    return rare[rng.int(0, rare.length - 1)] ?? null;
  }

  return normal[rng.int(0, normal.length - 1)] ?? null;
}

/** Applies the pick to the queues (and buries the siblings of the card). */
function finish(
  cards: Readonly<Record<string, AnkiCard>>,
  queues: AnkiQueues,
  id: string,
  group: AnkiPickGroup,
  rng: Rng,
): AnkiPick {
  void rng;
  const buried = burySiblings(cards, id, queues.buried);

  return {
    id,
    group,
    queues: {
      newIds: queues.newIds.filter((entry) => entry !== id),
      learning: queues.learning.filter((entry) => entry.id !== id),
      review: queues.review.filter((entry) => entry.id !== id),
      buried,
      sinceNew: group === 'new' ? 0 : queues.sinceNew + 1,
    },
  };
}

/** Puts a card back into the right queue after an answer. */
export function requeueAnkiCard(
  queues: AnkiQueues,
  card: AnkiCard,
  group: AnkiPickGroup,
): AnkiQueues {
  if (group === 'new') {
    // A new card leaves the new queue when it is answered; it is now in
    // learning or in review.
  }

  const newIds = queues.newIds.filter((id) => id !== card.id);
  const learning = queues.learning.filter((entry) => entry.id !== card.id);
  const review = queues.review.filter((entry) => entry.id !== card.id);

  if (card.queue === 'learning') {
    learning.push({ id: card.id, dueAt: card.dueAt });
    learning.sort((a, b) => a.dueAt - b.dueAt);
  } else if (card.queue === 'review') {
    review.push({ id: card.id, dueAt: card.dueAt });
    review.sort((a, b) => a.dueAt - b.dueAt);
  }

  return { ...queues, newIds, learning, review };
}

/** Removes a mastered card from every queue. */
export function removeAnkiCard(queues: AnkiQueues, id: string): AnkiQueues {
  return {
    ...queues,
    newIds: queues.newIds.filter((entry) => entry !== id),
    learning: queues.learning.filter((entry) => entry.id !== id),
    review: queues.review.filter((entry) => entry.id !== id),
    buried: queues.buried.filter((entry) => entry !== id),
  };
}

/** Fisher-Yates shuffle. */
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

/** Picks a random id from a non-empty list. */
function pickRandom(ids: readonly string[], rng: Rng): string | null {
  if (ids.length === 0) {
    return null;
  }
  return ids[rng.int(0, ids.length - 1)] ?? null;
}
