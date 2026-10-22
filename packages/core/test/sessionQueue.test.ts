import { describe, expect, it } from 'vitest';

import { createSeededRng } from '../src/fishing/roll';
import {
  answerSessionQuestion,
  createSessionQueue,
  masteredCount,
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
  it('masters a question that was never missed after one right answer', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    const next = nextSessionQuestion(queue);
    expect(next.question?.id).toBe('a');

    queue = answerSessionQuestion(next.state, 'a', true);

    expect(masteredCount(queue)).toBe(1);
    expect(sessionComplete(queue)).toBe(true);
  });

  it('needs two right answers after a miss', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    const first = nextSessionQuestion(queue);
    queue = answerSessionQuestion(first.state, 'a', false);

    expect(masteredCount(queue)).toBe(0);
    expect(sessionComplete(queue)).toBe(false);

    const second = nextSessionQuestion(queue);
    queue = answerSessionQuestion(second.state, 'a', true);

    expect(masteredCount(queue)).toBe(0);

    const third = nextSessionQuestion(queue);
    queue = answerSessionQuestion(third.state, 'a', true);

    expect(masteredCount(queue)).toBe(1);
    expect(sessionComplete(queue)).toBe(true);
  });

  it('forgets the streak of a question that is missed again', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', false);
    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', true);
    queue = answerSessionQuestion(nextSessionQuestion(queue).state, 'a', false);

    expect(masteredCount(queue)).toBe(0);

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

  it('never asks the same question twice in a row', () => {
    const questions = ['a', 'b', 'c'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(11),
    });

    for (let round = 0; round < 30; round += 1) {
      const next = nextSessionQuestion(queue);
      if (next.question === null) {
        break;
      }
      expect(next.question.id).not.toBe(queue.lastAskedId);
      queue = answerSessionQuestion(next.state, next.question.id, round % 3 === 0);
    }
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

    expect(sessionRemaining(queue)).toBe(2);
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
});
