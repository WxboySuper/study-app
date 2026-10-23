import { parseSyncSnapshot, planDeckSync } from '@study-app/core';
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
 * The sync is quiet: a phone without a network, an endpoint that does not
 * answer or an answer that cannot be read are all silent. The player keeps
 * studying the decks they already have, and the next start tries again.
 */

/** The endpoint of the sync. */
export const SYNC_URL = `${API_BASE_URL}/api/sync`;

/** How long the app waits for the server before it gives up. */
export const SYNC_TIMEOUT_MS = 8000;

/** The shortest time between two automatic syncs. */
export const SYNC_INTERVAL_MS = 10 * 60 * 1000;

/** The key of the cursor of the next sync in the key/value store. */
export const SYNC_CURSOR_KEY = 'sync:lastSync';

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
 * Returns `null` when the sync could not run (no network, a broken answer or
 * a store that is not available): the caller then says nothing. The cursor is
 * only advanced when the plan was applied, so a failed sync is retried from
 * the same place.
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

  try {
    const store = options.store ?? (await openLocalStore());
    const now = options.now ?? Date.now();

    if (!options.force) {
      const lastRun = await readLastRun(store);
      if (lastRun > 0 && now - lastRun < SYNC_INTERVAL_MS) {
        return null;
      }
    }

    // The automatic sync remembers that it ran before it asks the server: a
    // phone that is offline tries again at the next start, not on every
    // return from the background.
    await store.writeKv(SYNC_LAST_RUN_KEY, String(now));

    const since = await readCursor(store);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, SYNC_TIMEOUT_MS);

    let payload: unknown;
    try {
      // `retired=1`: the questions retired on the server come too, so the app
      // hides them and keeps their progress instead of deleting them.
      const response = await doFetch(`${SYNC_URL}?since=${since}&retired=1`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      payload = await response.json();
    } finally {
      clearTimeout(timer);
    }

    const snapshot = parseSyncSnapshot(payload);
    if (snapshot === null) {
      return null;
    }

    const local = await store.readSyncState();
    const plan = planDeckSync(local, snapshot);

    await store.applySyncPlan(plan);
    await store.writeKv(SYNC_CURSOR_KEY, String(plan.cursor));

    const decks = plan.decks.length + plan.deletedDeckIds.length;
    return { decks, message: summaryMessage(decks), cursor: plan.cursor };
  } catch {
    // Offline, no answer, a broken answer: the player never sees an error.
    return null;
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
