import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { hapticImpact } from '@/haptics';
import { play } from '@/sound/sfx';
import { colors, fonts, gradients, radius, shadow, spacing } from '@/theme';
import { GlassCard, Glow } from '@/ui';

import { openReleasePage, type AvailableUpdate } from './checkForUpdate';

/**
 * The banner of the update.
 *
 * When a release of the game is newer than the app, a banner slides in at
 * the top of the home screen: "Update v0.1.2 is ready — tap to download".
 * A tap opens the page of the release, the little cross makes it go away
 * (and the app remembers that the player does not want to hear about this
 * version again).
 */

/** The props of the banner. */
export interface UpdateBannerProps {
  /** The release that is ready. */
  update: AvailableUpdate;
  /** Called when the player closes the banner. */
  onDismiss: (version: string) => void;
}

export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + pulse.value * 0.25,
    transform: [{ scale: 0.99 + pulse.value * 0.01 }],
  }));

  return (
    <Animated.View style={[styles.wrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Update v${update.version} is ready. Tap to download.`}
        accessibilityHint="Opens the page of the release in your browser"
        onPress={() => {
          hapticImpact('light');
          play('tap');
          void openReleasePage(update);
        }}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        <GlassCard
          style={styles.card}
          contentStyle={styles.content}
          face={gradients.primary}
          tint={colors.primaryLight}
          elevated={false}
        >
          <Glow color={colors.primary} size={140} opacity={0.5} style={styles.glow} />

          <Text style={styles.emoji}>🆕</Text>

          <View style={styles.text}>
            <Text style={styles.kicker}>UPDATE</Text>
            <Text style={styles.title} numberOfLines={2}>
              Update v{update.version} is ready — tap to download
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Do not show this update again"
            onPress={() => {
              hapticImpact('light');
              play('tap');
              onDismiss(update.version);
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Text style={styles.closeGlyph}>✕</Text>
          </Pressable>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.card,
  },
  pressable: {
    borderRadius: radius.card,
  },
  pressed: {
    opacity: 0.85,
  },
  card: {
    borderRadius: radius.card,
    ...shadow.glow,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  glow: {
    position: 'absolute',
    top: -50,
    right: -30,
  },
  emoji: {
    fontSize: 28,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.title,
    fontSize: 10,
    letterSpacing: 2,
  },
  title: {
    color: '#ffffff',
    fontFamily: fonts.titleSemi,
    fontSize: 14,
    lineHeight: 18,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeGlyph: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 14,
  },
});
