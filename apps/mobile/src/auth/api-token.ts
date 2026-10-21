import * as SecureStore from 'expo-secure-store';

/**
 * The API bearer token of the player.
 *
 * The token is not created yet (Phase 1), but the plumbing is in place: it is
 * stored in the iOS keychain / Android keystore through `expo-secure-store`
 * and never in plain text on disk.
 */

const API_TOKEN_KEY = 'study-app-api-token';

/** Returns the stored API token, if there is one. */
export async function getApiToken(): Promise<string | null> {
  return SecureStore.getItemAsync(API_TOKEN_KEY);
}

/** Stores the API token in the secure store. */
export async function setApiToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(API_TOKEN_KEY, token);
}

/** Removes the API token from the secure store. */
export async function deleteApiToken(): Promise<void> {
  await SecureStore.deleteItemAsync(API_TOKEN_KEY);
}
