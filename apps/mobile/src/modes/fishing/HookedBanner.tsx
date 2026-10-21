import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fishingSprite } from './assets';

/**
 * The "HOOKED!" banner of the fishing mode.
 *
 * It slams in with a tilt and a shake (docs/design/fishing.md §3).
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

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (reduceMotion) {
      scale.value = 1;
      rotate.value = -6;
      shake.value = 0;
      return;
    }

    scale.value = withSequence(
      withTiming(1.15, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 9, stiffness: 160 }),
    );
    rotate.value = withSequence(
      withTiming(4, { duration: 120 }),
      withSpring(-6, { damping: 10, stiffness: 140 }),
    );
    shake.value = withSequence(
      withTiming(1, { duration: 60 }),
      withTiming(-1, { duration: 60 }),
      withTiming(0.6, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
  }, [visible, reduceMotion, scale, rotate, shake]);

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: scale.value > 0.05 ? 1 : 0,
    transform: [
      { translateX: shake.value * 8 },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  const burstStyle = useAnimatedStyle(() => ({
    opacity: scale.value * 0.45,
    transform: [{ scale: 1.4 - scale.value * 0.4 }],
  }));

  if (!visible) {
    return null;
  }

  const sprite = fishingSprite('ui_hooked_banner');

  return (
    <Animated.View style={[styles.container, bannerStyle]} pointerEvents="box-none">
      <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
        <View style={styles.burstCircle} />
      </Animated.View>
      <View style={styles.banner}>
        {sprite === null ? null : (
          <Animated.Image source={sprite} resizeMode="contain" style={styles.bannerImage} />
        )}
        <Text style={styles.text} onPress={onReel}>
          HOOKED!
        </Text>
      </View>
      <Text style={styles.hint} onPress={onReel}>
        tap to reel
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '22%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  burst: {
    position: 'absolute',
    top: -30,
  },
  burstCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#ffd166',
  },
  banner: {
    backgroundColor: '#ffd166',
    borderColor: '#ef476f',
    borderWidth: 6,
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  bannerImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  text: {
    color: '#ef476f',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: '#fff4e6',
    textShadowRadius: 2,
  },
  hint: {
    marginTop: 8,
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(15, 23, 42, 0.9)',
    textShadowRadius: 4,
  },
});
