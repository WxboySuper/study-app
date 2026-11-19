import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, radius, shadow } from '@/theme';
import { Glow, Particles } from '@/ui';

/**
 * The "HOOKED!" banner of the fishing mode.
 *
 * It slams into the middle of the screen with a tilt and a shake
 * (docs/design/fishing.md §3): the word lands, the screen flashes gold and
 * the phone buzzes.
 */
export interface HookedBannerProps {
  /** `true` while the banner is on the screen. */
  visible: boolean;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
  /** Called when the player taps the banner (to reel in). */
  onReel: () => void;
}

export function HookedBanner({ visible, reduceMotion, onReel }: HookedBannerProps) {
  const scale = useSharedValue(0.4);
  const rotate = useSharedValue(-14);
  const shake = useSharedValue(0);
  const burst = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (reduceMotion) {
      scale.value = 1;
      rotate.value = -6;
      shake.value = 0;
      burst.value = 0;
      return;
    }

    scale.value = withSequence(
      withTiming(1.25, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 8, stiffness: 190 }),
    );
    rotate.value = withSequence(
      withTiming(5, { duration: 120 }),
      withSpring(-6, { damping: 9, stiffness: 150 }),
    );
    shake.value = withSequence(
      withTiming(1, { duration: 55 }),
      withTiming(-1, { duration: 55 }),
      withTiming(0.6, { duration: 55 }),
      withTiming(0, { duration: 55 }),
    );
    burst.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
  }, [visible, reduceMotion, scale, rotate, shake, burst]);

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: scale.value > 0.05 ? 1 : 0,
    transform: [
      { translateX: shake.value * 10 },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value * 0.5,
    transform: [{ scale: 0.6 + burst.value * 0.8 }],
  }));

  // One tap reels once: a double tap never skips the question.
  const reeled = useRef(false);
  useEffect(() => {
    reeled.current = false;
  }, [visible]);
  const reelOnce = useCallback(() => {
    if (reeled.current) {
      return;
    }
    reeled.current = true;
    onReel();
  }, [onReel]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.screen} pointerEvents="box-none">
    {/* A tap anywhere on the screen reels the catch in. */}
    <Pressable
      testID="fishing-hooked-anywhere"
      accessible={false}
      onPress={reelOnce}
      style={StyleSheet.absoluteFill}
    />
    <Animated.View style={[styles.container, bannerStyle]} pointerEvents="box-none">
      <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
        <Glow color={colors.gold} size={420} opacity={0.9} />
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reel in the catch"
        accessibilityHint="Tap to start the question"
        onPress={reelOnce}
        style={styles.tapTarget}
      >
        <View style={styles.banner}>
          <Text style={styles.text}>HOOKED!</Text>
          <View style={styles.underline} />
        </View>

        <Text style={styles.hint}>TAP TO REEL</Text>
      </Pressable>

      <Particles
        trigger={visible ? 1 : 0}
        count={18}
        colors={[colors.gold, '#fff7d6', '#ffffff']}
        size={11}
        distance={170}
        gravity={320}
        duration={900}
      />
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    position: 'absolute',
    top: '44%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  burst: {
    position: 'absolute',
    top: -110,
  },
  tapTarget: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  banner: {
    backgroundColor: 'rgba(18, 12, 30, 0.92)',
    borderColor: colors.gold,
    borderWidth: 5,
    borderRadius: radius.card,
    paddingHorizontal: 30,
    paddingVertical: 14,
    overflow: 'hidden',
    ...shadow.glow,
  },
  text: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 46,
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  underline: {
    height: 4,
    marginTop: 6,
    borderRadius: 2,
    backgroundColor: 'rgba(255,209,102,0.55)',
  },
  hint: {
    marginTop: 12,
    color: '#ffffff',
    fontFamily: fonts.titleSemi,
    fontSize: 13,
    letterSpacing: 1,
    textShadowColor: 'rgba(6, 12, 28, 0.95)',
    textShadowRadius: 6,
  },
});
