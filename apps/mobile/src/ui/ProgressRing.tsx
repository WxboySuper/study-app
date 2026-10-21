import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * A ring that shows how much of something the player owns.
 *
 * The collection tile uses it to show how many critters of a pack are
 * already in the book.
 */
export interface ProgressRingProps {
  /** How much is done, from 0 to 1. */
  progress: number;
  /** The diameter of the ring. */
  size?: number;
  /** The width of the ring. */
  stroke?: number;
  /** The color of the done part. */
  color?: string;
  /** The color of the rest. */
  trackColor?: string;
  /** The content in the middle of the ring. */
  children?: React.ReactNode;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** A ring that shows how much of something the player owns. */
export function ProgressRing({
  progress,
  size = 46,
  stroke = 5,
  color = colors.collection,
  trackColor = 'rgba(255,255,255,0.16)',
  children,
  style,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children === null || children === undefined ? null : (
        <View style={styles.center}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
