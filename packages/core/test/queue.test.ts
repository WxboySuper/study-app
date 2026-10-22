import { describe, expect, it } from 'vitest';

import { State } from 'ts-fsrs';

import { buildQueue, countScope, type QueueItem } from '../src/queue';
import type { CardState, StudyCard } from '../src/types';

const NOW = new Date('2026-10-21T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function card(id: string, setId: string, topicId: string | null = null): StudyCard {
  return {
    id,
    setId,
    topicId,
    type: 'mc',
    front: `front ${id}`,
    back: `back ${id}`,
  };
}

function state(
  cardId: string,
  due: number,
  overrides: Partial<CardState> = {},
): CardState {
  return {
    cardId,
    due,
    stability: 10,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps: 1,
    lapses: 0,
    state: State.Review,
    lastReview: NOW - DAY,
    learningSteps: 0,
    ...overrides,
  };
}

function ids(items: QueueItem[]): string[] {
  return items.map((item) => item.cardId);
}

describe('buildQueue', () => {
  it('returns due cards ordered by due date, oldest first', () => {
    const cards = [card('c1', 's1'), card('c2', 's1'), card('c3', 's1')];
    const states = new Map<string, CardState>([
      ['c1', state('c1', NOW - 10)],
      ['c2', state('c2', NOW - 30)],
      ['c3', state('c3', NOW + 10)],
    ]);

    const queue = buildQueue(cards, states, NOW, { newCap: 0 });

    expect(ids(queue)).toEqual(['c2', 'c1']);
    expect(queue.every((item) => item.kind === 'due' && item.bonus === false)).toBe(true);
  });

  it('includes cards that become due exactly now', () => {
    const cards = [card('c1', 's1')];
    const states = new Map<string, CardState>([['c1', state('c1', NOW)]]);

    expect(ids(buildQueue(cards, states, NOW, { newCap: 0 }))).toEqual(['c1']);
  });

  it('breaks due ties deterministically by card id', () => {
    const cards = [card('b', 's1'), card('a', 's1')];
    const states = new Map<string, CardState>([
      ['a', state('a', NOW - 5)],
      ['b', state('b', NOW - 5)],
    ]);

    expect(ids(buildQueue(cards, states, NOW, { newCap: 0 }))).toEqual(['a', 'b']);
  });

  it('appends new cards after the due cards', () => {
    const cards = [card('new-1', 's1'), card('due-1', 's1')];
    const states = new Map<string, CardState>([['due-1', state('due-1', NOW - 1)]]);

    const queue = buildQueue(cards, states, NOW, { newCap: 5 });

    expect(ids(queue)).toEqual(['due-1', 'new-1']);
    expect(queue[1]?.kind).toBe('new');
    expect(queue[1]?.bonus).toBe(false);
  });

  it('respects the new card cap', () => {
    const cards = [card('n1', 's1'), card('n2', 's1'), card('n3', 's1')];

    const queue = buildQueue(cards, new Map(), NOW, { newCap: 2 });

    expect(ids(queue)).toEqual(['n1', 'n2']);
  });

  it('treats a card whose state is New as a new card', () => {
    const cards = [card('n1', 's1')];
    const states = new Map<string, CardState>([
      ['n1', state('n1', NOW - DAY, { state: State.New, reps: 0, lastReview: null })],
    ]);

    const queue = buildQueue(cards, states, NOW, { newCap: 5 });

    expect(queue[0]?.kind).toBe('new');
  });

  it('interleaves new cards across sets', () => {
    const cards = [
      card('a1', 'set-a'),
      card('a2', 'set-a'),
      card('a3', 'set-a'),
      card('b1', 'set-b'),
      card('b2', 'set-b'),
      card('c1', 'set-c'),
    ];

    const queue = buildQueue(cards, new Map(), NOW, { newCap: 5 });

    expect(ids(queue)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2']);
  });

  it('filters by set scope', () => {
    const cards = [card('a1', 'set-a'), card('b1', 'set-b')];

    const queue = buildQueue(cards, new Map(), NOW, { newCap: 10, scope: { kind: 'set', setId: 'set-b' } });

    expect(ids(queue)).toEqual(['b1']);
  });

  it('filters by topic scope', () => {
    const cards = [card('a1', 'set-a', 'topic-1'), card('b1', 'set-b', 'topic-2')];

    const queue = buildQueue(cards, new Map(), NOW, {
      newCap: 10,
      scope: { kind: 'topic', topicId: 'topic-1' },
    });

    expect(ids(queue)).toEqual(['a1']);
  });

  it('treats cards without a topic as outside of every topic scope', () => {
    const cards = [card('a1', 'set-a', null)];

    const queue = buildQueue(cards, new Map(), NOW, {
      newCap: 10,
      scope: { kind: 'topic', topicId: 'topic-1' },
    });

    expect(queue).toEqual([]);
  });

  it('scopes to everything by default', () => {
    const cards = [card('a1', 'set-a'), card('b1', 'set-b')];

    const queue = buildQueue(cards, new Map(), NOW, { newCap: 10 });

    expect(ids(queue)).toEqual(['a1', 'b1']);
  });

  it('falls back to low stability bonus cards when nothing is due', () => {
    const cards = [card('b1', 's1'), card('b2', 's1')];
    const states = new Map<string, CardState>([
      ['b1', state('b1', NOW + 10 * DAY, { stability: 2 })],
      ['b2', state('b2', NOW + 20 * DAY, { stability: 5 })],
    ]);

    const queue = buildQueue(cards, states, NOW, { newCap: 0 });

    expect(ids(queue)).toEqual(['b1', 'b2']);
    expect(queue.every((item) => item.kind === 'bonus' && item.bonus === true)).toBe(true);
  });

  it('does not return bonus cards while new cards are still available', () => {
    const cards = [card('b1', 's1'), card('n1', 's1')];
    const states = new Map<string, CardState>([['b1', state('b1', NOW + DAY, { stability: 1 })]]);

    const queue = buildQueue(cards, states, NOW, { newCap: 1 });

    expect(ids(queue)).toEqual(['n1']);
  });

  it('ignores cards whose stability is too high for a bonus round', () => {
    const cards = [card('b1', 's1')];
    const states = new Map<string, CardState>([['b1', state('b1', NOW + DAY, { stability: 30 })]]);

    expect(buildQueue(cards, states, NOW, { newCap: 0 })).toEqual([]);
  });

  it('limits the number of bonus cards', () => {
    const cards = [card('b1', 's1'), card('b2', 's1'), card('b3', 's1')];
    const states = new Map<string, CardState>([
      ['b1', state('b1', NOW + DAY, { stability: 1 })],
      ['b2', state('b2', NOW + DAY, { stability: 2 })],
      ['b3', state('b3', NOW + DAY, { stability: 3 })],
    ]);

    const queue = buildQueue(cards, states, NOW, { newCap: 0, bonusLimit: 2 });

    expect(ids(queue)).toEqual(['b1', 'b2']);
  });

  it('respects a custom bonus stability threshold', () => {
    const cards = [card('b1', 's1')];
    const states = new Map<string, CardState>([['b1', state('b1', NOW + DAY, { stability: 12 })]]);

    expect(buildQueue(cards, states, NOW, { newCap: 0 })).toEqual([]);
    expect(
      buildQueue(cards, states, NOW, { newCap: 0, bonusStabilityThreshold: 20 }).length,
    ).toBe(1);
  });

  it('returns nothing when a bonus limit of zero is given', () => {
    const cards = [card('b1', 's1')];
    const states = new Map<string, CardState>([['b1', state('b1', NOW + DAY, { stability: 1 })]]);

    expect(buildQueue(cards, states, NOW, { newCap: 0, bonusLimit: 0 })).toEqual([]);
  });

  it('accepts a plain object as the state lookup', () => {
    const cards = [card('c1', 's1')];
    const states = { c1: state('c1', NOW - 1) };

    expect(ids(buildQueue(cards, states, NOW, { newCap: 0 }))).toEqual(['c1']);
  });

  it('accepts a Date as now', () => {
    const cards = [card('c1', 's1')];
    const states = new Map<string, CardState>([['c1', state('c1', NOW - 1)]]);

    expect(ids(buildQueue(cards, states, new Date(NOW), { newCap: 0 }))).toEqual(['c1']);
  });

  it('returns an empty queue when there is nothing to study', () => {
    expect(buildQueue([], new Map(), NOW, { newCap: 10 })).toEqual([]);
  });
});

describe('countScope', () => {
  it('counts every card of the scope and the ones that are due', () => {
    const cards = [card('c1', 's1', 't1'), card('c2', 's1', 't1'), card('c3', 's2', 't2')];
    const states = new Map<string, CardState>([
      ['c1', state('c1', NOW - 10)],
      ['c2', state('c2', NOW + 10)],
    ]);

    expect(countScope(cards, states, NOW)).toEqual({ total: 3, due: 1 });
    expect(countScope(cards, states, NOW, { kind: 'set', setId: 's1' })).toEqual({
      total: 2,
      due: 1,
    });
    expect(countScope(cards, states, NOW, { kind: 'topic', topicId: 't2' })).toEqual({
      total: 1,
      due: 0,
    });
  });

  it('does not count a new card as due', () => {
    const cards = [card('c1', 's1')];
    const states = new Map<string, CardState>([
      ['c1', state('c1', NOW - 10, { state: State.New })],
    ]);

    expect(countScope(cards, states, NOW)).toEqual({ total: 1, due: 0 });
  });

  it('counts a card without a state as new, not as due', () => {
    expect(countScope([card('c1', 's1')], new Map(), NOW)).toEqual({ total: 1, due: 0 });
  });
});
