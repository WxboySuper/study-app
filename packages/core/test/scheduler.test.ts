import { describe, expect, it } from 'vitest';

import { Rating, State } from 'ts-fsrs';

import {
  createInitialState,
  fromFsrsCard,
  fromFsrsLog,
  grade,
  toFsrsCard,
} from '../src/scheduler';
import type { CardState, StudyCard } from '../src/types';

const NOW = new Date('2026-10-21T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function card(id = 'card-1'): StudyCard {
  return {
    id,
    setId: 'set-1',
    topicId: null,
    type: 'mc',
    front: 'front',
    back: 'back',
  };
}

function reviewState(cardId = 'card-1'): CardState {
  return {
    cardId,
    due: NOW - 10 * DAY,
    stability: 10,
    difficulty: 5,
    elapsedDays: 10,
    scheduledDays: 10,
    reps: 3,
    lapses: 0,
    state: State.Review,
    lastReview: NOW - 10 * DAY,
    learningSteps: 0,
  };
}

describe('grade', () => {
  it('grades a brand new card', () => {
    const result = grade(card(), undefined, Rating.Good, NOW);

    expect(result.cardId).toBe('card-1');
    expect(result.log.rating).toBe(Rating.Good);
    expect(result.log.review).toBe(NOW);
    expect(result.state.reps).toBe(1);
    expect(result.state.state).toBe(State.Learning);
    expect(result.state.due).toBeGreaterThan(NOW);
  });

  it('keeps a reviewed card in the review state', () => {
    const result = grade(card(), reviewState(), Rating.Good, NOW);

    expect(result.state.state).toBe(State.Review);
    expect(result.state.reps).toBe(4);
    expect(result.state.stability).toBeGreaterThan(10);
    expect(result.state.due).toBeGreaterThan(NOW);
  });

  it('counts a lapse when a review card is forgotten', () => {
    const result = grade(card(), reviewState(), Rating.Again, NOW);

    expect(result.state.lapses).toBe(1);
    expect(result.state.state).toBe(State.Relearning);
  });

  it('accepts a Date for now', () => {
    const result = grade(card(), reviewState(), Rating.Good, new Date(NOW));

    expect(result.log.review).toBe(NOW);
  });

  it('accepts custom FSRS parameters', () => {
    const result = grade(card(), reviewState(), Rating.Good, NOW, {
      parameters: { request_retention: 0.7 },
    });

    // A lower requested retention means longer intervals.
    expect(result.state.scheduledDays).toBeGreaterThan(10);
  });

  it('falls back to the current time when now is omitted', () => {
    const before = Date.now();
    const result = grade(card(), reviewState(), Rating.Good);

    expect(result.log.review).toBeGreaterThanOrEqual(before);
  });

  it('keeps the card id of the graded card', () => {
    const result = grade(card('other-card'), reviewState('other-card'), Rating.Good, NOW);

    expect(result.cardId).toBe('other-card');
    expect(result.state.cardId).toBe('other-card');
  });
});

describe('createInitialState', () => {
  it('creates a new card state', () => {
    const state = createInitialState('card-1', NOW);

    expect(state.cardId).toBe('card-1');
    expect(state.state).toBe(State.New);
    expect(state.reps).toBe(0);
    expect(state.lapses).toBe(0);
    expect(state.due).toBe(NOW);
    expect(state.lastReview).toBeNull();
  });
});

describe('state conversion', () => {
  it('round trips a card state', () => {
    const state = reviewState();

    expect(fromFsrsCard('card-1', toFsrsCard(state))).toEqual(state);
  });

  it('handles a state without a last review', () => {
    const state = { ...reviewState(), lastReview: null };

    expect(toFsrsCard(state).last_review).toBeUndefined();
    expect(fromFsrsCard('card-1', toFsrsCard(state)).lastReview).toBeNull();
  });

  it('defaults the learning steps of legacy rows', () => {
    const state = { ...reviewState(), learningSteps: undefined };

    expect(toFsrsCard(state).learning_steps).toBe(0);
  });

  it('flattens a review log', () => {
    const result = grade(card(), reviewState(), Rating.Good, NOW);

    const log = fromFsrsLog({
      rating: Rating.Good,
      state: State.Review,
      due: new Date(NOW + DAY),
      stability: 12,
      difficulty: 5,
      elapsed_days: 10,
      last_elapsed_days: 10,
      scheduled_days: 12,
      learning_steps: 0,
      review: new Date(NOW),
    });

    expect(log).toEqual({
      rating: Rating.Good,
      state: State.Review,
      due: NOW + DAY,
      stability: 12,
      difficulty: 5,
      elapsedDays: 10,
      scheduledDays: 12,
      learningSteps: 0,
      review: NOW,
    });
    expect(result.log.review).toBe(NOW);
  });
});
