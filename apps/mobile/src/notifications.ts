import * as Notifications from 'expo-notifications';

/**
 * Push notification helpers.
 *
 * This is a stub for Phase 0: nothing here is called on startup, the
 * permission prompt only shows up once the player explicitly opts in (Phase 2
 * ships the actual reminder types).
 */

/** Asks for the notification permission. Returns whether it was granted. */
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

/** Returns the Expo push token of this device, if there is one. */
export async function getExpoPushToken(): Promise<string | null> {
  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}
