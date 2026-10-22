import type { DeckClassMap } from './queue';

/**
 * The classes of the game.
 *
 * A class is a pile of decks: the player groups the decks they study (a
 * class per school subject, per exam, per week...) and studies a whole class
 * at once. The rules live here, in the pure core, so the app and the tests
 * share them.
 */

/** A deck, as far as the classes are concerned. */
export interface ClassDeck {
  /** The id of the deck (the id of its set). */
  id: string;
  /** The id of the class of the deck (`null` when it has none). */
  classId?: string | null;
}

/**
 * Builds the map of the classes of the decks.
 *
 * The map is what the queue needs to answer "which questions belong to this
 * class?". A deck without a class is in the "Unsorted" bucket.
 */
export function buildDeckClassMap(decks: readonly ClassDeck[]): DeckClassMap {
  const map = new Map<string, string | null>();
  for (const deck of decks) {
    map.set(deck.id, deck.classId ?? null);
  }
  return map;
}

/**
 * The decks of a class.
 *
 * `null` is the "Unsorted" bucket: the decks that do not belong to any class.
 */
export function decksOfClass<T extends ClassDeck>(
  decks: readonly T[],
  classId: string | null,
): T[] {
  return decks.filter((deck) => (deck.classId ?? null) === classId);
}
