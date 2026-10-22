import { describe, expect, it } from 'vitest';

import { DEFAULT_ANKI_SETTINGS } from '../src/anki';
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

/** Asks the next question of the session. */
function ask(queue: SessionQueueState): { id: string; queue: SessionQueueState } {
  const next = nextSessionQuestion(queue);
  if (next.question === null) {
    throw new Error('The queue is empty.');
  }
  return { id: next.question.id, queue: next.state };
}

/** Asks and answers one question. */
function round(
  queue: SessionQueueState,
  correct: boolean,
): { id: string; queue: SessionQueueState } {
  const next = ask(queue);
  return {
    id: next.id,
    queue: answerSessionQuestion(next.queue, next.id, correct),
  };
}

/** Asks `count` questions of a session (and answers them correctly). */
function pickMany(
  queue: SessionQueueState,
  count: number,
  correct = true,
): { ids: string[]; queue: SessionQueueState } {
  const ids: string[] = [];
  let state = queue;

  for (let index = 0; index < count; index += 1) {
    const next = round(state, correct);
    ids.push(next.id);
    state = next.queue;
  }

  return { ids, queue: state };
}

/** How many questions of the scope are not mastered yet. */
function unmastered(queue: SessionQueueState): number {
  return sessionTotal(queue) - masteredCount(queue);
}

describe('createSessionQueue', () => {
  it('knows every question of the scope', () => {
    const queue = createSessionQueue({
      questions: [question('a'), question('b'), question('c')],
      mode: 'mastery',
      rng: createSeededRng(1),
    });

    expect(sessionTotal(queue)).toBe(3);
    expect(masteredCount(queue)).toBe(0);
    expect([...queue.pending].sort()).toEqual(['a', 'b', 'c']);
  });

  it('shuffles the new queue with the given random source', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => question(id));

    const first = createSessionQueue({ questions, mode: 'mastery', rng: createSeededRng(1) });
    const second = createSessionQueue({ questions, mode: 'mastery', rng: createSeededRng(1) });
    const other = createSessionQueue({ questions, mode: 'mastery', rng: createSeededRng(2) });

    expect(pickMany(first, 8).ids).toEqual(pickMany(second, 8).ids);
    expect(pickMany(first, 8).ids).not.toEqual(pickMany(other, 8).ids);
  });
});

describe('mastery mode', () => {
  it(`needs ${MASTERY_REQUIRED_CORRECT} right answers in a row to master a question`, () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    for (let answer = 1; answer < MASTERY_REQUIRED_CORRECT; answer += 1) {
      const next = round(queue, true);
      queue = next.queue;

      expect(queue.records.a?.correctStreak).toBe(answer);
      expect(masteredCount(queue)).toBe(0);
      expect(sessionComplete(queue)).toBe(false);
    }

    queue = round(queue, true).queue;

    expect(queue.records.a?.correctStreak).toBe(MASTERY_REQUIRED_CORRECT);
    expect(masteredCount(queue)).toBe(1);
    expect(sessionComplete(queue)).toBe(true);
  });

  it(`needs the same ${MASTERY_REQUIRED_CORRECT} right answers after a miss`, () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    queue = round(queue, false).queue;

    expect(masteredCount(queue)).toBe(0);
    expect(sessionComplete(queue)).toBe(false);
    expect(queue.records.a?.missed).toBe(true);

    // The question starts over: three right answers are needed again.
    for (let answer = 1; answer < MASTERY_REQUIRED_CORRECT; answer += 1) {
      queue = round(queue, true).queue;
      expect(queue.records.a?.correctStreak).toBe(answer);
      expect(masteredCount(queue)).toBe(0);
    }

    queue = round(queue, true).queue;

    expect(masteredCount(queue)).toBe(1);
    expect(sessionComplete(queue)).toBe(true);
  });

  it('throws the streak of a question away when it is missed', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(7),
    });

    queue = round(queue, true).queue;
    queue = round(queue, true).queue;
    expect(queue.records.a?.correctStreak).toBe(2);
    expect(masteredCount(queue)).toBe(0);

    queue = round(queue, false).queue;
    expect(queue.records.a?.correctStreak).toBe(0);
    expect(masteredCount(queue)).toBe(0);

    // Two right answers are not enough any more: the question starts over.
    queue = round(queue, true).queue;
    queue = round(queue, true).queue;
    expect(masteredCount(queue)).toBe(0);

    queue = round(queue, true).queue;
    expect(masteredCount(queue)).toBe(1);
  });

  it('brings a missed question back three to five questions later', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) =>
      question(id),
    );

    for (let seed = 0; seed < 40; seed += 1) {
      let queue = createSessionQueue({
        questions,
        mode: 'endless',
        rng: createSeededRng(seed),
      });

      const first = ask(queue);
      const missed = first.id;
      queue = answerSessionQuestion(first.queue, missed, false);

      let distance = 0;
      let again = false;

      for (let index = 0; index < 30; index += 1) {
        const next = round(queue, true);
        distance += 1;
        queue = next.queue;
        if (next.id === missed) {
          again = true;
          break;
        }
      }

      expect(again).toBe(true);
      expect(distance).toBeGreaterThanOrEqual(3);
      expect(distance).toBeLessThanOrEqual(5);
    }
  });

  it('spreads the right answers out', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) =>
      question(id),
    );

    for (let seed = 0; seed < 40; seed += 1) {
      let queue = createSessionQueue({
        questions,
        mode: 'endless',
        rng: createSeededRng(seed),
      });

      const first = ask(queue);
      const asked = first.id;
      queue = answerSessionQuestion(first.queue, asked, true);

      let distance = 0;
      let again = false;

      for (let index = 0; index < 30; index += 1) {
        const next = round(queue, true);
        distance += 1;
        queue = next.queue;
        if (next.id === asked) {
          again = true;
          break;
        }
      }

      expect(again).toBe(true);
      expect(distance).toBeGreaterThanOrEqual(MASTERY_MIN_GAP);
      expect(distance).toBeLessThanOrEqual(10);
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
    let roundNumber = 0;

    while (!sessionComplete(queue) && roundNumber < 400) {
      const next = ask(queue);
      const last = askedAt.get(next.id);

      // A deck that holds a single question left has no other choice: that
      // question comes back right away.
      if (last !== undefined && unmastered(queue) > 1) {
        expect(roundNumber - last).toBeGreaterThanOrEqual(MASTERY_MIN_GAP);
      }

      askedAt.set(next.id, roundNumber);
      queue = answerSessionQuestion(next.queue, next.id, true);
      roundNumber += 1;
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

    for (let roundNumber = 0; roundNumber < 80; roundNumber += 1) {
      // A deck of a single question left has no other choice.
      if (unmastered(queue) <= 1) {
        break;
      }

      const previous = queue.lastAskedId;
      const next = ask(queue);
      expect(next.id).not.toBe(previous);
      queue = answerSessionQuestion(next.queue, next.id, roundNumber % 3 === 0);
    }
  });

  it('shrinks the gap when the deck is too small for it', () => {
    const questions = ['a', 'b'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'mastery',
      rng: createSeededRng(5),
    });

    const first = ask(queue);
    const asked = first.id;
    queue = answerSessionQuestion(first.queue, asked, true);

    // The deck holds two questions: the gap cannot be three.
    expect(queue.cards[asked]?.dueAt).toBeLessThanOrEqual(2);
  });

  it('asks the only question of a one-question deck again right away', () => {
    let queue = createSessionQueue({
      questions: [question('only')],
      mode: 'mastery',
      rng: createSeededRng(3),
    });

    const first = ask(queue);
    expect(first.id).toBe('only');

    // The deck holds one question: it comes back right away.
    queue = answerSessionQuestion(first.queue, 'only', true);
    expect(ask(queue).id).toBe('only');
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
      queue = round(queue, true).queue;
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

    queue = round(queue, true).queue;

    // The question is not mastered yet: it comes back later.
    expect(sessionRemaining(queue)).toBe(3);
  });

  it('shows the progress of every question of the scope', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'mastery',
      rng: createSeededRng(2),
    });

    expect(masteryProgress(queue)).toEqual([
      { id: 'a', correct: 0, required: MASTERY_REQUIRED_CORRECT, mastered: false },
    ]);

    const first = ask(queue);
    const asked = first.id;
    queue = answerSessionQuestion(first.queue, asked, true);
    queue = answerSessionQuestion(ask(queue).queue, asked, true);

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

    queue = round(queue, true).queue;
    queue = round(queue, true).queue;
    expect(masteryProgress(queue)[0]?.correct).toBe(2);

    queue = round(queue, false).queue;
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

describe('the intervals', () => {
  it('grows the review interval after every correct answer', () => {
    let queue = createSessionQueue({
      questions: [question('a')],
      mode: 'endless',
      rng: createSeededRng(15),
    });

    const intervals: number[] = [];

    for (let index = 0; index < 8; index += 1) {
      queue = round(queue, true).queue;
      const days = queue.cards.a?.intervalDays ?? 0;
      if (days > 0) {
        intervals.push(days);
      }
    }

    expect(intervals.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < intervals.length; index += 1) {
      expect(intervals[index]!).toBeGreaterThan(intervals[index - 1]!);
    }
  });

  it('maps a learning step to a question gap and a review interval much further out', () => {
    const questions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) =>
      question(id),
    );
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(4),
    });

    const first = ask(queue);
    queue = answerSessionQuestion(first.queue, first.id, true);
    const learning = queue.cards[first.id];

    expect(learning?.queue).toBe('learning');
    expect(learning?.dueAt).toBeGreaterThanOrEqual(3);

    // Make it graduate: the review interval parks it far behind the session.
    let guard = 0;
    while (queue.cards[first.id]?.queue !== 'review' && guard < 20) {
      queue = round(queue, true).queue;
      guard += 1;
    }

    const review = queue.cards[first.id];
    expect(review?.queue).toBe('review');
    expect(review?.dueAt).toBeGreaterThan(learning?.dueAt ?? 0);
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

    for (let roundNumber = 0; roundNumber < 200; roundNumber += 1) {
      const previous = queue.lastAskedId;
      const next = ask(queue);
      expect(next.id).not.toBe(previous);
      queue = answerSessionQuestion(next.queue, next.id, true);
    }
  });

  it('keeps the new questions coming', () => {
    const questions = [
      ...Array.from({ length: 20 }, (_, index) => question(`new-${index}`)),
      ...Array.from({ length: 20 }, (_, index) =>
        question(`review-${index}`, state(`review-${index}`, { due: 0, stability: 5 })),
      ),
    ];

    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(3),
    });

    let sinceNew = 0;
    let newPicks = 0;

    for (let roundNumber = 0; roundNumber < 40; roundNumber += 1) {
      const newRemain = queue.queues.newIds.length > 0;
      const next = ask(queue);
      queue = answerSessionQuestion(next.queue, next.id, true);
      const group = queue.lastGroup;
      if (group === 'new') {
        sinceNew = 0;
        newPicks += 1;
      } else if (newRemain) {
        sinceNew += 1;
        // One new card in roughly every three picks while any remain.
        expect(sinceNew).toBeLessThanOrEqual(3);
      }
    }

    expect(newPicks).toBeGreaterThan(10);
  });

  it('covers a 60 question deck early instead of studying a small working set', () => {
    const questions = Array.from({ length: 60 }, (_, index) => question(`q-${index}`));
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(17),
    });

    const first = pickMany(queue, 20);
    queue = first.queue;
    // The first pass introduces ten unseen questions (the 10 minute learning
    // step brings them back later); the deck is not a small working set.
    expect(new Set(first.ids).size).toBeGreaterThanOrEqual(10);

    const rest = pickMany(queue, 100);
    const all = new Set([...first.ids, ...rest.ids]);
    expect(all.size).toBeGreaterThanOrEqual(30);

    const firstSixty = new Set([...first.ids, ...rest.ids.slice(0, 40)]).size;
    expect(firstSixty).toBeGreaterThanOrEqual(30);
    expect(all.size).toBe(60);
  });

  it('shows a high-stability card only rarely', () => {
    const normal = Array.from({ length: 100 }, (_, index) =>
      question(`normal-${index}`, state(`normal-${index}`, { due: 0, stability: 5 })),
    );
    const wellKnown = Array.from({ length: 100 }, (_, index) =>
      question(
        `known-${index}`,
        state(`known-${index}`, {
          due: 0,
          stability: DEFAULT_ANKI_SETTINGS.highStabilityDays * 2,
        }),
      ),
    );

    let queue = createSessionQueue({
      questions: [...normal, ...wellKnown],
      mode: 'endless',
      rng: createSeededRng(8),
    });

    let knownPicks = 0;
    const picks = 100;

    // The questions are not answered: the review queue is a fixed set, so
    // the test observes the choice of the picker itself.
    for (let roundNumber = 0; roundNumber < picks; roundNumber += 1) {
      const next = ask(queue);
      if (next.id.startsWith('known-')) {
        knownPicks += 1;
      }
      queue = next.queue;
    }

    expect(knownPicks).toBeGreaterThan(0);
    expect(knownPicks).toBeLessThan(picks * 0.3);
  });

  it('keeps a gap between two serves of the same question', () => {
    const questions = Array.from({ length: 12 }, (_, index) => question(`q-${index}`));
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(19),
    });

    const askedAt = new Map<string, number>();

    for (let roundNumber = 0; roundNumber < 160; roundNumber += 1) {
      const next = ask(queue);
      const last = askedAt.get(next.id);
      if (last !== undefined && unmastered(queue) > 1) {
        expect(roundNumber - last).toBeGreaterThanOrEqual(MASTERY_MIN_GAP);
      }
      askedAt.set(next.id, roundNumber);
      queue = answerSessionQuestion(next.queue, next.id, roundNumber % 4 !== 0);
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
    for (let roundNumber = 0; roundNumber < 40; roundNumber += 1) {
      const next = ask(queue);
      picks.push(next.id);
      queue = answerSessionQuestion(next.queue, next.id, true);
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
    const first = ask(queue);
    queue = answerSessionQuestion(first.queue, first.id, false);

    const picks: string[] = [];
    for (let roundNumber = 0; roundNumber < 40; roundNumber += 1) {
      const next = ask(queue);
      picks.push(next.id);
      queue = answerSessionQuestion(next.queue, next.id, true);
    }

    // The missed question is asked again (it is not dropped).
    expect(picks).toContain(first.id);
  });

  it('uses the fresh scheduling state of the questions', () => {
    const queue = createSessionQueue({
      questions: [question('a'), question('b')],
      mode: 'endless',
      rng: createSeededRng(8),
    });

    const next = updateSessionStates(queue, {
      a: state('a', { due: 0, stability: 20 }),
      b: state('b', { due: Date.now() + 86_400_000, stability: 20 }),
    });

    expect(next.states.a?.due).toBe(0);
    expect(next.states.b?.due).toBeGreaterThan(Date.now());
  });

  it('keeps every question of the scope in the pool', () => {
    const questions = ['a', 'b', 'c'].map((id) => question(id));
    const queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(2),
    });

    const drained = pickMany(queue, 30).queue;

    expect([...drained.pending].sort()).toEqual(['a', 'b', 'c']);
  });

  it('counts the questions the player does not know yet', () => {
    const questions = ['a', 'b'].map((id) => question(id));
    let queue = createSessionQueue({
      questions,
      mode: 'endless',
      rng: createSeededRng(12),
    });

    expect(sessionRemaining(queue)).toBe(2);

    queue = round(queue, true).queue;

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
    expect(next.missedIds).toContain('ghost');
    expect(next.pending).toEqual(['a']);
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
