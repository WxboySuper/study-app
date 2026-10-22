import Constants from 'expo-constants';

/**
 * The configuration of the app.
 *
 * The URL of the API lives in `app.json` (`expo.extra.apiBaseUrl`), so a
 * build can point at a local Worker or at the live one without touching the
 * code.
 */

/** The live API of the game. */
export const DEFAULT_API_BASE_URL = 'https://cramcritters-api.alex-miller-6464.workers.dev';

/** The base URL of the API (without a trailing slash). */
export const API_BASE_URL = readApiBaseUrl();

/** Reads the API URL of `app.json`. */
function readApiBaseUrl(): string {
  const extra: unknown = Constants.expoConfig?.extra;

  if (typeof extra === 'object' && extra !== null) {
    const value = (extra as { apiBaseUrl?: unknown }).apiBaseUrl;
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim().replace(/\/+$/, '');
    }
  }

  return DEFAULT_API_BASE_URL;
}
