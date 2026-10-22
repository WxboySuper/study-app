/**
 * The little things a deck needs before it is parsed.
 *
 * The import screen reads a deck from the clipboard or from a file and hands
 * it to `parseDeck` of `@study-app/core` with a name: the name of the JSON
 * deck, the name of the file, or the fallback.
 */

/** The name of a deck that carries no name at all. */
export const FALLBACK_DECK_NAME = 'Imported deck';

/** A deck that was read from a file. */
export interface PickedFile {
  /** The text of the file. */
  text: string;
  /** The name of the file, without its extension. */
  name: string;
}

/**
 * The name of a deck that comes from a file.
 *
 * "capitals.json" is called "capitals": the extension of the file is not
 * part of the name of the deck.
 */
export function withoutExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
