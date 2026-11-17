/**
 * What the player sees about the sync of the decks.
 *
 * The sync used to fail silently (an 8 second timeout and a quiet `null`), so
 * a library that never arrived looked like a library that was up to date.
 * The app now keeps a small status, and this module is the pure part of it:
 * the shape of the status, the reason of a failure and the lines the home
 * screen shows. The fetching itself lives in the app (`syncDecks.ts`).
 */

/** Why a sync failed. */
export type DeckSyncFailure =
  /** The server did not answer in time. */
  | 'timeout'
  /** There was no network (the request could not be made). */
  | 'offline'
  /** The server answered with an error status. */
  | 'server'
  /** The answer could not be read as decks. */
  | 'unreadable'
  /** The decks could not be written in the local store. */
  | 'store';

/** The state of the sync of the decks. */
export type DeckSyncStatus =
  /** Nothing ran yet in this session. */
  | { state: 'idle' }
  /** A sync is running. */
  | { state: 'syncing' }
  /** The last sync worked. */
  | { state: 'ok'; message: string; at: number }
  /** The last sync failed. */
  | { state: 'error'; reason: DeckSyncFailure; at: number; detail?: string };

/** The status of an app that has not synced yet. */
export const DECK_SYNC_IDLE: DeckSyncStatus = { state: 'idle' };

/** The line that says a sync failed (the same for every reason: the action is the same). */
export const DECK_SYNC_ERROR_LINE = "Couldn't sync decks — tap Sync now";

/** What a failure means, for the log and for a player who wants to know. */
export function describeSyncFailure(reason: DeckSyncFailure): string {
  switch (reason) {
    case 'timeout':
      return 'The server took too long to answer.';
    case 'offline':
      return 'There is no network right now.';
    case 'server':
      return 'The server answered with an error.';
    case 'unreadable':
      return 'The answer of the server could not be read.';
    case 'store':
      return 'The decks could not be saved on this phone.';
  }
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));

  if (seconds < 45) {
    return 'just now';
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** The two lines of the Sync now bar: a title and a smaller line under it. */
export interface DeckSyncLines {
  title: string;
  detail: string;
  /** The label of the button. */
  action: string;
  /** `true` when the button must not be pressed (a sync is running). */
  busy: boolean;
  /** `true` when the bar warns the player. */
  failed: boolean;
}

/**
 * The lines of the Sync now bar.
 *
 * @param status The status of the sync.
 * @param lastSyncedAt When the decks were last synced for real (the cursor of
 *   the last good sync), or `null` when they never were.
 * @param now The time now.
 */
export function deckSyncLines(
  status: DeckSyncStatus,
  lastSyncedAt: number | null,
  now: number,
): DeckSyncLines {
  const last =
    lastSyncedAt === null ? 'Never synced' : `Last synced ${timeAgo(lastSyncedAt, now)}`;

  switch (status.state) {
    case 'syncing':
      return {
        title: 'Syncing decks…',
        detail: 'This can take a moment.',
        action: 'SYNCING',
        busy: true,
        failed: false,
      };
    case 'ok':
      return {
        title: status.message,
        detail: last,
        action: 'SYNC NOW',
        busy: false,
        failed: false,
      };
    case 'error':
      return {
        title: DECK_SYNC_ERROR_LINE,
        detail:
          `${describeSyncFailure(status.reason)} ${last}.` +
          (status.detail === undefined || status.detail === '' ? '' : ` (${status.detail})`),
        action: 'RETRY',
        busy: false,
        failed: true,
      };
    case 'idle':
      return {
        title: 'Sync decks',
        detail: last,
        action: 'SYNC NOW',
        busy: false,
        failed: false,
      };
  }
}
