import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/settings';
import { colors, fonts, gradientDirection, gradients, radius, spacing } from '@/theme';

/**
 * The loading of the game.
 *
 * The app never shows a naked spinner: a critter bounces in a halo while the
 * game loads, and the blocks of a list that is not ready yet shimmer. It is
 * the same critter as everywhere else, so the wait looks like part of the
 * game.
 */

/** The props of the bouncing critter. */
export interface CritterLoaderProps {
  /** The art of the critter (or `null` to use the emoji). */
  art?: ImageSourcePropType | null;
  /** The emoji of the critter, used when there is no art. */
  emoji?: string;
  /** A line of text under the critter. */
  label?: string;
  /** The size of the critter. */
  size?: number;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** A critter that bounces while the game loads. */
export function CritterLoader({
  art = null,
  emoji = '🐙',
  label,
  size = 72,
  style,
}: CritterLoaderProps) {
  const reduceMotion = useReduceMotion();
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      bob.value = 0;
      return undefined;
    }
    bob.value = withRepeat(
      withTiming(1, { duration: 820, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(bob);
    };
  }, [bob, reduceMotion]);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -9 + bob.value * 18 }, { scale: 1 - bob.value * 0.07 }],
  }));

  return (
    <View style={[styles.root, style]}>
      <View
        style={[
          styles.halo,
          {
            width: size + 24,
            height: size + 24,
            borderRadius: (size + 24) / 2,
          },
        ]}
      >
        <Animated.View style={bobStyle}>
          {art === null ? (
            <Text style={[styles.emoji, { fontSize: size * 0.8 }]}>{emoji}</Text>
          ) : (
            <Image source={art} style={{ width: size, height: size }} resizeMode="contain" />
          )}
        </Animated.View>
      </View>

      {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

/** The props of a shimmering block. */
export interface SkeletonProps {
  /** The width of the block. */
  width: number | `${number}%`;
  /** The height of the block. */
  height?: number;
  /** The radius of the corners. */
  borderRadius?: number;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** A block of a list that is still loading. */
export function Skeleton({
  width,
  height = 14,
  borderRadius = radius.chip,
  style,
}: SkeletonProps) {
  const reduceMotion = useReduceMotion();
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      sweep.value = 0.4;
      return undefined;
    }
    sweep.value = withRepeat(withTiming(1, { duration: 1250, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(sweep);
    };
  }, [reduceMotion, sweep]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + sweep.value * 0.4,
    transform: [{ translateX: -80 + sweep.value * 260 }],
  }));

  return (
    <View style={[styles.skeleton, { width, height, borderRadius }, style]}>
      <Animated.View style={[styles.shimmer, shimmerStyle]}>
        <LinearGradient
          colors={gradients.shine}
          start={gradientDirection.start}
          end={gradientDirection.end}
          style={styles.shimmerFace}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(123, 97, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 255, 0.45)',
  },
  emoji: {
    textAlign: 'center',
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  skeleton: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 90,
  },
  shimmerFace: {
    flex: 1,
  },
});
