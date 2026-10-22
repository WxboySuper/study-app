import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  biggestCatch,
  createFishingState,
  fishingReducer,
  remainingCards,
  toSessionResult,
  type FishingEvent,
  type FishingState,
} from '../../src/fishing/machine';
import { createSeededRng } from '../../src/fishing/roll';
import { makeQueueItem, sequenceRng } from './helpers';

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

function createState(overrides: Partial<Parameters<typeof createFishingState>[0]> = {}): FishingState {
  return createFishingState({
    rng: createSeededRng(1),
    queue: [makeQueueItem('card-1'), makeQueueItem('card-2')],
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

describe('the fishing machine', () => {
  it('starts on the dock', () => {
    const state = createState();
    expect(state.phase).toBe('idle');
    expect(state.session.haulLbs).toBe(0);
    expect(state.session.correct).toBe(0);
    expect(state.ended).toBe(false);
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
    expect(state.phase).toBe('reeling');

    state = apply(state, { type: 'reel_finished' });
    expect(state.phase).toBe('reveal');
    expect(state.session.catches).toBe(1);
    expect(state.session.haulLbs).toBeGreaterThan(0);

    state = apply(state, { type: 'continue' });
    expect(state.phase).toBe('idle');
    expect(state.question).toBeNull();
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

  it('asks the next card after every catch', () => {
    let state = createState();
    state = toHooked(state);
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' }, { type: 'continue' });
    state = toHooked(state);

    expect(state.question?.cardId).toBe('card-2');
  });

  it('loses the catch when the answer is wrong', () => {
    let state = createState();
    state = toHooked(state);
    state = apply(state, { type: 'reel' });
    state = apply(state, { type: 'answer', choiceIndex: 2, durationMs: 4_000, now: NOW });

    expect(state.phase).toBe('got_away');
    expect(state.feedback?.correct).toBe(false);
    expect(state.feedback?.answerIndex).toBe(0);

    state = apply(state, { type: 'reel_finished' }, { type: 'continue' });
    expect(state.session.catches).toBe(0);
    expect(state.session.haulLbs).toBe(0);
    expect(state.session.streak).toBe(0);
  });

  it('grades a wrong answer as "Again"', () => {
    let state = createState();
    state = toHooked(state);
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 3, durationMs: 500, now: NOW });

    const review = state.session.reviews[0];
    expect(review?.rating).toBe(Rating.Again);
    expect(review?.cardId).toBe('card-1');
    expect(review?.durationMs).toBe(500);
    expect(state.session.answered).toBe(1);
    expect(state.session.correct).toBe(0);
  });

  it('grades a fast streak as "Easy"', () => {
    let state = createState({
      queue: [makeQueueItem('a'), makeQueueItem('b'), makeQueueItem('c'), makeQueueItem('d')],
    });

    for (let index = 0; index < 4; index += 1) {
      state = toHooked(state);
      state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 1_000, now: NOW });
      state = apply(state, { type: 'reel_finished' }, { type: 'continue' });
    }

    // The streak has to be three long before an answer can be an "Easy".
    expect(state.session.reviews.map((review) => review.rating)).toEqual([
      Rating.Good,
      Rating.Good,
      Rating.Good,
      Rating.Easy,
    ]);
    expect(state.session.bestStreak).toBe(4);
  });

  it('grades a slow answer as "Hard"', () => {
    let state = createState();
    state = toHooked(state);
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
    state = apply(state, { type: 'reel' });
    state = apply(state, { type: 'answer', choiceIndex: 1, durationMs: 500, now: NOW });

    expect(state.phase).toBe('question');
    expect(state.feedback?.retry).toBe(true);
    expect(state.session.roll.powerup).toBeNull();
    // The miss is logged even though the fish stays on the line.
    expect(state.session.reviews[0]?.rating).toBe(Rating.Again);

    state = apply(state, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    expect(state.phase).toBe('reeling');
    expect(state.session.correct).toBe(1);
  });

  it('lands two catches with the Double Hook', () => {
    let state = createState();
    state = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'double_hook' } },
    };

    state = toHooked(state);
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    expect(state.landing).toHaveLength(2);

    state = apply(state, { type: 'reel_finished' });
    expect(state.session.catches).toBe(2);
    expect(state.session.roll.powerup).toBeNull();
  });

  it('counts the haul and the tiers of the landed catches', () => {
    let state = createState();
    state = toHooked(state);
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' });

    const tier = state.onTheLine === null ? 'trash' : state.session.log[0]?.tier;
    expect(state.session.byTier[tier ?? 'trash']).toBe(1);
    expect(biggestCatch(state)).not.toBeNull();
    expect(state.session.log).toHaveLength(1);
  });

  it('counts a heavy catch and reports it for the payout', () => {
    let state = createState({ rng: sequenceRng([0.94, 0.0, 0.5]) });
    state = toHooked(state);

    expect(state.onTheLine?.kind).toBe('heavy');

    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' });

    expect(state.session.byTier.heavy).toBe(1);
    expect(toSessionResult(state).heavyCatches).toBe(1);
    // A heavy catch is heavier than every critter catch.
    expect(state.session.haulLbs).toBeGreaterThan(2_500_000);
  });

  it('keeps a pack ticket that was landed', () => {    let state = createState({ rng: sequenceRng([0.97, 0.99]) });
    state = toHooked(state);
    expect(state.onTheLine?.kind).toBe('pack_ticket');

    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' });

    expect(state.session.packTickets).toBe(1);
    expect(toSessionResult(state).packTickets).toBe(1);
    // The reveal card shows the ticket.
    expect(state.reveal?.kind).toBe('pack_ticket');
  });

  it('reveals the biggest catch of the landing', () => {
    let state = createState({ rng: sequenceRng([0.1, 0.0, 0.5]) });
    state = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'double_hook' } },
    };

    state = apply(state, { type: 'cast' }, { type: 'cast_landed' }, { type: 'bite' });
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' });

    expect(state.landing).toHaveLength(2);
    expect(state.reveal).not.toBeNull();
    if (state.reveal?.kind === 'fish') {
      const weights = state.landing
        .filter((entry): entry is Extract<typeof entry, { kind: 'fish' }> => entry.kind === 'fish')
        .map((entry) => entry.lbs);
      expect(state.reveal.lbs).toBe(Math.max(...weights));
    }
  });

  it('loses a pack ticket when the answer is wrong', () => {
    let state = createState({ rng: sequenceRng([0.97, 0.99]) });
    state = toHooked(state);
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 1, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' });

    expect(state.session.packTickets).toBe(0);
  });

  it('rolls a bonus card at rank 1', () => {
    const state = createState({
      rng: sequenceRng([0.1, 0.0, 0.5]),
      queue: [makeQueueItem('bonus-1', { bonus: true, kind: 'bonus' })],
      startRank: 5,
    });

    const hooked = toHooked(state);
    expect(hooked.question?.bonus).toBe(true);
    expect(hooked.session.roll.lureRank).toBe(5);
    if (hooked.onTheLine?.kind === 'fish') {
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

    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' }, { type: 'continue' });
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
    let state = createState({ rng: sequenceRng([0.1, 0.0, 0.5]) });
    state = toHooked(state);
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' });

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

  it('keeps the critters that were caught for the collection', () => {
    // The tier roll lands on "Easy One": the catch is a common critter.
    let state = createState({ rng: sequenceRng([0.5, 0.0, 0.5]), now: NOW });
    state = toHooked(state);
    state = apply(state, { type: 'reel' }, { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW });
    state = apply(state, { type: 'reel_finished' });

    expect(state.session.critters).toHaveLength(1);
    const critter = state.session.critters[0]!;
    expect(critter.critterId).toBe('nibbles_the_notecard');
    expect(critter.rarity).toBe('common');
    expect(critter.tier).toBe('easy');

    // The result of the session carries the critters, so the app can add
    // them to the collection when the session ends.
    const result = toSessionResult(state);
    expect(result.critters.map((entry) => entry.critterId)).toEqual(['nibbles_the_notecard']);
  });

  it('only catches the critters of the packs that are on sale', () => {
    const closed = createState({ rng: sequenceRng([0.5, 0.0, 0.5]), now: Date.UTC(2026, 11, 24) });
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
    const junk = createState({ rng: sequenceRng([0.1, 0.0, 0.5]) });
    const hookedJunk = toHooked(junk);
    expect(hookedJunk.onTheLine?.kind).toBe('junk');

    const landedJunk = apply(
      hookedJunk,
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
      { type: 'reel_finished' },
    );
    expect(landedJunk.session.log[0]?.joke).toBeDefined();
  });

  it('lands a catch without a joke', () => {
    const state = createState({ rng: sequenceRng([0.5, 0.0, 0.5]) });
    const landed = apply(
      toHooked(state),
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
      { type: 'reel_finished' },
    );

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
      cardStates: [['card-1', {
        cardId: 'card-1',
        due: 0,
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        state: 2,
        lastReview: null,
      }]],
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
    // Without an answer there is nothing to get right.
    expect(answered.phase).toBe('got_away');
  });

  it('lands a special catch', () => {
    // The tier roll lands on the special table and the special is a new lure.
    const state = createState({ rng: sequenceRng([0.97, 0.1]) });
    const landed = apply(
      toHooked(state),
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
      { type: 'reel_finished' },
    );

    expect(landed.session.catches).toBe(0);
    expect(landed.session.haulLbs).toBe(0);
    expect(landed.session.roll.lureRank).toBe(2);
  });

  it('lands a second catch with the Double Hook', () => {
    // The first roll is a fish, the second (the Double Hook) is a special.
    const state = createState({ rng: sequenceRng([0.1, 0.0, 0.5, 0.97, 0.1]) });
    const withHook: FishingState = {
      ...state,
      session: { ...state.session, roll: { ...state.session.roll, powerup: 'double_hook' } },
    };

    const answered = apply(
      toHooked(withHook),
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
    );

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
});
