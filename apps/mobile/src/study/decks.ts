import { countScope, type CardState, type QueueScope, type StudyCard } from '@study-app/core';

import type { LocalSet, LocalTopic } from '@/db/local';
import type { ScopeChoice } from '@/settings';
import { gradients, type Gradient } from '@/theme';

/**
 * The decks of the home screen.
 *
 * A deck is a pile of cards the player can study: a topic (all the sets of
 * a tag) or a single set. Every deck knows how many cards it holds and how
 * many of them are due, so the picker can show the numbers before the
 * player taps anything.
 */

/** What kind of deck a card of the picker is. */
export type DeckKind = 'topic' | 'set';

/** One deck of the picker. */
export interface DeckCard {
  /** The id of the deck (the id of the topic or of the set). */
  id: string;
  /** What kind of deck this is. */
  kind: DeckKind;
  /** The name of the deck. */
  title: string;
  /** The name of the topic the deck belongs to (a set without a topic has none). */
  topicName: string | null;
  /** The icon of the deck. */
  emoji: string;
  /** The gradient of the deck (the gradient of its topic). */
  gradient: Gradient;
  /** How many cards the deck holds. */
  cards: number;
  /** How many of them are due. */
  due: number;
}

/** The icons of the topics. */
const TOPIC_EMOJI = ['🧠', '🔬', '🌍', '📜', '🧪', '🗺️', '🎨', '🏛️'];

/** The icons of the sets. */
const SET_EMOJI = ['🗂️', '📕', '📗', '📘', '📙', '🧾', '🗒️', '📓'];

/** The gradients of the decks that have no topic color. */
const FALLBACK_GRADIENTS: readonly Gradient[] = [
  gradients.primary,
  gradients.ticket,
  gradients.collection,
  gradients.gold,
  gradients.shop,
  gradients.wheel,
];

/**
 * Darkens a hex color.
 *
 * The deck of a topic is drawn in the color of the topic, so the gradient
 * needs a darker second stop.
 */
function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return hex;
  }

  const value = Number.parseInt(clean, 16);
  const channel = (shift: number): number =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * (1 - amount))));

  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

/** The gradient of a topic: its own color, or one of the gradients of the app. */
export function topicGradient(color: string | null, index: number): Gradient {
  if (color !== null && color.trim() !== '') {
    return [color, shade(color, 0.4)];
  }
  return FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length] ?? gradients.primary;
}

/**
 * Builds the decks of the picker.
 *
 * The topics come first (they are the big piles), then the sets. Every deck
 * is counted with the same rules as the queue of a session, so the "due"
 * badge of a deck is exactly the number of cards the session would ask for.
 */
export function buildDecks(
  sets: readonly LocalSet[],
  topics: readonly LocalTopic[],
  cards: readonly StudyCard[],
  states: ReadonlyMap<string, CardState>,
  now: number,
): DeckCard[] {
  const decks: DeckCard[] = [];

  topics.forEach((topic, index) => {
    const count = countScope(cards, states, now, { kind: 'topic', topicId: topic.id });
    decks.push({
      id: topic.id,
      kind: 'topic',
      title: topic.name,
      topicName: topic.name,
      emoji: TOPIC_EMOJI[index % TOPIC_EMOJI.length] ?? '🧠',
      gradient: topicGradient(topic.color, index),
      cards: count.total,
      due: count.due,
    });
  });

  sets.forEach((set, index) => {
    const topic = topics.find((entry) => entry.id === set.topicId);
    const topicIndex = topics.findIndex((entry) => entry.id === set.topicId);
    const count = countScope(cards, states, now, { kind: 'set', setId: set.id });
    decks.push({
      id: set.id,
      kind: 'set',
      title: set.title,
      topicName: topic?.name ?? null,
      emoji: SET_EMOJI[index % SET_EMOJI.length] ?? '🗂️',
      gradient: topicGradient(topic?.color ?? null, topicIndex < 0 ? index : topicIndex),
      cards: count.total,
      due: count.due,
    });
  });

  return decks;
}

/**
 * The id of the deck that is selected for a scope.
 *
 * `null` means "All decks".
 */
export function selectedDeckId(scope: ScopeChoice): string | null {
  if (scope.kind === 'all') {
    return null;
  }
  return scope.id;
}

/** The scope of a deck of the picker. */
export function scopeOfDeck(deck: DeckCard): ScopeChoice {
  if (deck.kind === 'topic') {
    return { kind: 'topic', id: deck.id, title: deck.title };
  }
  return { kind: 'set', id: deck.id, title: deck.title };
}

/** The scope of the queue for a scope of the app. */
export function queueScopeOf(scope: ScopeChoice): QueueScope {
  switch (scope.kind) {
    case 'all':
      return { kind: 'all' };
    case 'topic':
      return { kind: 'topic', topicId: scope.id };
    case 'set':
      return { kind: 'set', setId: scope.id };
  }
}
