import { SPIN_SEGMENTS } from '@study-app/core';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { colors, font, spinSegmentColors } from '@/theme';

/**
 * The wheel of the daily spin.
 *
 * The wheel is built out of eight triangles (one per segment) that all share
 * the hub: the apex of every triangle sits on the hub and its base sits on
 * the rim. The labels are painted on the wheel, so they turn with it while
 * it spins and they are upright again when the wheel stops.
 */

export interface SpinWheelProps {
  /** The rotation of the wheel, in degrees. */
  rotation: SharedValue<number>;
  /** The diameter of the wheel. */
  size?: number;
}

/** The color of a segment. */
export function segmentColor(index: number): string {
  return spinSegmentColors[index % spinSegmentColors.length] ?? colors.primary;
}

export function SpinWheel({ rotation, size = 280 }: SpinWheelProps) {
  const radius = size / 2;
  const segmentAngle = 360 / SPIN_SEGMENTS.length;
  // Half of the base of a triangle and the height of the triangle, so that
  // the apex of every segment sits on the hub and its base sits on the rim.
  const halfBase = radius * Math.sin((segmentAngle / 2) * (Math.PI / 180)) * 1.03;
  const height = radius * Math.cos((segmentAngle / 2) * (Math.PI / 180));

  const wheelStyle = useAnimatedStyle(
    () => ({
      transform: [{ rotate: `${rotation.value}deg` }],
    }),
    [rotation],
  );

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.wheel, { width: size, height: size }, wheelStyle]}>
        {SPIN_SEGMENTS.map((segment, index) => (
          <View
            key={segment.reward}
            style={[
              styles.segment,
              {
                width: size,
                height: size,
                // The first segment points at the pointer (straight up).
                transform: [{ rotate: `${index * segmentAngle}deg` }],
              },
            ]}
          >
            <View
              style={{
                position: 'absolute',
                left: radius - halfBase,
                top: radius - height,
                width: halfBase * 2,
                height,
                borderLeftWidth: halfBase,
                borderRightWidth: halfBase,
                borderTopWidth: height,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: segmentColor(index),
              }}
            />
            <Text style={[styles.label, { top: radius * 0.14 }]}>{segment.reward}</Text>
          </View>
        ))}
      </Animated.View>

      <View
        style={[styles.rim, { width: size, height: size, borderRadius: radius }]}
        pointerEvents="none"
      />

      <View style={styles.hub} pointerEvents="none">
        <Text style={styles.hubText}>SPIN</Text>
      </View>

      <View style={styles.pointer} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheel: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.backgroundDeep,
  },
  segment: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
  },
  label: {
    position: 'absolute',
    left: 0,
    width: '100%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: font.heavy,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  rim: {
    position: 'absolute',
    borderWidth: 6,
    borderColor: colors.gold,
  },
  hub: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.surface,
    borderWidth: 4,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubText: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: font.heavy,
    letterSpacing: 1,
  },
  pointer: {
    position: 'absolute',
    top: -10,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderTopWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.text,
  },
});
