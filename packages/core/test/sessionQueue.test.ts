import { describe, expect, it } from 'vitest';

import { createSeededRng } from '../src/fishing/roll';
import {
  MASTERY_MIN_GAP,
  MASTERY_REQUIRED_CORRECT,
  answerSessionQuestion,
  createSessionQueue,
  masteredCount,
  masteryProgress,
  nextSessionQuestion,
  sessionComplete,
  sessionRemaining,
  sessionTotal,
  updateSessionStates,
  type SessionQuestion,
  type SessionQueueState,
} from '../src/sessionQueue';
import type { CardState, StudyCard } from '../src/types';

/** A card of a test session. */
function card(id: string): StudyCard {
  return {
    id,
    setId: 'set',
    type: 'mc',
    front: `front ${id}`,
    back: `back ${id}`,
    wrong: [`wrong ${id}`],
  };
}

/** A question of a test session. */
function question(id: string, state?: CardState): SessionQuestion {
  return state === undefined ? { id, card: card(id) } : { id, card: card(id), state };
}

/** A scheduling state of a test session. */
function state(
  cardId: string,
  options: { due?: number; stability?: number } = {},
): CardState {
  return {
    cardId,
    due: options.due ?? 0,
    stability: options.stability ?? 10,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 2,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: 0,
  };
}

/** Asks the questions of a session until the queue is empty. */
function drain(queue: SessionQueueState, limit = 100): SessionQueueState {
  let state = queue;

  for (let round = 0; round < limit; round += 1) {
    const next = nextSessionQuestion(state);
    if (next.question === null) {
      return state;
    }
    state = next.state;
  }

  return state;
}

/** How many questions of the scope are not mastered yet. */
function unmastered(queue: SessionQueueState): number {
  return sessionTotal(queue) - masteredCount(queue);
}

describe('createSessionQueue', () => {
  it('shuffles the questions with the given random source', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => question(id));

    const first = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(42),
    });
    const second = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(42),
    });

    expect(first.pending).toEqual(second.pending);
    expect([...first.pending].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('gives another order with another seed', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => question(id));

    const first = createSessionQueue({ questions, mode: 'mastery', rng: createSeededRng(1) });
    const second = createSessionQueue({ questions, mode: 'mastery', rng: createSeededRng(2) });

    expect(first.pending).not.toEqual(second.pending);
  });

  it('knows every question of the scope', () => {
    const queue = createSessionQueue({
      questions: [question('a'), question('b')],
      mode: 'mastery',
      rng: createSeededRng(1),
    });

    expect(sessionTotal(queue)).toBe(2);
    expect(masteredCount(queue)).toBe(0);
  });
});

describe('mastery mode', () => {
  it(`needs ${MASTERY_REQUIRED_CORRECT} right answers in a row to master a question`, () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    for (let round = 0; round < MASTERY_REQUIRED_CORRECT - 1; round += 1) {
      const next = nextSessionQuestion(queue);
      queue = answerSessionQuestion(next.state, 'a', true);

      expect(masteredCount(queue)).toBe(0);
      expect(sessionComplete(queue)).toBe(false);
    }

    const last = nextSessionQuestion(queue);
    queue = answerSessionQuestion(last.state, 'a', true);

    expect(masteredCount(queue)).toBe(1);
    expect(sessionComplete(queue)).toBe(true);
  });

  it(`needs the same ${MASTERY_REQUIRED_CORRECT} right answers after a miss`, () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    const first = nextSessionQuestion(queue);
    queue = answerSessionQuestion(first.state, 'a', false);

    expect(masteredCount(queue)).toBe(0);
    expect(sessionComplete(queue)).toBe(false);
    expect(queue.records.a?.missed).toBe(true);

    // The question starts over: three right answers are needed again.
    for (let round = 0; round < MASTERY_REQUIRED_CORRECT - 1; round += 1) {
      const next = nextSessionQuestion(queue);
      queue = answerSessionQuestion(next.state, 'a', true);
      expect(masteredCount(queue)).toBe(0);
    }

    const last = nextSessionQuestion(queue);
    queue = answerSessionQuestion(last.state, 'a', true);

    expect(masteredCount(queue)).toBe(1);
    expect(sessionComplete(queue)).toBe(true);
  });

  it('throws the streak of a question away when it is missed', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    expect(queue.records.a?.correctStreak).toBe(2);
    expect(masteredCount(queue)).toBe(0);

    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', false);
    expect(queue.records.a?.correctStreak).toBe(0);
    expect(masteredCount(queue)).toBe(0);

    // Two right answers are not enough any more: the question starts over.
    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    expect(masteredCount(queue)).toBe(0);

    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    expect(masteredCount(queue)).toBe(1);
  });

  it('brings a missed question back three to five questions later', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => question(id));

    for (let seed = 0; seed < 40; seed += 1) {
      let queue = createSessionQueue({
        questions,
        mode: 'mastery',
        rng: createSeededRng(seed),
      });

      const first = nextSessionQuestion(queue);
      const missed = first.question?.id ?? '';
      queue = answerSessionQuestion(first.state, missed, false);

      // The missed question waits three to five questions.
      const distance = queue.pending.indexOf(missed);
      expect(distance).toBeGreaterThanOrEqual(3);
      expect(distance).toBeLessThanOrEqual(5);
    }
  });

  it('spreads the right answers out: the question comes back a few questions later', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => question(id));

    for (let seed = 0; seed < 40; seed += 1) {
      let queue = createSessionQueue({
        questions,
        mode: 'mastery',
        rng: createSeededRng(seed),
      });

      const first = nextSessionQuestion(queue);
      const asked = first.question?.id ?? '';
      queue = answerSessionQuestion(first.state, asked, true);

      // The right answers of a question are spread out.
      const distance = queue.pending.indexOf(asked);
      expect(distance).toBeGreaterThanOrEqual(MASTERY_MIN_GAP);
      expect(distance).toBeLessThanOrEqual(5);
    }
  });

  it('keeps the gap between two serves of the same question', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(21),
    });

    const askedAt = new Map<string, number>();
    let round = 0;

    while (!sessionComplete(queue) && round < 200) {
      const next = nextSessionQuestion(queue);
      const id = next.question?.id;
      if (id === undefined) {
        break;
      }

      const last = askedAt.get(id);
      // A deck that holds a single question left has no other choice: that
      // question comes back right away.
      if (last !== undefined && unmastered(queue) > 1) {
        expect(round - last).toBeGreaterThanOrEqual(MASTERY_MIN_GAP);
      }

      askedAt.set(id, round);
      queue = answerSessionQuestion(next.state, id, true);
      round += 1;
    }

    expect(sessionComplete(queue)).toBe(true);
    expect(masteredCount(queue)).toBe(8);
  });

  it('never asks the same question twice in a row', () => {
    const questions = ['a', 'b', 'c', 'd'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(11),
    });

    for (let round = 0; round < 60; round += 1) {
      // A deck of a single question left has no other choice.
      if (unmastered(queue) <= 1) {
        break;
      }

      const next = nextSessionQuestion(queue);
      if (next.question === null) {
        break;
      }
      expect(next.question.id).not.toBe(queue.lastAskedId);
      queue = answerSessionQuestion(next.state, next.question.id, round % 3 === 0);
    }
  });

  it('shrinks the gap when the deck is too small for it', () => {
    const questions = ['a', 'b'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(5),
    });

    const first = nextSessionQuestion(queue);
    const asked = first.question?.id ?? '';
    queue = answerSessionQuestion(first.state, asked, true);

    // The deck holds two questions: the gap cannot be three.
    expect(queue.pending.indexOf(asked)).toBe(1);
  });

  it('asks the only question of a one-question deck again right away', () => {
    let queue = createSessionQueue({
      questions: [question('only')],
      mode: 'mastery',
      rng: createSeededRng(3),
    });

    const first = nextSessionQuestion(queue);
    expect(first.question?.id).toBe('only');

    // The deck holds one question: it comes back right away.
    queue = answerSessionQuestion(first.state, 'only', true);
    const second = nextSessionQuestion(queue);
    expect(second.question?.id).toBe('only');
  });

  it('ends only when every question of the scope is mastered', () => {
    const questions = ['a', 'b', 'c'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(3),
    });

    let guard = 0;
    while (!sessionComplete(queue) && guard < 200) {
      const next = nextSessionQuestion(queue);
      if (next.question === null) {
        break;
      }
      queue = answerSessionQuestion(next.state, next.question.id, true);
      guard += 1;
    }

    expect(sessionComplete(queue)).toBe(true);
    expect(masteredCount(queue)).toBe(3);
  });

  it('counts the questions that are still to be asked', () => {
    const questions = ['a', 'b', 'c'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(5),
    });

    expect(sessionRemaining(queue)).toBe(3);

    const next = nextSessionQuestion(queue);
    queue = answerSessionQuestion(next.state, next.question!.id, true);

    // The question is not mastered yet: it comes back later.
    expect(sessionRemaining(queue)).toBe(3);
  });

  it('shows the progress of every question of the scope', () => {
    const questions = ['a', 'b'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(2),
    });

    expect(masteryProgress(queue)).toEqual([
      { id: 'a', correct: 0, required: MASTERY_REQUIRED_CORRECT, mastered: false },
      { id: 'b', correct: 0, required: MASTERY_REQUIRED_CORRECT, mastered: false },
    ]);

    const first = nextSessionQuestion(queue);
    const asked = first.question!.id;
    queue = answerSessionQuestion(first.state, asked, true);
    queue = answerSessionQuestion(nextSessionQuestion(queue).state, asked, true);

    const progress = masteryProgress(queue).find((entry) => entry.id === asked);
    expect(progress?.correct).toBe(2);
    expect(progress?.required).toBe(MASTERY_REQUIRED_CORRECT);
    expect(progress?.mastered).toBe(false);
  });

  it('empties the dots of a question that was missed', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(4),
    });

    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    expect(masteryProgress(queue)[0]?.correct).toBe(2);

    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', false);
    expect(masteryProgress(queue)[0]?.correct).toBe(0);
    expect(masteryProgress(queue)[0]?.mastered).toBe(false);
  });

  it('copes with a question that has no record', () => {
    const queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(1),
    });

    expect(masteryProgress({ ...queue, records: {} })).toEqual([
      { id: 'a', correct: 0, required: MASTERY_REQUIRED_CORRECT, mastered: false },
    ]);
  });

  it('falls back to the defaults when the options are broken', () => {
    const broken = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(1),
      masteryRequired: Number.NaN,
      minGap: Number.NaN,
    });

    expect(broken.masteryRequired).toBe(MASTERY_REQUIRED_CORRECT);
    expect(broken.minGap).toBe(MASTERY_MIN_GAP);

    const floored = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(1),
      masteryRequired: 0,
      minGap: -5,
    });

    expect(floored.masteryRequired).toBe(1);
    expect(floored.minGap).toBe(0);
  });
});

describe('endless mode', () => {
  it('never ends by itself', () => {
    const queue = createSessionQueue({
      questions: [question('a'), question('b')],
      mode: 'endless',
      rng: createSeededRng(1),
    });

    expect(sessionComplete(queue)).toBe(false);
  });

  it('never asks the same question twice in a row', () => {
    const questions = ['a', 'b', 'c', 'd'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(9),
    });

    for (let round = 0; round < 200; round += 1) {
      const next = nextSessionQuestion(queue);
      expect(next.question).not.toBeNull();
      expect(next.question!.id).not.toBe(queue.lastAskedId);
      queue = answerSessionQuestion(next.state, next.question!.id, true);
    }
  });

  it('picks the questions that are due first', () => {
    const questions = [
      question('due', state('due', { due: 0, stability: 30 })),
      question('later', state('later', { due: Date.now() + 86_400_000, stability: 30 })),
      question('weak', state('weak', { due: Date.now() + 86_400_000, stability: 1 })),
    ];

    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(4),
      now: 1_000_000,
    });

    const picks: string[] = [];
    for (let round = 0; round < 40; round += 1) {
      const next = nextSessionQuestion(queue);
      picks.push(next.question!.id);
      queue = answerSessionQuestion(next.state, next.question!.id, true);
    }

    const duePicks = picks.filter((id) => id === 'due').length;
    const weakPicks = picks.filter((id) => id === 'weak').length;

    // The due question is picked far more often than the weak one.
    expect(duePicks).toBeGreaterThan(weakPicks);
    expect(duePicks).toBeGreaterThan(picks.length / 3);
  });

  it('picks a question that was missed before', () => {
    const questions = [
      question('missed', state('missed', { due: Date.now() + 86_400_000, stability: 30 })),
      question('other', state('other', { due: Date.now() + 86_400_000, stability: 30 })),
    ];

    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(6),
      now: 1_000_000,
    });

    // The player misses "missed" once.
    const first = nextSessionQuestion(queue);
    queue = answerSessionQuestion(first.state, first.question!.id, false);

    const picks: string[] = [];
    for (let round = 0; round < 40; round += 1) {
      const next = nextSessionQuestion(queue);
      picks.push(next.question!.id);
      queue = answerSessionQuestion(next.state, next.question!.id, true);
    }

    // The missed question is asked again (it is not dropped).
    expect(picks).toContain('missed');
    expect(picks.filter((id) => id === 'missed').length).toBeGreaterThan(0);
  });

  it('uses the fresh scheduling state of the questions', () => {
    const questions = [question('a'), question('b')];
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(8),
    });

    queue = updateSessionStates(queue, {
      a: state('a', { due: 0, stability: 20 }),
      b: state('b', { due: Date.now() + 86_400_000, stability: 20 }),
    });

    expect(queue.states.a?.due).toBe(0);
    expect(queue.states.b?.due).toBeGreaterThan(Date.now());
  });

  it('keeps every question of the scope in the pool', () => {
    const questions = ['a', 'b', 'c'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(2),
    });

    queue = drain(queue, 30);

    expect([...queue.pending].sort()).toEqual(['a', 'b', 'c']);
  });

  it('counts the questions the player does not know yet', () => {
    const questions = ['a', 'b'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(12),
    });

    expect(sessionRemaining(queue)).toBe(2);

    const next = nextSessionQuestion(queue);
    queue = answerSessionQuestion(next.state, next.question!.id, true);

    expect(sessionRemaining(queue)).toBe(1);
  });

  it('plays on when the scope holds a single question', () => {
    const queue = createSessionQueue({
      questions: [question('only')],
      mode: 'endless',
      rng: createSeededRng(13),
    });

    const next = nextSessionQuestion(queue);

    expect(next.question?.id).toBe('only');
    expect(next.state.pending).toEqual(['only']);
  });
});

describe('the edges of the queue', () => {
  it('has nothing to ask when the scope is empty', () => {
    const queue = createSessionQueue({
      questions: [],
      mode: 'mastery',
      rng: createSeededRng(1),
    });

    const next = nextSessionQuestion(queue);

    expect(next.question).toBeNull();
    expect(sessionComplete(queue)).toBe(true);
    expect(sessionTotal(queue)).toBe(0);
  });

  it('has nothing to ask when the endless pool is empty', () => {
    const queue = createSessionQueue({
      questions: [],
      mode: 'endless',
      rng: createSeededRng(1),
    });

    expect(nextSessionQuestion(queue).question).toBeNull();
  });

  it('takes the state of a review', () => {
    const queue = createSessionQueue({
      questions: [question('a')],
      mode: 'endless',
      rng: createSeededRng(2),
    });

    const next = answerSessionQuestion(
      queue,
      'a',
      true,
      state('a', { due: 123, stability: 4 }),
    );

    expect(next.states.a?.due).toBe(123);
    expect(next.states.a?.stability).toBe(4);
  });

  it('survives an answer about a question it does not know', () => {
    const queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(3),
    });

    const next = answerSessionQuestion(queue, 'ghost', false);

    expect(next.records.ghost?.missed).toBe(true);
    expect(next.pending).toContain('ghost');
  });

  it('reads the states of a map', () => {
    const queue = createSessionQueue({
      questions: [question('a'), question('b')],
      mode: 'endless',
      rng: createSeededRng(4),
    });

    const next = updateSessionStates(
      queue,
      new Map([['a', state('a', { due: 7 })]]),
    );

    expect(next.states.a?.due).toBe(7);
    // The state of "b" is unknown: the old one stays.
    expect(next.states.b).toBeUndefined();
  });
});
