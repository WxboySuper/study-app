import * as Haptics from 'expo-haptics';

import { runHaptic } from '@/haptics';

/**
 * The haptics of the fishing mode (docs/design/fishing.md §12).
 *
 * "Cast is Light, bite is Heavy, correct is Success notification, wrong is
 * Error notification, reel is rhythmic Light every 120 ms, and Legendary is
 * Heavy×3. All can be turned off in settings."
 */

export { isHapticsEnabled, setHapticsEnabled } from '@/haptics';

/** The rod swings. */
export function hapticCast(): void {
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A fish bites. */
export function hapticBite(): void {
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** The answer was right. */
export function hapticCorrect(): void {
  runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** The answer was wrong. */
export function hapticWrong(): void {
  runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** The reel clicks. */
export function hapticReel(): void {
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A legendary catch. */
export function hapticLegend(): void {
  runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  setTimeout(() => {
    runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  }, 140);
  setTimeout(() => {
    runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  }, 280);
}
