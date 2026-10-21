import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useReduceMotion } from '@/settings';
import { colors, gradients, type Gradient } from '@/theme';

/**
 * The background of the game screens.
 *
 * A deep layered gradient, a few colored halos that drift slowly behind
 * the content, a field of stars that twinkles and a few bokeh bubbles that
 * float up. Every screen has its own variant, so the shop, the book and the
 * wheel feel like different places of the same world.
 *
 * When the player asks for less motion (or the system does), the loops stop
 * and only the gradient is left.
 */
export type BackgroundVariant = 'home' | 'packs' | 'collection' | 'spin' | 'ocean';

interface GlowSpec {
  color: string;
  opacity: number;
  size: number;
  /** The position of the halo, in percent of the screen. */
  x: number;
  y: number;
  /** How long a drift takes, in milliseconds. */
  duration: number;
  /** How far the halo travels, in points. */
  drift: number;
}

interface VariantSpec {
  base: Gradient;
  glows: readonly GlowSpec[];
  stars: number;
  bokeh: number;
}

const BACKGROUNDS: Record<BackgroundVariant, VariantSpec> = {
  home: {
    base: gradients.background,
    glows: [
      { color: '#7b61ff', opacity: 0.5, size: 340, x: 12, y: 6, duration: 16000, drift: 34 },
      { color: '#3b82f6', opacity: 0.34, size: 300, x: 78, y: 22, duration: 19000, drift: 28 },
      { color: '#ec4899', opacity: 0.2, size: 260, x: 52, y: 78, duration: 22000, drift: 24 },
    ],
    stars: 16,
    bokeh: 7,
  },
  packs: {
    base: gradients.indigo,
    glows: [
      { color: '#f472b6', opacity: 0.4, size: 320, x: 80, y: 8, duration: 17000, drift: 30 },
      { color: '#7b61ff', opacity: 0.42, size: 340, x: 14, y: 40, duration: 21000, drift: 26 },
    ],
    stars: 14,
    bokeh: 6,
  },
  collection: {
    base: gradients.background,
    glows: [
      { color: '#34d399', opacity: 0.32, size: 320, x: 16, y: 10, duration: 18000, drift: 30 },
      { color: '#7b61ff', opacity: 0.3, size: 300, x: 84, y: 52, duration: 23000, drift: 24 },
    ],
    stars: 12,
    bokeh: 5,
  },
  spin: {
    base: gradients.background,
    glows: [
      { color: '#fbbf24', opacity: 0.38, size: 330, x: 50, y: 4, duration: 15000, drift: 32 },
      { color: '#ec4899', opacity: 0.24, size: 280, x: 18, y: 62, duration: 20000, drift: 26 },
    ],
    stars: 14,
    bokeh: 6,
  },
  ocean: {
    base: gradients.ocean,
    glows: [
      { color: '#38bdf8', opacity: 0.34, size: 360, x: 22, y: 10, duration: 20000, drift: 26 },
      { color: '#6366f1', opacity: 0.3, size: 320, x: 78, y: 64, duration: 24000, drift: 22 },
    ],
    stars: 18,
    bokeh: 8,
  },
};

/** The props of the background. */
export interface GameBackgroundProps {
  /** Which place of the world this is. */
  variant?: BackgroundVariant;
  /** The content of the screen. */
  children?: React.ReactNode;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** The background of a game screen. */
export function GameBackground({ variant = 'home', children, style }: GameBackgroundProps) {
  const reduceMotion = useReduceMotion();
  const spec = BACKGROUNDS[variant];
  const animate = !reduceMotion;

  return (
    <View style={[styles.root, style]}>
      <LinearGradient colors={spec.base} style={StyleSheet.absoluteFill} />

      {spec.glows.map((glow, index) => (
        <DriftGlow key={`${variant}-glow-${index}`} glow={glow} animate={animate} />
      ))}

      <StarField count={spec.stars} animate={animate} />
      <Bokeh count={spec.bokeh} animate={animate} />

      {children}
    </View>
  );
}

/** A halo that drifts slowly behind the content. */
function DriftGlow({ glow, animate }: { glow: GlowSpec; animate: boolean }) {
  const t = useSharedValue(0);
  const rawId = useId();
  const id = `bg${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    if (!animate) {
      t.value = 0;
      return undefined;
    }
    t.value = withRepeat(
      withTiming(1, { duration: glow.duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(t);
    };
  }, [animate, glow.duration, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: (t.value - 0.5) * glow.drift },
      { translateY: Math.sin(t.value * Math.PI * 2) * glow.drift * 0.7 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glow,
        {
          width: glow.size,
          height: glow.size,
          left: `${glow.x}%`,
          top: `${glow.y}%`,
          marginLeft: -glow.size / 2,
          marginTop: -glow.size / 2,
        },
        style,
      ]}
    >
      <Svg width={glow.size} height={glow.size} viewBox={`0 0 ${glow.size} ${glow.size}`}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity} />
            <Stop offset="0.5" stopColor={glow.color} stopOpacity={glow.opacity * 0.4} />
            <Stop offset="1" stopColor={glow.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={glow.size / 2} cy={glow.size / 2} r={glow.size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

interface StarSpec {
  id: number;
  left: number;
  top: number;
  size: number;
  duration: number;
}

/** The stars of the night. */
function StarField({ count, animate }: { count: number; animate: boolean }) {
  const stars = useMemo<StarSpec[]>(
    () =>
      Array.from({ length: count }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2.2,
        duration: 1800 + Math.random() * 2600,
      })),
    [count],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((star) => (
        <Star key={star.id} star={star} animate={animate} />
      ))}
    </View>
  );
}

/** One star that twinkles. */
function Star({ star, animate }: { star: StarSpec; animate: boolean }) {
  const t = useSharedValue(0.35);

  useEffect(() => {
    if (!animate) {
      t.value = 0.35;
      return undefined;
    }
    t.value = withRepeat(
      withTiming(1, { duration: star.duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(t);
    };
  }, [animate, star.duration, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.15 + t.value * 0.55,
    transform: [{ scale: 0.7 + t.value * 0.5 }],
  }));

  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: `${star.left}%`,
          top: `${star.top}%`,
          width: star.size,
          height: star.size,
          borderRadius: star.size / 2,
        },
        style,
      ]}
    />
  );
}

/** The bokeh bubbles that float up. */
function Bokeh({ count, animate }: { count: number; animate: boolean }) {
  const t = useSharedValue(0);

  const bubbles = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        id: index,
        left: Math.random() * 96,
        top: Math.random() * 100,
        size: 8 + Math.random() * 34,
        opacity: 0.03 + Math.random() * 0.07,
      })),
    [count],
  );

  useEffect(() => {
    if (!animate) {
      t.value = 0;
      return undefined;
    }
    t.value = withRepeat(withTiming(1, { duration: 26000, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(t);
    };
  }, [animate, t]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -120 * t.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bokeh, style]}>
      {bubbles.map((bubble) => (
        <View
          key={bubble.id}
          style={{
            position: 'absolute',
            left: `${bubble.left}%`,
            top: `${bubble.top}%`,
            width: bubble.size,
            height: bubble.size,
            borderRadius: bubble.size / 2,
            backgroundColor: colors.highlight,
            opacity: bubble.opacity,
          }}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.backgroundDeep,
  },
  glow: {
    position: 'absolute',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
  bokeh: {
    overflow: 'hidden',
  },
});
