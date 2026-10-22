/**
 * The saved Mastery-mode progress: correct answers by question id.
 *
 * Fish Frenzy writes it at the end of every mastery session. The deck
 * detail screen reads it to show "n/3" per question.
 */

/** The key/value key of the mastery progress. */
export const MASTERY_COUNTS_KEY = 'fishing.masteryCounts.v1';

/** Reads the mastery progress of earlier sessions (`{}` when unreadable). */
export async function readMasteryCounts(store: {
  readKv(key: string): Promise<string | null>;
}): Promise<Record<string, number>> {
  try {
    const raw = await store.readKv(MASTERY_COUNTS_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}
