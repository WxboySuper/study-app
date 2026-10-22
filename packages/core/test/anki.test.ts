import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ANKI_SETTINGS,
  Intersperser,
  LearningSteps,
  Rating,
  answerAnkiCard,
  ankiCardFromState,
  buildAnkiQueues,
  burySiblings,
  fsrsIntervalDays,
  learningGapQuestions,
  pickNextAnki,
  removeAnkiCard,
  requeueAnkiCard,
  reviewGapQuestions,
  siblingIds,
  type AnkiCard,
  type AnkiQueue,
  type AnkiSettings,
} from '../src/anki';
import { createSeededRng, type Rng } from '../src/fishing/roll';
import type { CardState } from '../src/types';

/**
 * The tests of the Anki scheduler port.
 *
 * The port keeps Anki's three queues, its learning steps and its sibling
 * burying. These tests pin the parts the session queue relies on: the step
 * arithmetic, the queue order, the minimum gap and the bridge to ts-fsrs.
 */

/** A card of the scheduler. */
function card(id: string, options: Partial<AnkiCard> = {}): AnkiCard {
  return {
    id,
    queue: (options.queue ?? 'new') satisfies AnkiQueue,
    step: options.step ?? DEFAULT_ANKI_SETTINGS.learnStepsMinutes.length,
    dueAt: options.dueAt ?? 0,
    intervalDays: options.intervalDays ?? 0,
    stability: options.stability ?? 0,
    difficulty: options.difficulty ?? 0,
    reps: options.reps ?? 0,
    lapses: options.lapses ?? 0,
    lastReview: options.lastReview ?? null,
    ...(options.siblingKey === undefined ? {} : { siblingKey: options.siblingKey }),
  };
}

/** A random source that always answers the same way. */
function fixedRng(nextValue = 0, intValue?: (min: number, max: number) => number): Rng {
  return {
    next: () => nextValue,
    int: (min, max) => (intValue === undefined ? min : intValue(min, max)),
  };
}

/** The options of an answer. */
function context(options: {
  correct: boolean;
  asked?: number;
  deckSize?: number;
  now?: number;
  rng?: Rng;
  settings?: AnkiSettings;
}) {
  return {
    correct: options.correct,
    asked: options.asked ?? 1,
    deckSize: options.deckSize ?? 100,
    now: options.now ?? 1_000_000,
    rng: options.rng ?? fixedRng(),
    ...(options.settings === undefined ? {} : { settings: options.settings }),
  };
}

/** A persisted state of a test card. */
function state(options: Partial<CardState> = {}): CardState {
  return {
    cardId: 'a',
    due: 0,
    stability: 10,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 2,
    learningSteps: 0,
    reps: 2,
    lapses: 0,
    state: 2,
    lastReview: 0,
    ...options,
  };
}

describe('Intersperser', () => {
  it('returns nothing when both lists are empty', () => {
    expect(new Intersperser([], []).next()).toBeUndefined();
    expect(new Intersperser([], []).toArray()).toEqual([]);
  });

  it('drains a single list', () => {
    expect(new Intersperser(['a', 'b'], []).toArray()).toEqual(['a', 'b']);
    expect(new Intersperser([], ['x', 'y']).toArray()).toEqual(['x', 'y']);
  });

  it('mixes the two lists in the ratio of their lengths', () => {
    const mixed = new Intersperser(['a', 'b', 'c'], ['x']).toArray();

    expect(mixed).toHaveLength(4);
    expect([...mixed].sort()).toEqual(['a', 'b', 'c', 'x']);
    // The list with three items is not drained before the single one.
    expect(mixed.indexOf('x')).toBeLessThan(mixed.length - 1);
  });
});

describe('LearningSteps', () => {
  const two = new LearningSteps([1, 10]);

  it('knows its length and whether it is empty', () => {
    expect(two.length).toBe(2);
    expect(two.isEmpty).toBe(false);
    expect(new LearningSteps([]).isEmpty).toBe(true);
  });

  it('reads the delay of Again, Good and Hard', () => {
    expect(two.againDelaySeconds()).toBe(60);
    expect(two.goodDelaySeconds(2)).toBe(600);
    expect(two.goodDelaySeconds(1)).toBeUndefined();
    expect(two.hardDelaySeconds(2)).toBe(330);
    expect(two.hardDelaySeconds(1)).toBe(600);
    expect(two.currentDelaySeconds(2)).toBe(60);
    expect(two.currentDelaySeconds(1)).toBe(600);
  });

  it('rounds a long hard delay to whole days', () => {
    const long = new LearningSteps([1500]);
    // 25 hours, plus half of it, rounds up to two days.
    expect(long.hardDelaySeconds(1)).toBe(2 * 86_400);
  });

  it('handles a single short step', () => {
    const single = new LearningSteps([10]);
    expect(single.hardDelaySeconds(1)).toBe(900);
    expect(single.againDelaySeconds()).toBe(600);
  });

  it('handles an empty list', () => {
    const empty = new LearningSteps([]);
    expect(empty.againDelaySeconds()).toBeUndefined();
    expect(empty.goodDelaySeconds(1)).toBeUndefined();
    expect(empty.hardDelaySeconds(1)).toBeUndefined();
    expect(empty.currentDelaySeconds(1)).toBe(0);
  });

  it('counts the remaining steps', () => {
    expect(two.remainingForGood(2)).toBe(1);
    expect(two.remainingForGood(1)).toBe(0);
    expect(two.remainingForFailed()).toBe(2);
  });
});

describe('sibling burying', () => {
  const cards = {
    a: card('a', { siblingKey: 'note' }),
    b: card('b', { siblingKey: 'note' }),
    c: card('c', { siblingKey: 'other' }),
    d: card('d'),
  };

  it('finds every card of a note', () => {
    expect(siblingIds(cards, 'a').sort()).toEqual(['a', 'b']);
    expect(siblingIds(cards, 'd')).toEqual([]);
    expect(siblingIds(cards, 'missing')).toEqual([]);
  });

  it('buries the siblings of a shown card once', () => {
    expect(burySiblings(cards, 'a', [])).toEqual(['b']);
    expect(burySiblings(cards, 'a', ['b'])).toEqual(['b']);
    expect(burySiblings(cards, 'd', [])).toEqual([]);
    expect(burySiblings(cards, 'missing', [])).toEqual([]);
  });
});

describe('the question gaps', () => {
  it('maps learning minutes to questions', () => {
    expect(learningGapQuestions(0, 100)).toBe(3);
    expect(learningGapQuestions(60, 100)).toBe(3);
    expect(learningGapQuestions(600, 100)).toBe(10);
    expect(learningGapQuestions(3600, 100)).toBe(35);
    expect(learningGapQuestions(-10, 100)).toBe(3);
  });

  it('shrinks the gap on a tiny deck', () => {
    expect(learningGapQuestions(600, 2)).toBe(1);
    expect(learningGapQuestions(600, 0)).toBe(1);
  });

  it('maps a review interval to a long question gap', () => {
    expect(reviewGapQuestions(0, 100)).toBe(75);
    expect(reviewGapQuestions(1, 100)).toBe(95);
    expect(reviewGapQuestions(-3, 100)).toBe(75);
    expect(reviewGapQuestions(10_000, 100)).toBe(400);
  });

  it('handles a tiny deck in the review gap', () => {
    expect(reviewGapQuestions(0, 0)).toBe(30);
    expect(reviewGapQuestions(1, 1)).toBe(35);
  });
});

describe('ankiCardFromState', () => {
  it('makes a new card out of no state', () => {
    const created = ankiCardFromState('a', undefined, DEFAULT_ANKI_SETTINGS, 1000, 10, 'note');

    expect(created.queue).toBe('new');
    expect(created.step).toBe(2);
    expect(created.dueAt).toBe(0);
    expect(created.intervalDays).toBe(0);
    expect(created.siblingKey).toBe('note');
  });

  it('keeps a card that has not started learning new', () => {
    expect(ankiCardFromState('a', state({ state: 0 }), DEFAULT_ANKI_SETTINGS, 1000, 10).queue).toBe(
      'new',
    );
  });

  it('puts a learning card back in the learning queue', () => {
    const created = ankiCardFromState(
      'a',
      state({ state: 1, due: 1000 + 60_000, learningSteps: 0 }),
      DEFAULT_ANKI_SETTINGS,
      1000,
      100,
    );

    expect(created.queue).toBe('learning');
    expect(created.step).toBe(2);
    expect(created.dueAt).toBe(3);
  });

  it('makes a learning card that is already due eligible now', () => {
    const created = ankiCardFromState(
      'a',
      state({ state: 1, due: 500, learningSteps: 1 }),
      DEFAULT_ANKI_SETTINGS,
      1000,
      100,
    );

    expect(created.queue).toBe('learning');
    expect(created.step).toBe(1);
    expect(created.dueAt).toBe(0);
  });

  it('uses the relearning steps after a lapse', () => {
    const created = ankiCardFromState(
      'a',
      state({ state: 3, due: 1000 + 60_000, learningSteps: 0 }),
      DEFAULT_ANKI_SETTINGS,
      1000,
      100,
    );

    expect(created.queue).toBe('learning');
    expect(created.step).toBe(1);
    expect(created.dueAt).toBe(3);
  });

  it('puts a due review card at the front of the session', () => {
    const created = ankiCardFromState(
      'a',
      state({ state: 2, due: 500 }),
      DEFAULT_ANKI_SETTINGS,
      1000,
      100,
    );

    expect(created.queue).toBe('review');
    expect(created.step).toBe(0);
    expect(created.dueAt).toBe(0);
  });

  it('parks a review card that is due in a few days', () => {
    const created = ankiCardFromState(
      'a',
      state({ state: 2, due: 1000 + 2 * 86_400_000, scheduledDays: 2 }),
      DEFAULT_ANKI_SETTINGS,
      1000,
      100,
    );

    expect(created.queue).toBe('review');
    expect(created.dueAt).toBe(reviewGapQuestions(2, 100));
  });
});

describe('buildAnkiQueues', () => {
  it('splits the cards into the three queues and sorts the due ones', () => {
    const queues = buildAnkiQueues(
      {
        a: card('a', { queue: 'new' }),
        b: card('b', { queue: 'new' }),
        c: card('c', { queue: 'learning', dueAt: 5 }),
        d: card('d', { queue: 'learning', dueAt: 1 }),
        e: card('e', { queue: 'review', dueAt: 9 }),
        f: card('f', { queue: 'review', dueAt: 2 }),
      },
      fixedRng(),
    );

    expect(queues.newIds.sort()).toEqual(['a', 'b']);
    expect(queues.learning).toEqual([
      { id: 'd', dueAt: 1 },
      { id: 'c', dueAt: 5 },
    ]);
    expect(queues.review).toEqual([
      { id: 'f', dueAt: 2 },
      { id: 'e', dueAt: 9 },
    ]);
    expect(queues.buried).toEqual([]);
    expect(queues.sinceNew).toBe(0);
  });

  it('copes with an empty deck', () => {
    expect(buildAnkiQueues({}, fixedRng())).toEqual({
      newIds: [],
      learning: [],
      review: [],
      buried: [],
      sinceNew: 0,
    });
  });
});

describe('pickNextAnki', () => {
  /** The options of a pick. */
  function pickOptions(overrides: Partial<Parameters<typeof pickNextAnki>[4]> = {}) {
    return {
      settings: DEFAULT_ANKI_SETTINGS,
      endless: true,
      lastAskedId: null,
      ...overrides,
    };
  }

  it('shows a due learning card before the main queue', () => {
    const cards = {
      a: card('a', { queue: 'learning', dueAt: 1 }),
      b: card('b'),
    };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 0, fixedRng(), pickOptions());

    expect(pick?.id).toBe('a');
    expect(pick?.group).toBe('learning');
  });

  it('picks a new card while the learning card is not due', () => {
    const cards = {
      a: card('a', { queue: 'learning', dueAt: 5 }),
      b: card('b'),
    };
    const queues = buildAnkiQueues(cards, fixedRng());

    expect(pickNextAnki(cards, queues, 0, fixedRng(), pickOptions())?.id).toBe('b');
  });

  it('picks a review card when every card is a review', () => {
    const cards = {
      a: card('a', { queue: 'review', dueAt: 0, stability: 5 }),
      b: card('b', { queue: 'review', dueAt: 0, stability: 5 }),
    };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 0, fixedRng(), pickOptions());

    expect(pick?.group).toBe('review');
    expect(['a', 'b']).toContain(pick?.id);
  });

  it('guarantees a new card after two other picks', () => {
    const cards = {
      a: card('a'),
      b: card('b', { queue: 'review', dueAt: 0, stability: 5 }),
    };
    const queues = { ...buildAnkiQueues(cards, fixedRng()), sinceNew: 2 };

    // Even a random source that would choose the review card yields a new one.
    const pick = pickNextAnki(cards, queues, 0, fixedRng(0.99), pickOptions());

    expect(pick?.group).toBe('new');
    expect(pick?.id).toBe('a');
  });

  it('mixes new and review cards when both queues have cards', () => {
    const cards = {
      a: card('a'),
      b: card('b', { queue: 'review', dueAt: 0, stability: 5 }),
    };
    const queues = buildAnkiQueues(cards, fixedRng());

    const newPick = pickNextAnki(cards, queues, 0, fixedRng(0.1), pickOptions());
    const reviewPick = pickNextAnki(cards, queues, 0, fixedRng(0.9), pickOptions());

    expect(newPick?.group).toBe('new');
    expect(reviewPick?.group).toBe('review');
  });

  it('keeps the minimum gap between two serves of one card', () => {
    const cards = { a: card('a'), b: card('b') };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 2, fixedRng(), {
      ...pickOptions(),
      lastAskedId: 'a',
      askedAt: { a: 1 },
      minGap: 3,
    });

    expect(pick?.id).toBe('b');
  });

  it('falls back to the queue when every card is inside the gap', () => {
    const cards = { a: card('a'), b: card('b') };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 1, fixedRng(), {
      ...pickOptions(),
      lastAskedId: 'a',
      askedAt: { a: 1, b: 1 },
      minGap: 3,
    });

    expect(pick).not.toBeNull();
  });

  it('never serves the same card twice in a row when another one is available', () => {
    const cards = { a: card('a'), b: card('b') };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 0, fixedRng(), {
      ...pickOptions(),
      lastAskedId: 'a',
    });

    expect(pick?.id).toBe('b');
  });

  it('serves the only card of a one-card deck again', () => {
    const cards = { only: card('only') };
    const queues = buildAnkiQueues(cards, fixedRng());

    expect(
      pickNextAnki(cards, queues, 0, fixedRng(), {
        ...pickOptions(),
        lastAskedId: 'only',
      })?.id,
    ).toBe('only');
  });

  it('skips mastered and buried cards', () => {
    const cards = { a: card('a'), b: card('b') };
    const queues = { ...buildAnkiQueues(cards, fixedRng()), buried: ['a'] };

    expect(pickNextAnki(cards, queues, 0, fixedRng(), pickOptions({ mastered: { a: true } }))?.id).toBe(
      'b',
    );
    expect(pickNextAnki(cards, queues, 0, fixedRng(), pickOptions())?.id).toBe('b');
  });

  it('has nothing to pick when every card is mastered', () => {
    const cards = { a: card('a') };
    const queues = buildAnkiQueues(cards, fixedRng());

    expect(
      pickNextAnki(cards, queues, 0, fixedRng(), pickOptions({ mastered: { a: true } })),
    ).toBeNull();
  });

  it('pulls a learning card that is only slightly ahead', () => {
    const cards = { a: card('a', { queue: 'learning', dueAt: 5 }) };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 0, fixedRng(), pickOptions());

    expect(pick?.id).toBe('a');
    expect(pick?.group).toBe('learning');
  });

  it('pulls the next review card forward in endless mode', () => {
    const cards = { a: card('a', { queue: 'review', dueAt: 50, stability: 5 }) };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 0, fixedRng(), pickOptions());

    expect(pick?.id).toBe('a');
    expect(pick?.group).toBe('review');
  });

  it('ignores a queue entry that has no card', () => {
    const cards = { a: card('a') };
    const queues = { ...buildAnkiQueues(cards, fixedRng()), newIds: ['ghost'] };

    expect(pickNextAnki(cards, queues, 0, fixedRng(), pickOptions())).toBeNull();
  });

  it('buries the siblings of the card it picks', () => {
    const cards = {
      a: card('a', { siblingKey: 'note' }),
      b: card('b', { siblingKey: 'note' }),
    };
    const queues = buildAnkiQueues(cards, fixedRng());

    const pick = pickNextAnki(cards, queues, 0, fixedRng(), {
      ...pickOptions(),
      lastAskedId: null,
    });

    expect(pick).not.toBeNull();
    const other = pick?.id === 'a' ? 'b' : 'a';
    expect(pick?.queues.buried).toContain(other);
  });

  it('resets the new-card counter on a new pick and grows it otherwise', () => {
    const cards = {
      a: card('a'),
      b: card('b', { queue: 'review', dueAt: 0, stability: 5 }),
    };
    const queues = buildAnkiQueues(cards, fixedRng());

    expect(pickNextAnki(cards, queues, 0, fixedRng(0.1), pickOptions())?.queues.sinceNew).toBe(0);
    expect(pickNextAnki(cards, queues, 0, fixedRng(0.9), pickOptions())?.queues.sinceNew).toBe(1);
  });

  it('shows a well-known review card only rarely', () => {
    const cards = {
      known: card('known', { queue: 'review', dueAt: 0, stability: 60 }),
      normal: card('normal', { queue: 'review', dueAt: 0, stability: 5 }),
    };
    const queues = buildAnkiQueues(cards, fixedRng());

    const rare = pickNextAnki(cards, queues, 0, fixedRng(0.1), pickOptions());
    const usual = pickNextAnki(cards, queues, 0, fixedRng(0.9), pickOptions());

    expect(rare?.id).toBe('known');
    expect(usual?.id).toBe('normal');
  });

  it('picks a well-known card when there is nothing else', () => {
    const cards = { known: card('known', { queue: 'review', dueAt: 0, stability: 60 }) };
    const queues = buildAnkiQueues(cards, fixedRng());

    expect(pickNextAnki(cards, queues, 0, fixedRng(), pickOptions())?.id).toBe('known');
  });
});

describe('requeueAnkiCard', () => {
  it('puts a learning card back in the learning queue', () => {
    const queues = buildAnkiQueues({}, fixedRng());
    const next = requeueAnkiCard(queues, card('a', { queue: 'learning', dueAt: 4 }), 'learning');

    expect(next.learning).toEqual([{ id: 'a', dueAt: 4 }]);
  });

  it('puts a review card back in the review queue', () => {
    const queues = buildAnkiQueues({}, fixedRng());
    const next = requeueAnkiCard(queues, card('a', { queue: 'review', dueAt: 30 }), 'review');

    expect(next.review).toEqual([{ id: 'a', dueAt: 30 }]);
  });

  it('leaves a new card out of both queues', () => {
    const queues = {
      newIds: ['a'],
      learning: [{ id: 'a', dueAt: 1 }],
      review: [{ id: 'a', dueAt: 2 }],
      buried: [],
      sinceNew: 0,
    };

    const next = requeueAnkiCard(queues, card('a'), 'new');

    expect(next.newIds).toEqual([]);
    expect(next.learning).toEqual([]);
    expect(next.review).toEqual([]);
  });

  it('removes a card from every queue', () => {
    const queues = {
      newIds: ['a', 'b'],
      learning: [{ id: 'a', dueAt: 1 }],
      review: [{ id: 'a', dueAt: 2 }],
      buried: ['a'],
      sinceNew: 0,
    };

    expect(removeAnkiCard(queues, 'a')).toEqual({
      newIds: ['b'],
      learning: [],
      review: [],
      buried: [],
      sinceNew: 0,
    });
  });
});

describe('answerAnkiCard', () => {
  it('sends a missed new card to the short relearn step', () => {
    const result = answerAnkiCard(card('a'), context({ correct: false }));

    expect(result.card.queue).toBe('learning');
    expect(result.card.step).toBe(2);
    expect(result.card.reps).toBe(1);
    expect(result.gap).toBeGreaterThanOrEqual(3);
    expect(result.gap).toBeLessThanOrEqual(5);
    expect(result.graduated).toBe(false);
  });

  it('moves a new card to the first learning step', () => {
    const result = answerAnkiCard(card('a'), context({ correct: true }));

    expect(result.card.queue).toBe('learning');
    expect(result.card.step).toBe(1);
    expect(result.card.intervalDays).toBe(0);
    expect(result.gap).toBeGreaterThanOrEqual(10);
    expect(result.graduated).toBe(false);
  });

  it('graduates a new card from its last learning step', () => {
    const result = answerAnkiCard(card('a', { step: 1 }), context({ correct: true }));

    expect(result.card.queue).toBe('review');
    expect(result.card.intervalDays).toBeGreaterThanOrEqual(1);
    expect(result.card.stability).toBeGreaterThan(0);
    expect(result.graduated).toBe(true);
  });

  it('graduates a new card when there are no learning steps', () => {
    const settings: AnkiSettings = { ...DEFAULT_ANKI_SETTINGS, learnStepsMinutes: [] };
    const result = answerAnkiCard(card('a', { step: 0 }), context({ correct: true, settings }));

    expect(result.card.queue).toBe('review');
    expect(result.graduated).toBe(true);
  });

  it('moves a learning card along its steps', () => {
    const result = answerAnkiCard(
      card('a', { queue: 'learning', step: 2, reps: 1 }),
      context({ correct: true }),
    );

    expect(result.card.queue).toBe('learning');
    expect(result.card.step).toBe(1);
    expect(result.graduated).toBe(false);
  });

  it('graduates a learning card after its last step', () => {
    const result = answerAnkiCard(
      card('a', { queue: 'learning', step: 1, reps: 1 }),
      context({ correct: true }),
    );

    expect(result.card.queue).toBe('review');
    expect(result.graduated).toBe(true);
  });

  it('resets a learning card on a miss', () => {
    const result = answerAnkiCard(
      card('a', { queue: 'learning', step: 1, reps: 1 }),
      context({ correct: false }),
    );

    expect(result.card.queue).toBe('learning');
    expect(result.card.step).toBe(2);
    expect(result.card.reps).toBe(2);
    expect(result.gap).toBeGreaterThanOrEqual(3);
    expect(result.gap).toBeLessThanOrEqual(5);
  });

  it('graduates a missed learning card when the relearn step is empty', () => {
    const settings: AnkiSettings = { ...DEFAULT_ANKI_SETTINGS, relearnStepsMinutes: [] };
    const result = answerAnkiCard(
      card('a', {
        queue: 'learning',
        step: 1,
        reps: 1,
        lapses: 1,
        intervalDays: 4,
      }),
      context({ correct: false, settings }),
    );

    expect(result.card.queue).toBe('review');
    expect(result.card.lapses).toBe(2);
    expect(result.graduated).toBe(true);
  });

  it('grows the interval of a correct review card', () => {
    const before = card('a', {
      queue: 'review',
      step: 0,
      reps: 4,
      intervalDays: 3,
      stability: 5,
      difficulty: 5,
      lastReview: 1,
    });
    const result = answerAnkiCard(before, context({ correct: true }));

    expect(result.card.queue).toBe('review');
    expect(result.card.intervalDays).toBeGreaterThan(before.intervalDays);
    expect(result.card.stability).toBeGreaterThanOrEqual(before.stability);
    expect(result.card.reps).toBe(5);
    expect(result.graduated).toBe(false);
  });

  it('sends a missed review card back to relearning', () => {
    const result = answerAnkiCard(
      card('a', {
        queue: 'review',
        step: 0,
        reps: 4,
        intervalDays: 10,
        stability: 8,
        difficulty: 5,
        lastReview: 1,
      }),
      context({ correct: false }),
    );

    expect(result.card.queue).toBe('learning');
    expect(result.card.lapses).toBe(1);
    expect(result.card.intervalDays).toBe(0);
    expect(result.card.stability).toBe(4);
    expect(result.gap).toBeGreaterThanOrEqual(3);
    expect(result.gap).toBeLessThanOrEqual(5);
  });

  it('keeps a missed review card in review when the relearn step is empty', () => {
    const settings: AnkiSettings = { ...DEFAULT_ANKI_SETTINGS, relearnStepsMinutes: [] };
    const result = answerAnkiCard(
      card('a', {
        queue: 'review',
        step: 0,
        reps: 4,
        intervalDays: 10,
        stability: 8,
        difficulty: 5,
        lastReview: 1,
      }),
      context({ correct: false, settings }),
    );

    expect(result.card.queue).toBe('review');
    expect(result.card.intervalDays).toBe(5);
    expect(result.card.lapses).toBe(1);
    expect(result.graduated).toBe(true);
  });

  it('shrinks the short gap on a one-card deck', () => {
    const result = answerAnkiCard(card('a'), context({ correct: false, deckSize: 1 }));

    expect(result.gap).toBe(1);
  });

  it('computes a real-day interval with ts-fsrs', () => {
    const days = fsrsIntervalDays(card('a'), Rating.Good, 1_000_000);

    expect(days).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(days)).toBe(true);
  });

  it('uses a seeded random source without changing the answer', () => {
    const result = answerAnkiCard(
      card('a', { queue: 'review', intervalDays: 3, stability: 5, difficulty: 5, reps: 2 }),
      context({ correct: true, rng: createSeededRng(42) }),
    );

    expect(result.card.queue).toBe('review');
    expect(result.gap).toBeGreaterThan(1);
  });
});
