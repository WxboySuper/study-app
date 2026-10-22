/**
 * The web has no keystore: the token stays in the browser's key/value
 * store, so these are no-ops and the identity keeps its token.
 */

export async function readDeviceToken(): Promise<string | null> {
  return null;
}

export async function saveDeviceToken(_token: string): Promise<boolean> {
  return false;
}

export async function deleteDeviceToken(): Promise<void> {}
