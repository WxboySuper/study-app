import {
  buildDeckClassMap,
  countScope,
  decksOfClass,
  type CardState,
  type QueueScope,
  type StudyCard,
  type TodayCounts,
} from '@study-app/core';

import type { LocalClass, LocalSet } from '@/db/local';
import type { ScopeChoice } from '@/settings';
import { gradients, type Gradient } from '@/theme';

/**
 * The decks of the home screen.
 *
 * A class is a pile of decks: the player groups the decks they study (a
 * class per subject, per exam, per week...) and studies a whole class at
 * once. Every class and every deck knows how many questions it holds and how
 * many of them are due, so the picker can show the numbers before the player
 * taps anything.
 */

/** What kind of chip a chip of the class row is. */
export type ClassChipKind = 'all' | 'class' | 'unsorted';

/** One chip of the class row. */
export interface ClassChip {
  /** The id of the class (`null` for "All" and for "Unsorted"). */
  id: string | null;
  /** What kind of chip this is. */
  kind: ClassChipKind;
  /** The name of the chip. */
  name: string;
  /** The color of the class (`null` when it has none). */
  color: string | null;
  /** The icon of the chip. */
  emoji: string;
  /** How many questions the class holds. */
  questions: number;
  /** How many of them are due. */
  due: number;
}

/** What kind of deck a card of the picker is. */
export type DeckKind = 'class' | 'set';

/** One deck of the picker. */
export interface DeckCard {
  /**
   * Today's Mastery queue of the deck (Anki's New / Learn / Due), shown
   * instead of the due badge while Mastery mode is on.
   */
  today?: TodayCounts;
  /** The id of the deck (the id of the class or of the set). */
  id: string;
  /** What kind of deck this is. */
  kind: DeckKind;
  /** The name of the deck. */
  title: string;
  /** The id of the class of the deck (`null` when it has none). */
  classId: string | null;
  /** The name of the class of the deck (`null` when it has none). */
  className: string | null;
  /** The icon of the deck. */
  emoji: string;
  /** The gradient of the deck (the gradient of its class). */
  gradient: Gradient;
  /** How many questions the deck holds. */
  questions: number;
  /** How many of them are due. */
  due: number;
}

/** The icons of the classes. */
const CLASS_EMOJI = ['🗃️', '📚', '🧠', '🔬', '🌍', '📜', '🧪', '🗺️', '🎨', '🏛️'];

/** The icons of the decks. */
const SET_EMOJI = ['🗂️', '📕', '📗', '📘', '📙', '🧾', '🗒️', '📓'];

/** The gradients of the decks that have no class color. */
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
 * The deck of a class is drawn in the color of the class, so the gradient
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

/** The gradient of a class: its own color, or one of the gradients of the app. */
export function classGradient(color: string | null, index: number): Gradient {
  if (color !== null && color.trim() !== '') {
    return [color, shade(color, 0.4)];
  }
  return FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length] ?? gradients.primary;
}

/**
 * The colors a new class can wear.
 *
 * The chips are chunky and colorful: every class of the player gets one of
 * these, in the order of the palette.
 */
export const CLASS_COLORS: readonly string[] = [
  '#7b61ff',
  '#22d3ee',
  '#34d399',
  '#f472b6',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#38bdf8',
];

/**
 * Builds the chips of the class row.
 *
 * The row always starts with "All" (every question of the game) and ends
 * with "Unsorted" (the decks that do not belong to any class), with a chip
 * for every class of the player in between.
 */
export function buildClassChips(
  classes: readonly LocalClass[],
  sets: readonly LocalSet[],
  cards: readonly StudyCard[],
  states: ReadonlyMap<string, CardState>,
  now: number,
): ClassChip[] {
  const deckClasses = buildDeckClassMap(sets);

  const everything = countScope(cards, states, now);
  const chips: ClassChip[] = [
    {
      id: null,
      kind: 'all',
      name: 'All',
      color: null,
      emoji: '🗺️',
      questions: everything.total,
      due: everything.due,
    },
  ];

  classes.forEach((entry, index) => {
    const count = countScope(
      cards,
      states,
      now,
      { kind: 'class', classId: entry.id },
      deckClasses,
    );
    chips.push({
      id: entry.id,
      kind: 'class',
      name: entry.name,
      color: entry.color,
      emoji: CLASS_EMOJI[index % CLASS_EMOJI.length] ?? '🗃️',
      questions: count.total,
      due: count.due,
    });
  });

  const unsorted = countScope(cards, states, now, { kind: 'class', classId: null }, deckClasses);
  chips.push({
    id: null,
    kind: 'unsorted',
    name: 'Unsorted',
    color: null,
    emoji: '📥',
    questions: unsorted.total,
    due: unsorted.due,
  });

  return chips;
}

/**
 * Builds the decks of the picker.
 *
 * The decks are the sets of the player. When a class is selected, only the
 * decks of that class are shown; otherwise every deck is there. Every deck
 * is counted with the same rules as the queue of a session, so the "due"
 * badge of a deck is exactly the number of questions the session would ask
 * for.
 */
export function buildDecks(
  sets: readonly LocalSet[],
  classes: readonly LocalClass[],
  cards: readonly StudyCard[],
  states: ReadonlyMap<string, CardState>,
  now: number,
  filter: ClassFilter = { kind: 'all' },
): DeckCard[] {
  const shown = filter.kind === 'all' ? sets : decksOfClass(sets, filter.classId);

  return shown.map((set, index) => {
    const entry = classes.find((candidate) => candidate.id === set.classId);
    const classIndex = classes.findIndex((candidate) => candidate.id === set.classId);
    const count = countScope(cards, states, now, { kind: 'set', setId: set.id });

    return {
      id: set.id,
      kind: 'set' as const,
      title: set.title,
      classId: set.classId ?? null,
      className: entry?.name ?? null,
      emoji: SET_EMOJI[index % SET_EMOJI.length] ?? '🗂️',
      gradient: classGradient(entry?.color ?? null, classIndex < 0 ? index : classIndex),
      questions: count.total,
      due: count.due,
    };
  });
}

/** The decks the picker shows. */
export type ClassFilter = { kind: 'all' } | { kind: 'class'; classId: string | null };

/** The key of a chip of the class row (the chips of the row are unique). */
export function chipKey(chip: ClassChip): string {
  if (chip.kind === 'all') {
    return 'all';
  }
  if (chip.kind === 'unsorted') {
    return 'unsorted';
  }
  return `class:${chip.id ?? ''}`;
}

/**
 * The id of the class that is selected.
 *
 * `null` means "All the decks".
 */
export function selectedClassId(scope: ScopeChoice): string | null {
  if (scope.kind === 'class') {
    return scope.id;
  }
  return null;
}

/** The scope of a chip of the class row. */
export function scopeOfChip(chip: ClassChip): ScopeChoice {
  if (chip.kind === 'all') {
    return { kind: 'all' };
  }
  if (chip.kind === 'unsorted') {
    return { kind: 'class', id: null, title: 'Unsorted' };
  }
  return { kind: 'class', id: chip.id ?? '', title: chip.name };
}

/** The scope of a deck of the picker. */
export function scopeOfDeck(deck: DeckCard): ScopeChoice {
  return { kind: 'set', id: deck.id, title: deck.title };
}

/** The scope of the queue for a scope of the app. */
export function queueScopeOf(scope: ScopeChoice): QueueScope {
  switch (scope.kind) {
    case 'all':
      return { kind: 'all' };
    case 'topic':
      return { kind: 'topic', topicId: scope.id };
    case 'class':
      return { kind: 'class', classId: scope.id };
    case 'set':
      return { kind: 'set', setId: scope.id };
  }
}
