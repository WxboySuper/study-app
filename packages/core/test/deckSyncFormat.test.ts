import { describe, expect, it } from 'vitest';
import { DECK_SYNC_FORMAT, deckSyncSince } from '../src/deckSyncFormat';

describe('deckSyncSince', () => {
  it('asks for every deck when no format was stored (decks synced before v0.1.24)', () => {
    expect(deckSyncSince(1792772849352, null)).toBe(0);
  });
  it('asks for every deck when the stored format is older', () => {
    expect(deckSyncSince(500, String(DECK_SYNC_FORMAT - 1))).toBe(0);
    expect(deckSyncSince(500, 'junk')).toBe(0);
  });
  it('keeps the cursor once the decks were synced with the current format', () => {
    expect(deckSyncSince(500, String(DECK_SYNC_FORMAT))).toBe(500);
  });
});
