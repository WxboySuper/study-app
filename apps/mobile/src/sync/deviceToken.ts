import * as SecureStore from "expo-secure-store";

/**
 * The sync device token, kept in the iOS keychain / Android keystore
 * instead of the plain key/value store. Never logged, never shown.
 */

const DEVICE_TOKEN_KEY = "study-app-sync-device-token";

/** The saved token, `null` when there is none (or the keystore fails). */
export async function readDeviceToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Saves the token; `false` when the keystore is not available. */
export async function saveDeviceToken(token: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** Forgets the token. */
export async function deleteDeviceToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
  } catch {
    // Nothing to forget.
  }
}
