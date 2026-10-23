/**
 * The version of the question format the app stores from the deck sync.
 *
 * 1: multiple choice and self-graded questions only (before v0.1.19).
 * 2: math questions with their math spec, steps-only math questions too.
 *
 * Raise it whenever the app starts to keep something new from the sync: the
 * next sync then asks for every deck again (`since=0`) and rewrites the
 * stored questions in place. The ids and the progress stay.
 */
export const DECK_SYNC_FORMAT = 2;

/**
 * The `since` of the next deck sync: the stored cursor, or `0` (every deck)
 * when the local decks were synced with an older format (or no format was
 * stored, the apps before v0.1.24).
 */
export function deckSyncSince(cursor: number, storedFormat: string | null): number {
  const format = storedFormat === null ? 0 : Number.parseInt(storedFormat, 10);
  if (!Number.isFinite(format) || format < DECK_SYNC_FORMAT) {
    return 0;
  }
  return cursor;
}
