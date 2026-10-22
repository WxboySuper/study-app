/**
 * The bridge between Anki's step state machine and ts-fsrs.
 *
 * Anki's scheduler decides *when* a card is seen again (minutes for learning,
 * days for review). The game has no wall clock during a session, so the
 * wrapper maps those delays to question gaps:
 *
 * - a 1 minute step is roughly 3 questions, a 10 minute step roughly 10;
 * - a miss uses the one-minute relearn step, so it returns after 3-5
 *   questions;
 * - a graduating interval (1 day and up) is far to the back of the session,
 *   and a long review interval is effectively out of the session.
 *
 * The real-day interval itself comes from ts-fsrs with Anki's default
 * desired retention (90 %), so the next *session* is scheduled exactly like
 * the rest of the app (the existing review recording stays authoritative).
 *
 * Original Anki files that this module follows:
 * - rslib/src/scheduler/states/learning.rs
 * - rslib/src/scheduler/states/relearning.rs
 * - rslib/src/scheduler/states/review.rs
 * - rslib/src/scheduler/states/steps.rs
 *
 * Copyright: Ankitects Pty Ltd and contributors (design)
 * License: GNU AGPL, version 3 or later.
 */

import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs';

import type { Rng } from '../fishing/roll';
import { LearningSteps } from './steps';
import {
  DEFAULT_ANKI_SETTINGS,
  learningGapQuestions,
  reviewGapQuestions,
  type AnkiAnswerResult,
  type AnkiCard,
  type AnkiSettings,
} from './types';

/** The context of one answer. */
export interface AnkiAnswerContext {
  /** The player answered correctly. */
  correct: boolean;
  /** The current question position (`0` for the first question). */
  asked: number;
  /** How many questions the deck holds. */
  deckSize: number;
  /** The time of the answer, for ts-fsrs. */
  now: number;
  /** The random source of the small scheduling jitter. */
  rng: Rng;
  /** The scheduler settings. */
  settings?: AnkiSettings;
}

/** The scheduler used for the real-day intervals. */
function fsrsScheduler(settings: AnkiSettings) {
  return fsrs({
    request_retention: settings.desiredRetention,
    maximum_interval: settings.maximumIntervalDays,
    enable_short_term: false,
    enable_fuzz: true,
  });
}

/** The ts-fsrs card of an in-session card. */
function toFsrsCard(card: AnkiCard, now: number, settings: AnkiSettings): FsrsCard {
  if (card.queue === 'new' && card.reps === 0) {
    return createEmptyCard(new Date(now));
  }

  const state =
    card.queue === 'review'
      ? State.Review
      : card.lapses > 0
        ? State.Relearning
        : State.Learning;
  const steps =
    card.queue === 'review' ? settings.learnStepsMinutes : settings.relearnStepsMinutes;

  return {
    due: new Date(now),
    stability: Math.max(0.1, card.stability),
    difficulty: card.difficulty > 0 ? card.difficulty : 5,
    elapsed_days: 0,
    scheduled_days: card.intervalDays,
    learning_steps: Math.max(0, steps.length - card.step),
    reps: card.reps,
    lapses: card.lapses,
    state,
    last_review: card.lastReview === null ? undefined : new Date(card.lastReview),
  };
}

/** The real-day interval ts-fsrs gives a card for a rating. */
export function fsrsIntervalDays(
  card: AnkiCard,
  rating: Grade,
  now: number,
  settings: AnkiSettings = DEFAULT_ANKI_SETTINGS,
): number {
  return Math.max(1, Math.round(fsrsNextCard(card, rating, now, settings).scheduled_days));
}

/** The ts-fsrs card after a rating, with its new memory state. */
function fsrsNextCard(
  card: AnkiCard,
  rating: Grade,
  now: number,
  settings: AnkiSettings,
): FsrsCard {
  const current = toFsrsCard(card, now, settings);
  return fsrsScheduler(settings).next(current, new Date(now), rating).card;
}

/** Applies one answer to an Anki card. */
export function answerAnkiCard(card: AnkiCard, context: AnkiAnswerContext): AnkiAnswerResult {
  const settings = context.settings ?? DEFAULT_ANKI_SETTINGS;

  if (card.queue === 'new') {
    if (!context.correct) {
      const steps = new LearningSteps(settings.learnStepsMinutes);
      const delay = steps.againDelaySeconds();
      return {
        card: {
          ...card,
          queue: delay === undefined ? 'review' : 'learning',
          step: steps.remainingForFailed(),
          intervalDays: delay === undefined ? settings.graduatingIntervalDays : 0,
          reps: card.reps + 1,
          lapses: delay === undefined ? card.lapses + 1 : card.lapses,
          lastReview: context.now,
        },
        gap:
          delay === undefined
            ? reviewGapQuestions(settings.graduatingIntervalDays, context.deckSize)
            : shortGap(context.rng, context.deckSize),
        graduated: delay === undefined,
      };
    }

    const steps = new LearningSteps(settings.learnStepsMinutes);
    const delay = steps.goodDelaySeconds(card.step);
    if (delay === undefined) {
      return graduate(card, Rating.Good, context, settings);
    }

    return {
      card: {
        ...card,
        queue: 'learning',
        step: steps.remainingForGood(card.step),
        intervalDays: 0,
        reps: card.reps + 1,
        lastReview: context.now,
      },
      gap: learningGap(context.rng, delay, context.deckSize),
      graduated: false,
    };
  }

  if (card.queue === 'learning') {
    const steps = new LearningSteps(card.lapses > 0 ? settings.relearnStepsMinutes : settings.learnStepsMinutes);

    if (!context.correct) {
      const delay = steps.againDelaySeconds();
      return {
        card: {
          ...card,
          queue: delay === undefined ? 'review' : 'learning',
          step: steps.remainingForFailed(),
          reps: card.reps + 1,
          lapses: delay === undefined ? card.lapses + 1 : card.lapses,
          lastReview: context.now,
        },
        gap:
          delay === undefined
            ? reviewGapQuestions(Math.max(1, card.intervalDays), context.deckSize)
            : shortGap(context.rng, context.deckSize),
        graduated: delay === undefined,
      };
    }

    const delay = steps.goodDelaySeconds(card.step);
    if (delay === undefined) {
      return graduate(card, Rating.Good, context, settings);
    }

    return {
      card: {
        ...card,
        step: steps.remainingForGood(card.step),
        reps: card.reps + 1,
        lastReview: context.now,
      },
      gap: learningGap(context.rng, delay, context.deckSize),
      graduated: false,
    };
  }

  // A review card.
  if (!context.correct) {
    const steps = new LearningSteps(settings.relearnStepsMinutes);
    const delay = steps.againDelaySeconds();
    const intervalDays = Math.max(1, Math.round(card.intervalDays / 2));
    return {
      card: {
        ...card,
        queue: delay === undefined ? 'review' : 'learning',
        step: steps.remainingForFailed(),
        intervalDays: delay === undefined ? intervalDays : 0,
        lapses: card.lapses + 1,
        reps: card.reps + 1,
        stability: Math.max(0, card.stability / 2),
        lastReview: context.now,
      },
      gap:
        delay === undefined
          ? reviewGapQuestions(intervalDays, context.deckSize)
          : shortGap(context.rng, context.deckSize),
      graduated: delay === undefined,
    };
  }

  const nextFsrs = fsrsNextCard(card, Rating.Good, context.now, settings);
  const intervalDays = Math.max(
    card.intervalDays + 1,
    Math.max(1, Math.round(nextFsrs.scheduled_days)),
  );
  return {
    card: {
      ...card,
      queue: 'review',
      step: 0,
      intervalDays,
      reps: card.reps + 1,
      lastReview: context.now,
      stability: Math.max(card.stability, nextFsrs.stability),
      difficulty: nextFsrs.difficulty > 0 ? nextFsrs.difficulty : card.difficulty,
    },
    gap: jitteredReviewGap(intervalDays, context.deckSize, context.rng),
    graduated: false,
  };
}

/** Graduates a learning card to the review queue. */
function graduate(
  card: AnkiCard,
  rating: Grade,
  context: AnkiAnswerContext,
  settings: AnkiSettings,
): AnkiAnswerResult {
  const nextFsrs = fsrsNextCard(card, rating, context.now, settings);
  const intervalDays = Math.max(
    settings.graduatingIntervalDays,
    Math.max(1, Math.round(nextFsrs.scheduled_days)),
  );
  return {
    card: {
      ...card,
      queue: 'review',
      step: 0,
      intervalDays,
      reps: card.reps + 1,
      lastReview: context.now,
      stability: Math.max(card.stability, nextFsrs.stability),
      difficulty: nextFsrs.difficulty > 0 ? nextFsrs.difficulty : card.difficulty,
    },
    gap: jitteredReviewGap(intervalDays, context.deckSize, context.rng),
    graduated: true,
  };
}

/** The gap of a miss: the short relearn step. */
function shortGap(rng: Rng, deckSize: number): number {
  const gap = 3 + rng.int(0, 2);
  return Math.max(1, Math.min(gap, Math.max(1, deckSize - 1)));
}

/** The gap of a learning step, with Anki's small scheduling jitter. */
function learningGap(rng: Rng, seconds: number, deckSize: number): number {
  const base = learningGapQuestions(seconds, deckSize);
  return Math.max(1, Math.min(base + rng.int(0, 1), Math.max(1, deckSize - 1)));
}

/** The gap of a review interval, with a little jitter (like Anki's fuzz). */
function jitteredReviewGap(days: number, deckSize: number, rng: Rng): number {
  const base = reviewGapQuestions(days, deckSize);
  const spread = Math.max(1, Math.round(base * 0.1));
  return Math.max(1, base + rng.int(-spread, spread));
}

export { Rating };
