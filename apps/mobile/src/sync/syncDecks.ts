import {
  DECK_SYNC_FORMAT,
  DECK_SYNC_IDLE,
  deckSyncSince,
  describeSyncFailure,
  parseSyncSnapshot,
  planDeckSync,
  splitSyncPlan,
  type DeckSyncFailure,
  type DeckSyncStatus,
} from '@study-app/core';
import { AppState, type AppStateStatus } from 'react-native';

import { API_BASE_URL } from '@/config';
import { openLocalStore } from '@/db/local';
import type { LocalStore } from '@/db/types';

/**
 * The sync of the decks with the server.
 *
 * The app asks `GET /api/sync?since=<cursor>` for the decks that changed since
 * the last sync. The cursor is the `now` of the answer of the server, kept in
 * the key/value store of the app. The merge itself is pure and lives in
 * `@study-app/core` (`planDeckSync`); this file fetches the answer and hands
 * the plan to the local store.
 *
 * A sync that fails never interrupts the player (they keep studying the decks
 * they already have and the next start tries again), but it is no longer
 * silent: the reason is logged and kept in a small status
 * ({@link getDeckSyncStatus}) that the home screen shows next to its Sync now
 * button. A silent failure once hid a library that never arrived.
 */

/** The endpoint of the sync. */
export const SYNC_URL = `${API_BASE_URL}/api/sync`;

/** How long the app waits for the server before it gives up (a big library is a big answer). */
export const SYNC_TIMEOUT_MS = 30_000;

/** The shortest time between two automatic syncs. */
export const SYNC_INTERVAL_MS = 10 * 60 * 1000;

/** How many decks one transaction of the local store writes. */
const SYNC_BATCH_DECKS = 8;

/** The key of the cursor of the next sync in the key/value store. */
export const SYNC_CURSOR_KEY = 'sync:lastSync';

/**
 * The key of the deck format the local decks were last fully synced with.
 * When the app learns a new question format (math questions, steps-only math
 * questions), the decks it stored before were saved in the old shape and the
 * cursor alone would never send them again; see `deckSyncSince`.
 */
export const SYNC_FORMAT_KEY = 'sync:format';

/** The key of the moment of the last automatic sync. */
export const SYNC_LAST_RUN_KEY = 'sync:lastRun';

/** What a sync changed. */
export interface DeckSyncSummary {
  /** How many decks were created, updated or removed. */
  decks: number;
  /** A line for the player ("3 decks updated"). */
  message: string;
  /** The cursor of the next sync. */
  cursor: number;
}

/** The options of a sync. */
export interface DeckSyncOptions {
  /** Reads the endpoint (the tests and the web build can give their own). */
  fetchImpl?: typeof fetch;
  /** The store that holds the decks and the cursor. */
  store?: LocalStore;
  /** The time of the sync (epoch milliseconds). */
  now?: number;
  /** Runs even when the last automatic sync is recent. */
  force?: boolean;
}

/** The sync that is running right now (a second call joins it). */
let running: Promise<DeckSyncSummary | null> | null = null;

/** What the last sync did (the home screen shows it). */
let status: DeckSyncStatus = DECK_SYNC_IDLE;

/** The screens that watch the status. */
const listeners = new Set<(next: DeckSyncStatus) => void>();

/** The status of the sync of the decks. */
export function getDeckSyncStatus(): DeckSyncStatus {
  return status;
}

/** Calls `listener` every time the status changes. Returns the function that stops it. */
export function subscribeDeckSyncStatus(listener: (next: DeckSyncStatus) => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Changes the status and tells the screens. */
function setStatus(next: DeckSyncStatus): void {
  status = next;
  for (const listener of [...listeners]) {
    listener(next);
  }
}

/**
 * When the decks were last synced for real, or `null` when they never were.
 *
 * It is the cursor of the last good sync (the `now` of the answer of the
 * server), which is the moment the sync worked.
 */
export async function readLastSynced(store?: LocalStore): Promise<number | null> {
  try {
    const cursor = await readCursor(store ?? (await openLocalStore()));
    return cursor > 0 ? cursor : null;
  } catch {
    return null;
  }
}

/** Logs a failed sync, keeps the reason in the status and answers `null`. */
function fail(reason: DeckSyncFailure, error?: unknown): null {
  console.warn(`[sync] decks sync failed (${reason}): ${describeSyncFailure(reason)}`, error ?? '');
  const detail = errorText(error);
  setStatus(
    detail === '' ? { state: 'error', reason, at: Date.now() } : { state: 'error', reason, at: Date.now(), detail },
  );
  return null;
}

/** A short, readable text for an error (empty when there is nothing to say). */
function errorText(error: unknown): string {
  const text =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Reads the cursor of the last sync (`0` when the app never synced). */
async function readCursor(store: LocalStore): Promise<number> {
  const value = await store.readKv(SYNC_CURSOR_KEY);
  if (value === null) {
    return 0;
  }

  const cursor = Number.parseInt(value, 10);
  return Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
}

/** Reads the moment of the last automatic sync (`0` when it never ran). */
async function readLastRun(store: LocalStore): Promise<number> {
  const value = await store.readKv(SYNC_LAST_RUN_KEY);
  if (value === null) {
    return 0;
  }

  const lastRun = Number.parseInt(value, 10);
  return Number.isFinite(lastRun) ? lastRun : 0;
}

/** The line the player reads after a sync. */
function summaryMessage(decks: number): string {
  if (decks === 0) {
    return 'Everything is up to date.';
  }

  return `${decks} deck${decks === 1 ? '' : 's'} updated`;
}

/**
 * Pulls the decks that changed and writes them in the local store.
 *
 * Returns `null` when the sync did not happen: either it was skipped (an
 * automatic sync that ran a few minutes ago) or it failed (no network, a timeout,
 * a broken answer or a store that is not available). A failure is logged and
 * shows in {@link getDeckSyncStatus}. The cursor is only advanced when the plan
 * was applied, so a failed sync is retried from the same place.
 */
export async function syncDecks(
  options: DeckSyncOptions = {},
): Promise<DeckSyncSummary | null> {
  if (running !== null) {
    return running;
  }

  running = runSync(options).finally(() => {
    running = null;
  });

  return running;
}

/** The body of {@link syncDecks}, without the guard against a double sync. */
async function runSync(options: DeckSyncOptions): Promise<DeckSyncSummary | null> {
  const doFetch = options.fetchImpl ?? fetch;

  // Where a failure comes from, so the player (and the log) know what broke.
  let failure: DeckSyncFailure = 'store';

  try {
    const store = options.store ?? (await openLocalStore());
    const now = options.now ?? Date.now();

    if (!options.force) {
      const lastRun = await readLastRun(store);
      if (lastRun > 0 && now - lastRun < SYNC_INTERVAL_MS) {
        // Skipped, not failed: the status stays as it is.
        return null;
      }
    }

    setStatus({ state: 'syncing' });

    // The automatic sync remembers that it ran before it asks the server: a
    // phone that is offline tries again at the next start, not on every
    // return from the background.
    await store.writeKv(SYNC_LAST_RUN_KEY, String(now));

    const since = deckSyncSince(
      await readCursor(store),
      await store.readKv(SYNC_FORMAT_KEY),
    );
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, SYNC_TIMEOUT_MS);

    let payload: unknown;
    try {
      // `retired=1`: the questions retired on the server come too, so the app
      // hides them and keeps their progress instead of deleting them.
      failure = 'offline';
      const response = await doFetch(`${SYNC_URL}?since=${since}&retired=1`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return fail('server', `HTTP ${response.status}`);
      }

      failure = 'unreadable';
      payload = await response.json();
    } catch (error) {
      // An aborted request is the timeout, whatever the platform calls it.
      throw controller.signal.aborted ? new SyncTimeout(error) : error;
    } finally {
      clearTimeout(timer);
    }

    const snapshot = parseSyncSnapshot(payload);
    if (snapshot === null) {
      return fail('unreadable', 'the answer is not a sync snapshot');
    }

    failure = 'store';
    const local = await store.readSyncState();
    const plan = planDeckSync(local, snapshot);

    // Small transactions: a big one on the shared connection can collide with
    // the screens that read at the same time. The cursor only moves at the
    // end, so a retry plans the rest again.
    for (const part of splitSyncPlan(plan, SYNC_BATCH_DECKS)) {
      await store.applySyncPlan(part);
    }
    await store.writeKv(SYNC_CURSOR_KEY, String(plan.cursor));
    await store.writeKv(SYNC_FORMAT_KEY, String(DECK_SYNC_FORMAT));

    const decks = plan.decks.length + plan.deletedDeckIds.length;
    const message = summaryMessage(decks);
    setStatus({ state: 'ok', message, at: Date.now() });
    return { decks, message, cursor: plan.cursor };
  } catch (error) {
    // Offline, no answer, a broken answer: the player keeps studying, and
    // the home screen says what happened.
    if (error instanceof SyncTimeout) {
      return fail('timeout', error.original);
    }
    return fail(failure, error);
  }
}

/** The request ran out of time (see {@link SYNC_TIMEOUT_MS}). */
class SyncTimeout extends Error {
  constructor(readonly original: unknown) {
    super('The sync timed out.');
  }
}

/**
 * Starts the sync of the app.
 *
 * It runs once when the app starts and again when the app comes back from the
 * background, but never more than once every {@link SYNC_INTERVAL_MS}. The
 * returned function stops the checks.
 */
export function startDeckSync(): () => void {
  void syncDecks();

  const onChange = (state: AppStateStatus) => {
    if (state === 'active') {
      void syncDecks();
    }
  };

  const subscription = AppState.addEventListener('change', onChange);

  return () => {
    subscription.remove();
  };
}
