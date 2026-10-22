import { State } from 'ts-fsrs';

import type { CardState, StudyCard } from './types';

/**
 * What the player chose to study.
 *
 * The scopes of docs/SPEC.md §3 ("Study All / Topic(tag) / Set") plus the
 * class scope: a class is a pile of decks, so studying a class studies every
 * question of every deck it holds.
 */
export type QueueScope =
  | { kind: 'all' }
  | { kind: 'topic'; topicId: string }
  | { kind: 'set'; setId: string }
  /**
   * A class of decks. `classId` is `null` for the "Unsorted" bucket: the
   * decks that do not belong to any class.
   */
  | { kind: 'class'; classId: string | null };

/**
 * The class of every deck.
 *
 * The queue does not know the classes themselves, only the class every deck
 * belongs to: a deck without a class is in the "Unsorted" bucket (`null`).
 */
export type DeckClassMap = ReadonlyMap<string, string | null>;

/** A lookup of scheduling state, keyed by card id. */
export type StateLookup =
  | ReadonlyMap<string, CardState>
  | Readonly<Record<string, CardState | undefined>>;

/** Options for {@link buildQueue}. */
export interface QueueOptions {
  /** How many *new* cards may enter the queue. */
  newCap: number;
  /** Restricts the queue to a topic or a single set. Defaults to "all". */
  scope?: QueueScope;
  /** How many bonus cards to return when nothing is due and no new cards are left. */
  bonusLimit?: number;
  /**
   * Bonus cards are the ones that are not due yet but have a low stability
   * (they are the most likely to be forgotten). Stability is in days.
   */
  bonusStabilityThreshold?: number;
  /**
   * The class of every deck, needed by the "class" scope. Without it, every
   * deck is in the "Unsorted" bucket.
   */
  deckClasses?: DeckClassMap;
}

/** Why a card is in the queue. */
export type QueueItemKind = 'due' | 'new' | 'bonus';

/** One entry of a study queue. */
export interface QueueItem {
  cardId: string;
  card: StudyCard;
  kind: QueueItemKind;
  /** `true` for the endless "bonus review" cards that keep a session alive. */
  bonus: boolean;
  /** The scheduling state of the card, if it has one. */
  state?: CardState;
}

/** Default number of bonus cards returned once the queue runs dry. */
export const DEFAULT_BONUS_LIMIT = 20;

/** Default stability (in days) below which a card counts as a bonus card. */
export const DEFAULT_BONUS_STABILITY_THRESHOLD = 7;

/**
 * Builds the study queue.
 *
 * The order is:
 *
 * 1. due cards (scheduled before `now`) ordered by due date, oldest first;
 * 2. up to `newCap` new cards, interleaved across sets so the player does not
 *    burn the whole daily new-card budget on a single set;
 * 3. if (and only if) both of the above are empty, low-stability "bonus"
 *    cards are returned so an endless session never dead-ends.
 */
export function buildQueue(
  cards: readonly StudyCard[],
  states: StateLookup,
  now: Date | number,
  options: QueueOptions,
): QueueItem[] {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const scope = options.scope ?? { kind: 'all' };
  const newCap = Math.max(0, Math.floor(options.newCap));

  const inScope = cards.filter((card) => matchesScope(card, scope, options.deckClasses));

  const due: QueueItem[] = [];
  const fresh: StudyCard[] = [];
  const others: { card: StudyCard; state: CardState }[] = [];

  for (const card of inScope) {
    const state = lookupState(states, card.id);
    if (state === undefined || state.state === State.New) {
      fresh.push(card);
      continue;
    }
    if (state.due <= nowMs) {
      due.push({ cardId: card.id, card, kind: 'due', bonus: false, state });
      continue;
    }
    others.push({ card, state });
  }

  due.sort((a, b) => a.state!.due - b.state!.due || compareIds(a.cardId, b.cardId));

  const newItems = interleaveBySet(fresh).slice(0, newCap).map<QueueItem>((card) => ({
    cardId: card.id,
    card,
    kind: 'new',
    bonus: false,
  }));

  if (due.length === 0 && newItems.length === 0) {
    return buildBonusQueue(others, options);
  }

  return [...due, ...newItems];
}

/**
 * The number of cards of a scope, and how many of them are due.
 *
 * The deck picker of the home screen shows these two numbers on every deck:
 * how big the deck is and how much of it has to be reviewed today.
 */
export interface ScopeCount {
  /** Every card of the scope. */
  total: number;
  /** The cards of the scope that are due (they have a state, it is not "new" and it is due). */
  due: number;
}

/**
 * Counts the cards of a scope and how many of them are due.
 *
 * A card that was never reviewed is *new*, not *due*: it is counted in the
 * total, but it does not ask for a review yet.
 */
export function countScope(
  cards: readonly StudyCard[],
  states: StateLookup,
  now: Date | number,
  scope: QueueScope = { kind: 'all' },
  deckClasses?: DeckClassMap,
): ScopeCount {
  const nowMs = now instanceof Date ? now.getTime() : now;
  let total = 0;
  let due = 0;

  for (const card of cards) {
    if (!matchesScope(card, scope, deckClasses)) {
      continue;
    }
    total += 1;

    const state = lookupState(states, card.id);
    if (state === undefined || state.state === State.New) {
      continue;
    }
    if (state.due <= nowMs) {
      due += 1;
    }
  }

  return { total, due };
}

/**
 * The cards of a scope.
 *
 * The session queue of the game plays the cards of a scope: the picker of
 * the home screen picks one (a topic or a set) and the mode plays exactly
 * those cards.
 */
export function filterByScope(
  cards: readonly StudyCard[],
  scope: QueueScope = { kind: 'all' },
): StudyCard[] {
  return cards.filter((card) => matchesScope(card, scope));
}

/**
 * Orders new cards so that sets alternate: one card from set A, one from set
 * B, one from set A again, ... Sets are visited in a stable order and cards
 * inside a set are ordered by id, so the queue is deterministic.
 */
function interleaveBySet(cards: readonly StudyCard[]): StudyCard[] {
  const bySet = new Map<string, StudyCard[]>();
  for (const card of cards) {
    const bucket = bySet.get(card.setId);
    if (bucket) {
      bucket.push(card);
    } else {
      bySet.set(card.setId, [card]);
    }
  }

  const setIds = [...bySet.keys()].sort(compareIds);
  for (const setId of setIds) {
    bySet.get(setId)!.sort((a, b) => compareIds(a.id, b.id));
  }

  const result: StudyCard[] = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    for (const setId of setIds) {
      const bucket = bySet.get(setId)!;
      const card = bucket[round];
      if (card) {
        result.push(card);
        added = true;
      }
    }
    round += 1;
  }
  return result;
}

/**
 * The endless tail of a session: cards that are not due yet but whose memory
 * is weak (low stability). They are the most valuable extra reviews and they
 * keep the "endless" promise of the game modes.
 */
function buildBonusQueue(
  others: readonly { card: StudyCard; state: CardState }[],
  options: QueueOptions,
): QueueItem[] {
  const limit = Math.max(0, Math.floor(options.bonusLimit ?? DEFAULT_BONUS_LIMIT));
  if (limit === 0) {
    return [];
  }
  const threshold = options.bonusStabilityThreshold ?? DEFAULT_BONUS_STABILITY_THRESHOLD;

  return others
    .filter((entry) => entry.state.stability <= threshold)
    .sort(
      (a, b) =>
        a.state.stability - b.state.stability ||
        a.state.due - b.state.due ||
        compareIds(a.card.id, b.card.id),
    )
    .slice(0, limit)
    .map<QueueItem>((entry) => ({
      cardId: entry.card.id,
      card: entry.card,
      kind: 'bonus',
      bonus: true,
      state: entry.state,
    }));
}

function matchesScope(card: StudyCard, scope: QueueScope, deckClasses?: DeckClassMap): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'topic':
      return card.topicId !== null && card.topicId !== undefined && card.topicId === scope.topicId;
    case 'set':
      return card.setId === scope.setId;
    case 'class':
      // A deck without a class is in the "Unsorted" bucket.
      return classOfDeck(card.setId, deckClasses) === scope.classId;
  }
}

/** The class of a deck (`null` when it has none). */
function classOfDeck(setId: string, deckClasses?: DeckClassMap): string | null {
  if (deckClasses === undefined) {
    return null;
  }
  return deckClasses.get(setId) ?? null;
}

function lookupState(states: StateLookup, cardId: string): CardState | undefined {
  if (states instanceof Map) {
    return states.get(cardId);
  }
  return (states as Readonly<Record<string, CardState | undefined>>)[cardId];
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
