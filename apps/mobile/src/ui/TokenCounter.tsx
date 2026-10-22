import { useEffect, useId, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { colors, fonts } from '@/theme';

/**
 * The counter of the tokens.
 *
 * The number counts up instead of jumping, so the player sees the reward
 * grow. The coin in front of it is drawn, so it stays crisp at any size.
 */
export interface TokenCounterProps {
  /** The number of tokens. */
  value: number;
  /** The size of the number. */
  size?: number;
  /** The color of the number. */
  color?: string;
  /** `false` to hide the coin. */
  showIcon?: boolean;
  /** The style of the number. */
  style?: StyleProp<TextStyle>;
  /** How long the count up takes, in milliseconds. */
  duration?: number;
  /** The number the count up starts from (defaults to the value). */
  startAt?: number;
  /** The label the screen reader reads. */
  accessibilityLabel?: string;
}

/** An animated counter of tokens. */
export function TokenCounter({
  value,
  size = 28,
  color = colors.gold,
  showIcon = true,
  style,
  duration = 700,
  startAt,
  accessibilityLabel,
}: TokenCounterProps) {
  const [display, setDisplay] = useState(startAt ?? value);
  const counter = useSharedValue(startAt ?? value);
  const pop = useSharedValue(0);

  useEffect(() => {
    counter.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [counter, duration, value]);

  useAnimatedReaction(
    () => Math.round(counter.value),
    (current, previous) => {
      if (current !== previous) {
        pop.value = 1;
        pop.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
        runOnJS(setDisplay)(current);
      }
    },
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.1 }],
  }));

  return (
    <View
      style={styles.root}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? `${value} tokens`}
    >
      {showIcon ? <Coin size={size * 0.86} /> : null}
      <Animated.Text style={[styles.value, { color, fontSize: size }, animatedStyle, style]}>
        {display}
      </Animated.Text>
    </View>
  );
}

/** A gold coin. */
export function Coin({ size = 24 }: { size?: number }) {
  const rawId = useId();
  const id = `coin${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor="#ffe9a8" />
          <Stop offset="0.55" stopColor="#ffd166" />
          <Stop offset="1" stopColor="#e08b0a" />
        </SvgGradient>
      </Defs>
      <Circle cx="12" cy="12" r="10.5" fill={`url(#${id})`} />
      <Circle cx="12" cy="12" r="10.5" fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="1.4" />
      <Circle cx="9" cy="8.6" r="3.1" fill="rgba(255,255,255,0.45)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontFamily: fonts.title,
    letterSpacing: 0.5,
  },
});
