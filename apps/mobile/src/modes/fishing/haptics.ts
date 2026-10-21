import * as Haptics from 'expo-haptics';

/**
 * The haptics of the fishing mode (docs/design/fishing.md §12).
 *
 * "Cast is Light, bite is Heavy, correct is Success notification, wrong is
 * Error notification, reel is rhythmic Light every 120 ms, and Legendary is
 * Heavy×3. All can be turned off in settings."
 */

let enabled = true;

/** Turns the haptics of the mode on or off. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** Whether the haptics of the mode are on. */
export function isHapticsEnabled(): boolean {
  return enabled;
}

function run(action: () => Promise<void>): void {
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

/** The rod swings. */
export function hapticCast(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A fish bites. */
export function hapticBite(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** The answer was right. */
export function hapticCorrect(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** The answer was wrong. */
export function hapticWrong(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** The reel clicks. */
export function hapticReel(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A legendary catch. */
export function hapticLegend(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  setTimeout(() => {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  }, 140);
  setTimeout(() => {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  }, 280);
}

/** A button was pressed. */
export function hapticTap(): void {
  run(() => Haptics.selectionAsync());
}
