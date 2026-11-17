import { describe, expect, it } from 'vitest';

import {
  DECK_SYNC_ERROR_LINE,
  DECK_SYNC_IDLE,
  deckSyncLines,
  describeSyncFailure,
  timeAgo,
  type DeckSyncFailure,
} from '../src/deckSyncStatus';

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

describe('timeAgo', () => {
  it('says "just now" for the first seconds', () => {
    expect(timeAgo(NOW - 5_000, NOW)).toBe('just now');
    expect(timeAgo(NOW, NOW)).toBe('just now');
  });

  it('never goes negative when the clock is behind', () => {
    expect(timeAgo(NOW + 10 * MINUTE, NOW)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(timeAgo(NOW - 5 * MINUTE, NOW)).toBe('5 min ago');
    expect(timeAgo(NOW - 3 * 60 * MINUTE, NOW)).toBe('3 h ago');
    expect(timeAgo(NOW - 24 * 60 * MINUTE, NOW)).toBe('1 day ago');
    expect(timeAgo(NOW - 3 * 24 * 60 * MINUTE, NOW)).toBe('3 days ago');
  });
});

describe('describeSyncFailure', () => {
  it('has a sentence for every reason', () => {
    const reasons: DeckSyncFailure[] = ['timeout', 'offline', 'server', 'unreadable', 'store'];
    const lines = reasons.map(describeSyncFailure);

    expect(new Set(lines).size).toBe(reasons.length);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(10);
    }
  });
});

describe('deckSyncLines', () => {
  it('tells a phone that never synced', () => {
    const lines = deckSyncLines(DECK_SYNC_IDLE, null, NOW);

    expect(lines.title).toBe('Sync decks');
    expect(lines.detail).toBe('Never synced');
    expect(lines.action).toBe('SYNC NOW');
    expect(lines.busy).toBe(false);
    expect(lines.failed).toBe(false);
  });

  it('shows the last sync when idle', () => {
    const lines = deckSyncLines(DECK_SYNC_IDLE, NOW - 12 * MINUTE, NOW);
    expect(lines.detail).toBe('Last synced 12 min ago');
  });

  it('is busy and blocks the button while a sync runs', () => {
    const lines = deckSyncLines({ state: 'syncing' }, NOW - MINUTE, NOW);

    expect(lines.title).toBe('Syncing decks…');
    expect(lines.busy).toBe(true);
    expect(lines.failed).toBe(false);
  });

  it('shows the result of a good sync', () => {
    const lines = deckSyncLines(
      { state: 'ok', message: '204 decks updated', at: NOW },
      NOW,
      NOW,
    );

    expect(lines.title).toBe('204 decks updated');
    expect(lines.detail).toBe('Last synced just now');
    expect(lines.failed).toBe(false);
  });

  it('warns the player after a failure, keeps the last good sync and offers a retry', () => {
    const lines = deckSyncLines(
      { state: 'error', reason: 'timeout', at: NOW },
      NOW - 3 * 60 * MINUTE,
      NOW,
    );

    expect(lines.title).toBe(DECK_SYNC_ERROR_LINE);
    expect(lines.title).toContain('tap Sync now');
    expect(lines.detail).toContain('too long');
    expect(lines.detail).toContain('Last synced 3 h ago');
    expect(lines.action).toBe('RETRY');
    expect(lines.busy).toBe(false);
    expect(lines.failed).toBe(true);
  });

  it('says a failed phone that never synced has never synced', () => {
    const lines = deckSyncLines({ state: 'error', reason: 'offline', at: NOW }, null, NOW);
    expect(lines.detail).toContain('Never synced');
  });
});

describe('error detail', () => {
  it('shows the detail of a failure in the second line', () => {
    const lines = deckSyncLines(
      { state: 'error', reason: 'store', at: NOW, detail: 'database is locked' },
      null,
      NOW,
    );
    expect(lines.detail).toContain('(database is locked)');
  });
});
