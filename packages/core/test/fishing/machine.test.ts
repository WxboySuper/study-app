import { Rating, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  FISH_LOST_MS,
  LEAD_UP_FULL_MS,
  LEAD_UP_SHORT_MS,
  WRONG_LOCKOUT_MS,
  biggestCatch,
  createFishingState,
  fishingReducer,
  leadUpOf,
  masteryStatusOf,
  remainingCards,
  toSessionResult,
  type FishingEvent,
  type FishingState,
} from '../../src/fishing/machine';
import { createSeededRng, isCatchOutcome } from '../../src/fishing/roll';
import type { CardState } from '../../src/types';
import { makeQueueItem, sequenceRng } from './helpers';

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

function createState(overrides: Partial<Parameters<typeof createFishingState>[0]> = {}): FishingState {
  return createFishingState({
    rng: createSeededRng(1),
    queue: [makeQueueItem('card-1'), makeQueueItem('card-2')],
    now: NOW,
    ...overrides,
  });
}

function apply(state: FishingState, ...events: FishingEvent[]): FishingState {
  return events.reduce(fishingReducer, state);
}

/** Casts and waits for the fish to bite. */
function toHooked(state: FishingState): FishingState {
  return apply(state, { type: 'cast' }, { type: 'cast_landed' }, { type: 'bite' });
}

/** Taps an answer: the note now waits for the player. */
function answer(state: FishingState, choiceIndex: number, now = NOW): FishingState {
  return apply(
    state,
    { type: 'reel' },
    { type: 'answer', choiceIndex, durationMs: 500, now },
  );
}

/** Answers correctly and reels the catch in, up to the reveal card. */
function answerAndReveal(state: FishingState, choiceIndex = 0): FishingState {
  return apply(
    state,
    { type: 'reel' },
    { type: 'answer', choiceIndex, durationMs: 500, now: NOW },
    { type: 'answer_hold_done', now: NOW },
    { type: 'reel_finished' },
  );
}

/** Answers correctly, reels the catch in and claims it. */
function answerAndClaim(state: FishingState, choiceIndex = 0): FishingState {
  return apply(answerAndReveal(state, choiceIndex), { type: 'continue' });
}

function cardState(overrides: Partial<CardState> = {}): CardState {
  return {
    cardId: 'card-1',
    due: NOW,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 1,
    lapses: 0,
    state: State.Review,
    lastReview: NOW,
    ...overrides,
  };
}

describe('the fishing machine', () => {
  it('starts on the dock', () => {
    const state = createState();
    expect(state.phase).toBe('idle');
    expect(state.session.haulLbs).toBe(0);
    expect(state.session.correct).toBe(0);
    expect(state.ended).toBe(false);
    expect(state.lockoutUntil).toBeNull();
  });

  it('runs the whole loop', () => {
    let state = createState();

    state = apply(state, { type: 'cast' });
    expect(state.phase).toBe('casting');

    state = apply(state, { type: 'cast_landed' });
    expect(state.phase).toBe('waiting');

    state = apply(state, { type: 'bite' });
    expect(state.phase).toBe('hooked');

    state = apply(state, { type: 'reel' });
    expect(state.phase).toBe('question');

    state = apply(state, { type: 'answer', choiceIndex: 0, durationMs: 1_000, now: NOW });
    // The note waits for the player: nothing moves until the tap.
    expect(state.phase).toBe('answered');
    expect(state.feedback?.correct).toBe(true);

    state = apply(state, { type: 'answer_hold_done', now: NOW });
    expect(state.phase).toBe('reeling');

    state = apply(state, { type: 'reel_finished' });
    expect(state.phase).toBe('reveal');
    // The catch is on the card, not in the haul yet.
    expect(state.session.catches).toBe(0);
    expect(state.session.haulLbs).toBe(0);
    expect(state.reveal).not.toBeNull();

    state = apply(state, { type: 'continue' });
    expect(state.phase).toBe('idle');
    expect(state.question).toBeNull();
    expect(state.session.catches).toBe(1);
    expect(state.session.haulLbs).toBeGreaterThan(0);
  });

  it('does not advance the correct answer until the player taps', () => {
    const state = answer(toHooked(createState()), 0);
    expect(state.phase).toBe('answered');

    expect(fishingReducer(state, { type: 'answer_hold_done', now: NOW }).phase).toBe('reeling');
  });

  it('rolls the catch and pulls the card when the fish is hooked', () => {
    let state = createState();

    state = apply(state, { type: 'cast' }, { type: 'cast_landed' });
    expect(state.onTheLine).toBeNull();
    expect(state.question).toBeNull();

    state = apply(state, { type: 'bite' });
    expect(state.onTheLine).not.toBeNull();
    expect(state.question?.cardId).toBe('card-1');
    expect(state.currentItem?.cardId).toBe('card-1');
  });

  it('asks the next card after every catch is claimed', () => {
    let state = createState();
    state = toHooked(state);
    state = answerAndClaim(state, 0);
    state = toHooked(state);

    expect(state.question?.cardId).toBe('card-2');
  });

  it('loses the catch when the answer is wrong', () => {
    let state = toHooked(createState());
    state = answer(state, 2);

    expect(state.phase).toBe('answered');
    expect(state.feedback?.correct).toBe(false);
    expect(state.feedback?.answerIndex).toBe(0);
    expect(state.lockoutUntil).toBe(NOW + WRONG_LOCKOUT_MS);

    // A tap during the lockout is ignored.
    expect(fishingReducer(state, { type: 'answer_hold_done', now: NOW + 100 })).toBe(state);

    // After the three seconds the tap shows the "Fish Lost!" bubble.
    state = apply(state, { type: 'answer_hold_done', now: NOW + WRONG_LOCKOUT_MS });
    expect(state.phase).toBe('got_away');
    expect(state.lockoutUntil).toBeNull();
    expect(state.session.catches).toBe(0);
    expect(state.session.haulLbs).toBe(0);
    expect(state.session.streak).toBe(0);

    state = apply(state, { type: 'continue' });
    expect(state.phase).toBe('idle');
  });

  it('shows the fish lost bubble for a short moment', () => {
    expect(FISH_LOST_MS).toBe(900);
  });

  it('grades a wrong answer as "Again"', () => {
    let state = toHooked(createState());
    state = answer(state, 3);

    const review = state.session.reviews[0];
    expect(review?.rating).toBe(Rating.Again);
    expect(review?.cardId).toBe('card-1');
    expect(review?.durationMs).toBe(500);
    expect(state.session.answered).toBe(1);
    expect(state.session.correct).toBe(0);
  });

  it('records a review for every answer, even when the card comes back', () => {
    let state = createState({
      queue: [makeQueueItem('card-1')],
      refillQueue: () => [makeQueueItem('card-1')],
    });

    for (let round = 0; round < 3; round += 1) {
      state = toHooked(state);
      state = answerAndClaim(state, 0);
    }

    expect(state.session.reviews).toHaveLength(3);
    expect(state.session.reviews.map((review) => review.cardId)).toEqual([
      'card-1',
      'card-1',
      'card-1',
    ]);
    expect(state.session.cardStates.get('card-1')?.reps).toBe(3);
  });

  it('asks a card with wrong answers as a multiple choice question', () => {
    const state = toHooked(createState());
    expect(state.question?.selfGrade).toBe(false);
  });

  it('asks a card without wrong answers as a self-graded card', () => {
    const state = toHooked(createState({ queue: [makeQueueItem('self-graded', { wrong: null })] }));
    expect(state.question?.selfGrade).toBe(true);
    expect(state.question?.answer).toBe('back of self-graded');
  });

  it('grades a self-graded card "Got it" as "Good"', () => {
    let state = createState({ queue: [makeQueueItem('self-graded', { wrong: null })] });
    state = toHooked(state);
    state = apply(state, { type: 'reel' });
    state = apply(state, {
      type: 'answer',
      choiceIndex: 0,
      durationMs: 60_000,
      now: NOW,
      selfGrade: true,
    });

    expect(state.phase).toBe('answered');
    expect(state.session.reviews[0]?.rating).toBe(Rating.Good);
    expect(state.session.correct).toBe(1);
  });

  it('grades a self-graded card "Missed it" as "Again"', () => {
    let state = createState({ queue: [makeQueueItem('self-graded', { wrong: null })] });
    state = toHooked(state);
    state = apply(state, { type: 'reel' });
    state = apply(state, {
      type: 'answer',
      choiceIndex: -1,
      durationMs: 1_000,
      now: NOW,
      selfGrade: true,
    });

    expect(state.phase).toBe('answered');
    expect(state.session.reviews[0]?.rating).toBe(Rating.Again);
    expect(state.session.correct).toBe(0);
  });

  it('grades a fast streak as "Easy"', () => {
    let state = createState({
      queue: [makeQueueItem('a'), makeQueueItem('b'), makeQueueItem('c'), makeQueueItem('d')],
    });

    for (let index = 0; index < 4; index += 1) {
      state = toHooked(state);
      state = answerAndClaim(state, 0);
    }

    expect(state.session.reviews.map((review) => review.rating)).toEqual([
      Rating.Good,
      Rating.Good,
      Rating.Good,
      Rating.Easy,
    ]);
    expect(state.session.bestStreak).toBe(4);
  });

  it('grades a slow answer as "Hard"', () => {
    let state = toHooked(createState());
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 30_000, now: NOW });
    expect(state.session.reviews[0]?.rating).toBe(Rating.Hard);
  });

  it('keeps the card in play with the Second Chance', () => {
    let state = createState();
    state = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'second_chance' } },
    };

    state = toHooked(state);
    state = answer(state, 1);

    expect(state.phase).toBe('answered');
    expect(state.feedback?.retry).toBe(true);
    expect(state.session.roll.powerup).toBeNull();
    expect(state.lockoutUntil).toBeNull();
    expect(state.session.reviews[0]?.rating).toBe(Rating.Again);

    // The retry is not locked: a tap puts the player back on the same card.
    state = apply(state, { type: 'answer_hold_done', now: NOW });
    expect(state.phase).toBe('question');
    expect(state.question?.cardId).toBe('card-1');

    state = answer(state, 0);
    state = apply(state, { type: 'answer_hold_done', now: NOW });
    expect(state.phase).toBe('reeling');
    expect(state.session.correct).toBe(1);
  });

  it('lands two catches with the Double Hook, on the claim', () => {
    let state = createState({ rng: createSeededRng(3) });
    state = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'double_hook' } },
    };

    state = toHooked(state);
    state = answer(state, 0);
    expect(state.landing).toHaveLength(2);
    expect(state.session.catches).toBe(0);

    state = apply(
      state,
      { type: 'answer_hold_done', now: NOW },
      { type: 'reel_finished' },
      { type: 'continue' },
    );
    expect(state.session.catches).toBe(2);
    expect(state.session.roll.powerup).toBeNull();
  });

  it('counts the haul and the tiers only when the catch is claimed', () => {
    let state = toHooked(createState());
    state = apply(
      state,
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
      { type: 'answer_hold_done', now: NOW },
      { type: 'reel_finished' },
    );

    expect(state.phase).toBe('reveal');
    expect(state.session.log).toHaveLength(0);

    state = apply(state, { type: 'continue' });
    const tier = state.session.log[0]?.tier;
    expect(state.session.byTier[tier ?? 'trash']).toBe(1);
    expect(biggestCatch(state)).not.toBeNull();
    expect(state.session.log).toHaveLength(1);
  });

  it('counts a heavy catch and reports it for the payout', () => {
    let state = createState({
      rng: sequenceRng([0.91, 0.91, 0.0]),
      startRank: 5,
    });
    state = toHooked(state);

    expect(state.onTheLine?.kind).toBe('heavy');

    state = answerAndClaim(state, 0);

    expect(state.session.log[0]?.kind).toBe('heavy');
    expect(toSessionResult(state).heavyCatches).toBe(1);
    expect(state.session.haulLbs).toBeGreaterThanOrEqual(500_000);
  });

  it('keeps a pack ticket that was landed', () => {
    let state = createState({ rng: sequenceRng([0.97, 0.99]) });
    state = toHooked(state);
    expect(state.onTheLine?.kind).toBe('pack_ticket');

    state = apply(
      state,
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
      { type: 'answer_hold_done', now: NOW },
      { type: 'reel_finished' },
    );

    expect(state.reveal?.kind).toBe('pack_ticket');
    expect(state.session.packTickets).toBe(0);

    state = apply(state, { type: 'continue' });
    expect(state.session.packTickets).toBe(1);
    expect(toSessionResult(state).packTickets).toBe(1);
  });

  it('reveals the biggest catch of the landing', () => {
    let state = createState({
      rng: sequenceRng([0.1, 0.0, 0.0, 0.1, 0.9, 0.9]),
      startRank: 5,
      now: NOW,
    });
    state = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'double_hook' } },
    };

    state = apply(state, { type: 'cast' }, { type: 'cast_landed' }, { type: 'bite' });
    state = apply(
      state,
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
      { type: 'answer_hold_done', now: NOW },
      { type: 'reel_finished' },
    );

    expect(state.landing).toHaveLength(2);
    const weights = state.landing
      .filter((entry) => entry.kind === 'fish' || entry.kind === 'critter' || entry.kind === 'junk' || entry.kind === 'heavy')
      .map((entry) => entry.lbs);
    expect(state.reveal?.kind).not.toBeUndefined();
    if (state.reveal !== null && (state.reveal.kind === 'fish' || state.reveal.kind === 'critter' || state.reveal.kind === 'junk' || state.reveal.kind === 'heavy')) {
      expect(state.reveal.lbs).toBe(Math.max(...weights));
    }
  });

  it('loses a pack ticket when the answer is wrong', () => {
    let state = createState({ rng: sequenceRng([0.97, 0.99]) });
    state = toHooked(state);
    state = apply(
      state,
      { type: 'reel' },
      { type: 'answer', choiceIndex: 1, durationMs: 500, now: NOW },
      { type: 'answer_hold_done', now: NOW + WRONG_LOCKOUT_MS },
      { type: 'continue' },
    );

    expect(state.session.packTickets).toBe(0);
    expect(state.phase).toBe('idle');
  });

  it('rolls a bonus card at rank 1', () => {
    const state = createState({
      rng: sequenceRng([0.5, 0.0, 0.0]),
      queue: [makeQueueItem('bonus-1', { bonus: true, kind: 'bonus' })],
      startRank: 5,
    });

    const hooked = toHooked(state);
    expect(hooked.question?.bonus).toBe(true);
    expect(hooked.session.roll.lureRank).toBe(5);
    if (hooked.onTheLine?.kind === 'junk') {
      expect(hooked.onTheLine.tier).toBe('trash');
    }
  });

  it('refills the queue when it runs dry', () => {
    const refill = makeQueueItem('refilled');
    let state = createState({
      rng: createSeededRng(2),
      queue: [makeQueueItem('only-one')],
      refillQueue: () => [refill],
    });

    state = toHooked(state);
    expect(state.question?.cardId).toBe('only-one');

    state = answerAndClaim(state, 0);
    state = toHooked(state);

    expect(state.question?.cardId).toBe('refilled');
  });

  it('survives an empty queue', () => {
    let state = createState({ queue: [] });
    state = toHooked(state);

    expect(state.question).toBeNull();
    expect(state.currentItem).toBeNull();
  });

  it('replaces the queue while it is idle', () => {
    let state = createState();
    state = apply(state, { type: 'set_queue', queue: [makeQueueItem('fresh')] });
    expect(state.session.queue).toHaveLength(1);
    expect(remainingCards(state)).toBe(1);

    state = toHooked(state);
    const ignored = apply(state, { type: 'set_queue', queue: [] });
    expect(ignored.session.queue).toHaveLength(1);
  });

  it('asks for the end and comes back', () => {
    let state = createState();
    state = apply(state, { type: 'request_end' });
    expect(state.phase).toBe('end_confirm');
    expect(state.resumePhase).toBe('idle');

    state = apply(state, { type: 'cancel_end' });
    expect(state.phase).toBe('idle');
    expect(state.ended).toBe(false);
  });

  it('ends the session', () => {
    let state = createState();
    state = apply(state, { type: 'request_end' }, { type: 'confirm_end' });
    expect(state.ended).toBe(true);
    expect(state.phase).toBe('end_confirm');
  });

  it('ignores the events that do not fit the phase', () => {
    const state = createState();
    const casting = fishingReducer(state, { type: 'cast' });
    expect(casting.phase).toBe('casting');
    expect(fishingReducer(casting, { type: 'cast' })).toBe(casting);
    expect(fishingReducer(state, { type: 'bite' })).toBe(state);
    expect(fishingReducer(state, { type: 'cast_landed' })).toBe(state);
    expect(fishingReducer(state, { type: 'reel' })).toBe(state);
    expect(fishingReducer(state, { type: 'answer', choiceIndex: 0, durationMs: 1, now: NOW })).toBe(state);
    expect(fishingReducer(state, { type: 'answer_hold_done' })).toBe(state);
    expect(fishingReducer(state, { type: 'reel_finished' })).toBe(state);
    expect(fishingReducer(state, { type: 'continue' })).toBe(state);
    expect(fishingReducer(state, { type: 'cancel_end' })).toBe(state);
    expect(fishingReducer(state, { type: 'confirm_end' })).toBe(state);
  });

  it('ignores a second end request', () => {
    const state = apply(createState(), { type: 'request_end' });
    expect(fishingReducer(state, { type: 'request_end' })).toBe(state);
  });

  it('builds the result of the session', () => {
    let state = createState();
    state = toHooked(state);
    state = answerAndClaim(state, 0);

    const result = toSessionResult(state);
    expect(result.mode).toBe('fishing');
    expect(result.correct).toBe(1);
    expect(result.answered).toBe(1);
    expect(result.catches).toBe(1);
    expect(result.haulLbs).toBeGreaterThan(0);
    expect(result.reviews).toHaveLength(1);
    expect(result.log).toHaveLength(1);
    expect(result.critters).toEqual([]);
  });

  it('keeps the critters that were caught, without granting them', () => {
    let state = createState({ rng: sequenceRng([0.5, 0.0, 0.5]), startRank: 2, now: NOW });
    state = toHooked(state);
    state = answerAndClaim(state, 0);

    expect(state.session.critters).toHaveLength(1);
    const critter = state.session.critters[0]!;
    expect(critter.critterId).toBe('nibbles_the_notecard');
    expect(critter.rarity).toBe('common');
    expect(critter.tier).toBe('easy');

    const result = toSessionResult(state);
    expect(result.critters.map((entry) => entry.critterId)).toEqual(['nibbles_the_notecard']);
    expect(result.haulLbs).toBeGreaterThan(0);
  });

  it('only catches the critters of the packs that are on sale', () => {
    const closed = createState({
      rng: sequenceRng([0.5, 0.0, 0.5]),
      startRank: 2,
      now: Date.UTC(2026, 11, 24),
    });
    const hooked = toHooked(closed);
    expect(hooked.onTheLine?.kind).toBe('critter');
    if (hooked.onTheLine?.kind === 'critter') {
      expect(hooked.onTheLine.critter.packId).toBe('brain_buddies');
    }
  });

  it('starts at the rank of the equipped starting lure', () => {
    const state = createState({ startRank: 3 });
    expect(state.session.roll.lureRank).toBe(3);
  });

  it('keeps the number of remaining cards', () => {
    const state = createState();
    expect(remainingCards(state)).toBe(2);
    const hooked = toHooked(state);
    expect(remainingCards(hooked)).toBe(1);
  });

  it('keeps the joke of a silly catch', () => {
    const junk = createState({ rng: sequenceRng([0.1, 0.0, 0.0]) });
    const hookedJunk = toHooked(junk);
    expect(hookedJunk.onTheLine?.kind).toBe('junk');

    const landedJunk = answerAndClaim(hookedJunk, 0);
    expect(landedJunk.session.log[0]?.joke).toBeDefined();
  });

  it('upgrades the lure when the New Lure is claimed, not when it bites', () => {
    const state = createState({ rng: sequenceRng([0.97, 0.1, 0.5]), now: NOW });
    const hooked = toHooked(state);
    expect(hooked.onTheLine).toEqual({ kind: 'new_lure' });
    expect(hooked.session.roll.lureRank).toBe(1);

    const claimed = answerAndClaim(hooked, 0);
    expect(claimed.session.roll.lureRank).toBe(2);
    expect(claimed.session.roll.luresReeledUp).toBe(1);
  });

  it('rolls the hooked catch at the current lure, for due and bonus cards', () => {
    for (const startRank of [1, 2, 3, 4, 5]) {
      for (const bonus of [false, true]) {
        const tiers = new Set<string>();
        for (let seed = 0; seed < 300; seed += 1) {
          const state = createState({
            rng: createSeededRng(seed),
            startRank,
            queue: [makeQueueItem('card-1', { bonus, kind: bonus ? 'bonus' : 'due' })],
          });
          const hooked = toHooked(state);
          expect(hooked.session.roll.lureRank).toBe(startRank);
          const line = hooked.onTheLine;
          if (line !== null && isCatchOutcome(line) && line.kind !== 'critter') {
            tiers.add(line.tier);
          }
        }
        // Trash only swims at lures F, D and C (ranks 1-3).
        expect(tiers.has('trash')).toBe(startRank <= 3);
        // Epic Grab starts at lure C.
        if (startRank <= 2) {
          expect(tiers.has('epic')).toBe(false);
        }
      }
    }
  });

  it('starts a Frenzy when it is claimed, not when it bites', () => {
    const state = createState({ rng: sequenceRng([0.97, 0.35, 0.5]), now: NOW });
    const hooked = toHooked(state);
    expect(hooked.onTheLine).toEqual({ kind: 'frenzy' });
    expect(hooked.session.roll.frenzyCatchesLeft).toBe(0);
    expect(answerAndClaim(hooked, 0).session.roll.frenzyCatchesLeft).toBeGreaterThan(0);
  });

  it('lands a catch without a joke', () => {
    const state = createState({ rng: sequenceRng([0.5, 0.0, 0.5]), startRank: 2, now: NOW });
    const landed = answerAndClaim(toHooked(state), 0);

    expect(landed.session.log[0]?.name).toBe('Nibbles the Notecard');
    expect(landed.session.log[0]?.joke).toBeUndefined();
  });

  it('starts without a queue', () => {
    const state = createFishingState({ rng: createSeededRng(1) });
    expect(state.session.queue).toEqual([]);
    expect(remainingCards(state)).toBe(0);
  });

  it('starts with the scheduling states of the cards', () => {
    const state = createFishingState({
      rng: createSeededRng(1),
      cardStates: [['card-1', cardState({ state: State.Review })]],
    });

    expect(state.session.cardStates.get('card-1')).toBeDefined();
  });

  it('copes with a card that has no choices and no answer', () => {
    const state = createFishingState({
      rng: createSeededRng(3),
      queue: [makeQueueItem('broken', { choices: null, answerIndex: null })],
    });

    const hooked = toHooked(state);
    expect(hooked.question?.choices).toEqual([]);
    expect(hooked.question?.answerIndex).toBe(-1);

    const answered = apply(hooked, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    expect(answered.phase).toBe('answered');
    expect(answered.feedback?.correct).toBe(false);
  });

  it('lands a special catch', () => {
    // The tier roll lands on the special table and the special is a new lure.
    const state = createState({ rng: sequenceRng([0.97, 0.1]) });
    const landed = answerAndClaim(toHooked(state), 0);

    expect(landed.session.catches).toBe(0);
    expect(landed.session.haulLbs).toBe(0);
    expect(landed.session.roll.lureRank).toBe(2);
  });

  it('lands a second catch with the Double Hook only when it is a catch', () => {
    // The first roll is a fish, the second (the Double Hook) is a special.
    const state = createState({ rng: sequenceRng([0.1, 0.0, 0.0, 0.97, 0.1]) });
    const withHook: FishingState = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'double_hook' } },
    };

    const answered = answer(toHooked(withHook), 0);

    expect(answered.landing).toHaveLength(1);
  });

  it('ignores an answer when there is no card', () => {
    let state = createState({ queue: [] });
    state = toHooked(state);
    state = apply(state, { type: 'reel' });

    const answered = apply(state, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    expect(answered).toBe(state);
  });

  it('survives a broken lure rank', () => {
    const state = createState({ startRank: Number.NaN });
    expect(state.session.roll.lureRank).toBe(1);
  });

  it('gives a critter the full lead-up and a junk catch the short one', () => {
    const critter = createState({ rng: sequenceRng([0.5, 0.0, 0.5]), startRank: 2, now: NOW });
    const landedCritter = answerAndReveal(toHooked(critter), 0);
    expect(leadUpOf(landedCritter).durationMs).toBe(LEAD_UP_FULL_MS);
    expect(leadUpOf(landedCritter).escaped).toBe(false);

    const junk = createState({ rng: sequenceRng([0.1, 0.0, 0.0]) });
    const landedJunk = answerAndReveal(toHooked(junk), 0);
    expect(leadUpOf(landedJunk).durationMs).toBe(LEAD_UP_SHORT_MS);
    expect(leadUpOf(landedJunk).escaped).toBe(false);
  });

  it('gives a wrong answer the short lead-up', () => {
    let state = toHooked(createState());
    state = answer(state, 3);
    state = apply(state, { type: 'answer_hold_done', now: NOW + WRONG_LOCKOUT_MS });

    expect(state.phase).toBe('got_away');
    expect(leadUpOf(state).escaped).toBe(true);
    expect(leadUpOf(state).durationMs).toBe(LEAD_UP_SHORT_MS);
  });

  it('lets the player retry after a second chance, without a lockout', () => {
    let state = createState();
    state = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'second_chance' } },
    };
    state = toHooked(state);
    state = answer(state, 2);

    state = apply(state, { type: 'answer_hold_done', now: NOW });
    expect(state.phase).toBe('question');
    expect(state.question?.cardId).toBe('card-1');
    expect(state.feedback?.retry).toBe(true);
  });
});

describe('the mastery badge', () => {
  it('is unknown without a scheduling state', () => {
    expect(masteryStatusOf(undefined)).toBe('unknown');
    expect(masteryStatusOf(null)).toBe('unknown');
    expect(masteryStatusOf(cardState({ state: State.New, reps: 0 }))).toBe('unknown');
  });

  it('is familiar for a card that is still being learned', () => {
    expect(masteryStatusOf(cardState({ state: State.Learning, stability: 2 }))).toBe('familiar');
    expect(masteryStatusOf(cardState({ state: State.Relearning, stability: 4 }))).toBe('familiar');
    expect(masteryStatusOf(cardState({ state: State.Review, stability: 5 }))).toBe('familiar');
  });

  it('is mastered for a long-lived review card', () => {
    expect(masteryStatusOf(cardState({ state: State.Review, stability: 21 }))).toBe('mastered');
    expect(masteryStatusOf(cardState({ state: State.Review, stability: 90 }))).toBe('mastered');
  });
});
