import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/settings';

/**
 * The shine that sweeps a card.
 *
 * A soft band of light that crosses the card every few seconds, the way a
 * glass pane catches the light. It is the detail that makes a flat card
 * look like an object.
 */
export interface ShineProps {
  /** How wide the band is, in points. */
  width?: number;
  /** How long one sweep takes, in milliseconds. */
  duration?: number;
  /** How long the card rests before the next sweep, in milliseconds. */
  interval?: number;
  /** `false` to keep the card still. */
  active?: boolean;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** A shine that sweeps across its container. */
export function Shine({
  width = 160,
  duration = 1100,
  interval = 3200,
  active = true,
  style,
}: ShineProps) {
  const reduceMotion = useReduceMotion();
  const running = active && !reduceMotion;
  const x = useSharedValue(-width * 2);

  useEffect(() => {
    if (!running) {
      cancelAnimation(x);
      return undefined;
    }

    x.value = withDelay(
      interval,
      withRepeat(
        withTiming(width * 3, { duration, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(x);
    };
  }, [duration, interval, running, width, x]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: '18deg' }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.root, style, sweepStyle]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.band, { width }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: '-30%',
    bottom: '-30%',
    left: 0,
    overflow: 'hidden',
  },
  band: {
    height: '160%',
    alignSelf: 'center',
  },
});
