import { useEffect, useId } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { useReduceMotion } from '@/settings';

/**
 * The light rays of a reveal.
 *
 * A star of light behind the critter that comes out of a pack. The rays
 * turn slowly and their color is the color of the rarity.
 */
export interface LightRaysProps {
  /** The color of the rays. */
  color: string;
  /** How many rays the star has. */
  count?: number;
  /** The diameter of the star. */
  size?: number;
  /** How strong the rays are. */
  opacity?: number;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** The light rays of a reveal. */
export function LightRays({
  color,
  count = 12,
  size = 720,
  opacity = 0.22,
  style,
}: LightRaysProps) {
  const reduceMotion = useReduceMotion();
  const spin = useSharedValue(0);
  const rawId = useId();
  const gradientId = `rays${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(spin);
      spin.value = 0;
      return undefined;
    }
    spin.value = withRepeat(
      withTiming(360, { duration: 22000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(spin);
    };
  }, [reduceMotion, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const half = size / 2;
  const inner = size * 0.13;
  const rays = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const spread = 0.055 + (index % 2 === 0 ? 0.02 : 0);
    const x1 = half + Math.cos(angle - spread) * inner;
    const y1 = half + Math.sin(angle - spread) * inner;
    const x2 = half + Math.cos(angle + spread) * inner;
    const y2 = half + Math.sin(angle + spread) * inner;
    const x3 = half + Math.cos(angle) * half;
    const y3 = half + Math.sin(angle) * half;
    return `M ${x1} ${y1} L ${x3} ${y3} L ${x2} ${y2} Z`;
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.root, { width: size, height: size }, style, spinStyle]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.65" stopColor={color} stopOpacity={opacity * 0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {rays.map((path, index) => (
          <Path key={index} d={path} fill={`url(#${gradientId})`} />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
