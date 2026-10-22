import { useEffect, useState } from 'react';
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

import type { AvailableUpdate } from './checkForUpdate';
import { installUpdate, type UpdateDownloadProgress } from './installUpdate';

/**
 * The banner of the update.
 *
 * When a release of the game is newer than the app, a banner slides in at
 * the top of the home screen: "Update v0.1.2 is ready — tap to update".
 * A tap downloads the APK from the API and opens the Android installer; the
 * percentage of the download shows in the banner while it runs. The little
 * cross makes the banner go away (and the app remembers that the player does
 * not want to hear about this version again).
 *
 * A phone that cannot install the package (a browser, iOS, an APK that is
 * missing from the release or a download that fails) falls back to the page
 * of the release, so the player can still get the update.
 */

/** The props of the banner. */
export interface UpdateBannerProps {
  /** The release that is ready. */
  update: AvailableUpdate;
  /** Called when the player closes the banner. */
  onDismiss: (version: string) => void;
}

/** What the banner is doing right now. */
type BannerState = 'idle' | 'downloading' | 'installing';

export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  const pulse = useSharedValue(0);
  const [state, setState] = useState<BannerState>('idle');
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + pulse.value * 0.25,
    transform: [{ scale: 0.99 + pulse.value * 0.01 }],
  }));

  const busy = state !== 'idle';
  const title =
    state === 'downloading'
      ? ratio === null
        ? `Downloading v${update.version}…`
        : `Downloading v${update.version} — ${Math.round(ratio * 100)}%`
      : state === 'installing'
        ? `Opening the installer for v${update.version}…`
        : `Update v${update.version} is ready — tap to update`;

  const onDownload = () => {
    if (busy) {
      return;
    }

    hapticImpact('light');
    play('tap');
    setState('downloading');
    setRatio(null);

    void (async () => {
      const result = await installUpdate(update, (progress: UpdateDownloadProgress) => {
        setRatio(progress.ratio);
      });

      // A fallback already opened the page of the release in the browser.
      setState(result === 'installing' ? 'installing' : 'idle');
      if (result !== 'installing') {
        setRatio(null);
      }
    })();
  };

  return (
    <Animated.View style={[styles.wrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Update v${update.version} is ready. Tap to install.`}
        accessibilityHint="Downloads the update and opens the Android installer"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onDownload}
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
            <Text style={styles.kicker}>{busy ? 'UPDATING' : 'UPDATE'}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>

            {state === 'downloading' ? (
              <View
                style={styles.progressTrack}
                accessible
                accessibilityLabel={
                  ratio === null
                    ? 'Downloading the update'
                    : `${Math.round(ratio * 100)} percent downloaded`
                }
              >
                <View
                  style={[
                    styles.progressFill,
                    { width: ratio === null ? '18%' : `${Math.max(4, Math.round(ratio * 100))}%` },
                  ]}
                />
              </View>
            ) : null}
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
  progressTrack: {
    marginTop: 4,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#ffffff',
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
