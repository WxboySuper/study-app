import { isNewerVersion, parseRelease, type ReleaseInfo } from '@study-app/core';
import Constants from 'expo-constants';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { API_BASE_URL } from '@/config';
import { openLocalStore } from '@/db/local';
import type { LocalStore } from '@/db/types';

/**
 * The update check of the game.
 *
 * The app asks the API for the latest release (`GET /api/update`), compares
 * its version with the version of the app (the `version` of `app.json`) and
 * shows a banner when the release is newer. The API reads the release feed
 * of GitHub for every device, so the app never touches GitHub itself.
 *
 * The check runs on every cold start and, at most every fifteen minutes,
 * when the app comes back to the foreground. A network that is not
 * there, an endpoint that does not answer or a release that is not a version
 * never show an error to the player, but they are logged.
 */

/** The endpoint of the latest release of the game. */
export const UPDATE_FEED_URL = `${API_BASE_URL}/api/update`;

/** How long the app waits for the feed before it gives up. */
export const UPDATE_TIMEOUT_MS = 5000;

/** How long the app waits between two checks. */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** The key of the last check in the key/value store. */
export const UPDATE_LAST_CHECK_KEY = 'update:lastCheck';

/** The prefix of the keys of the dismissed versions. */
export const UPDATE_DISMISSED_KEY = 'update:dismissed:';

/** A release that is newer than the app. */
export type AvailableUpdate = ReleaseInfo;

/**
 * Reads a release of the feed.
 *
 * The rules live in `@study-app/core` (the reading of a feed is pure, so it
 * can be tested without a network).
 */
export { parseRelease };

/** The options of a check. */
export interface UpdateCheckOptions {
  /** The function that reads the feed (the tests give their own). */
  fetchImpl?: typeof fetch;
  /** The time of the check (epoch milliseconds). */
  now?: number;
  /** The store that remembers the dismissed versions. */
  store?: LocalStore;
  /** A check the player asked for: no throttle, dismissed versions show too. */
  force?: boolean;
}

/** Why the last check failed (`null` when it worked). */
let lastError: string | null = null;

/** Why the last check failed, for the Settings button. */
export function lastUpdateError(): string | null {
  return lastError;
}

/** Logs a failed check: failures are never silent in the logs. */
function logFailure(reason: string): void {
  lastError = reason;
  console.warn(`[update] check failed: ${reason}`);
}

/** The version of the app (the `version` of `app.json`). */
export function appVersion(): string {
  const config = Constants.expoConfig?.version;
  if (typeof config === 'string' && config.trim() !== '') {
    return config;
  }

  const native = Constants.nativeAppVersion;
  return typeof native === 'string' && native.trim() !== '' ? native : '0.0.0';
}

/**
 * Reads the latest release of the feed.
 *
 * The feed is read with a timeout: a network that hangs never keeps the app
 * waiting. Every error is swallowed: a check that fails is a check that says
 * nothing.
 */
export async function fetchLatestUpdate(
  options: UpdateCheckOptions = {},
): Promise<AvailableUpdate | null> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, UPDATE_TIMEOUT_MS);

  try {
    const response = await doFetch(UPDATE_FEED_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });

    if (!response.ok) {
      logFailure(`HTTP ${response.status} from ${UPDATE_FEED_URL}`);
      return null;
    }

    const payload: unknown = await response.json();
    const release = parseRelease(payload);
    if (release === null) {
      logFailure('the feed did not carry a release');
    } else {
      lastError = null;
    }
    return release;
  } catch (error) {
    // The player never sees an error because of a background check, but
    // the logs (and the Settings button) do.
    logFailure(error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Looks for a release that is newer than the app.
 *
 * The version of the release is compared with the version of the app with
 * the rules of semver (the ones of `@study-app/core`). A release the player
 * already dismissed is not returned.
 */
export async function checkForUpdate(
  options: UpdateCheckOptions = {},
): Promise<AvailableUpdate | null> {
  const release = await fetchLatestUpdate(options);
  if (release === null) {
    return null;
  }

  if (!isNewerVersion(release.version, appVersion())) {
    return null;
  }

  if (options.force !== true && (await isUpdateDismissed(release.version, options))) {
    return null;
  }

  return release;
}

/** Whether the player already dismissed a version. */
export async function isUpdateDismissed(
  version: string,
  options: UpdateCheckOptions = {},
): Promise<boolean> {
  try {
    const store = options.store ?? (await openLocalStore());
    const value = await store.readKv(`${UPDATE_DISMISSED_KEY}${version}`);
    return value !== null;
  } catch {
    // Without a store the banner shows: it is better to show it twice than
    // to never show it.
    return false;
  }
}

/** Remembers that the player dismissed a version. */
export async function dismissUpdate(
  version: string,
  options: UpdateCheckOptions = {},
): Promise<void> {
  try {
    const store = options.store ?? (await openLocalStore());
    await store.writeKv(`${UPDATE_DISMISSED_KEY}${version}`, '1');
  } catch {
    // The dismissal is forgotten: the banner comes back at the next start.
  }
}

/** A listener of the updates of the game. */
export type UpdateListener = (update: AvailableUpdate | null) => void;

/** The listeners of the updates. */
const listeners = new Set<UpdateListener>();

/** The release the app knows about right now. */
let current: AvailableUpdate | null = null;

/**
 * Listens to the updates of the game.
 *
 * The listener is called right away with the release the app already knows
 * about, and then every time a new one is found.
 */
export function subscribeToUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(current);

  return () => {
    listeners.delete(listener);
  };
}

/** The release the app knows about right now. */
export function currentUpdate(): AvailableUpdate | null {
  return current;
}

/** Tells the listeners that a release was found (or that there is none). */
function publish(update: AvailableUpdate | null): void {
  current = update;
  for (const listener of listeners) {
    listener(update);
  }
}

/** When the last check of this run of the app ran (epoch milliseconds). */
let lastCheckAt = 0;

/**
 * Runs the check, but not more than once every fifteen minutes.
 *
 * The throttle lives in memory only: every cold start checks. (Up to
 * v0.1.6 the moment of the last check was saved on the phone, before the
 * request even ran, and the check then returned nothing for six hours:
 * a release published in that window stayed invisible, even after a
 * restart.)
 */
export async function runUpdateCheck(
  options: UpdateCheckOptions = {},
): Promise<AvailableUpdate | null> {
  const now = options.now ?? Date.now();
  if (options.force !== true && lastCheckAt !== 0 && now - lastCheckAt < UPDATE_CHECK_INTERVAL_MS) {
    return current;
  }

  const update = await checkForUpdate(options);
  if (lastError === null) {
    lastCheckAt = now;
  }
  publish(update);
  return update;
}

/**
 * Starts the update checks of the app.
 *
 * The check runs once when the app starts, and again (at most every fifteen
 * minutes) when the app comes back to the foreground. The returned function stops the
 * checks.
 */
export function startUpdateChecks(): () => void {
  void runUpdateCheck();

  const onChange = (state: AppStateStatus) => {
    if (state === 'active') {
      void runUpdateCheck();
    }
  };

  const subscription = AppState.addEventListener('change', onChange);

  return () => {
    subscription.remove();
  };
}

/**
 * Opens the release in the browser of the phone.
 *
 * The page of the release is preferred; when the feed only gives the APK,
 * the download starts instead. A phone without a browser simply keeps
 * playing.
 */
export async function openReleasePage(update: AvailableUpdate): Promise<void> {
  const target = update.url !== '' ? update.url : update.apkUrl;
  if (target === null || target === '') {
    return;
  }

  try {
    await Linking.openURL(target);
  } catch {
    // No browser: the player keeps playing.
  }
}
