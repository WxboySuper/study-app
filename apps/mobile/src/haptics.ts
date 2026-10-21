import * as Haptics from 'expo-haptics';

/**
 * The haptics of the app.
 *
 * Every tap of the game (a button, a pack, a tile) can buzz a little: the
 * setting of the player turns the whole thing off, and a device without a
 * motor never breaks the game.
 */

let enabled = true;

/** Turns the haptics of the app on or off. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** Whether the haptics of the app are on. */
export function isHapticsEnabled(): boolean {
  return enabled;
}

/** Runs a haptic pattern, when the player wants to feel it. */
export function runHaptic(action: () => Promise<void>): void {
  if (!enabled) {
    return;
  }
  try {
    void action().catch(() => {
      // Haptics are not available on every device; never break the game.
    });
  } catch {
    // Ignore.
  }
}

/** A button was pressed. */
export function hapticTap(): void {
  runHaptic(() => Haptics.selectionAsync());
}

/** A chunky button was pressed. */
export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  const impact =
    style === 'heavy'
      ? Haptics.ImpactFeedbackStyle.Heavy
      : style === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  runHaptic(() => Haptics.impactAsync(impact));
}

/** Something good happened. */
export function hapticSuccess(): void {
  runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Something bad happened. */
export function hapticError(): void {
  runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
