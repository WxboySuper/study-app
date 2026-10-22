import { SPIN_SEGMENTS } from '@study-app/core';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { hapticImpact } from '@/haptics';
import { colors, fonts, shadow, spinSegmentColors } from '@/theme';
import { Glow } from '@/ui';

/**
 * The wheel of the daily spin.
 *
 * The wheel is one piece of SVG: eight segments in a gradient, a rim of light
 * bulbs that chase each other around the frame, a hub and a pointer that
 * ticks every time a segment passes under it.
 *
 * The wheel is the only thing that moves: the segments turn with the
 * rotation, the bulbs and the hub stay where they are.
 */

/** How many bulbs the rim has. */
const BULB_COUNT = 26;

/** The size of the drawing of the wheel. */
const VIEW = 200;

/** The radius of the face of the wheel. */
const FACE_RADIUS = 84;

/** The radius of the ring of the bulbs. */
const RIM_RADIUS = 94;

/**
 * The segment that is under the pointer at a rotation.
 *
 * The wedges are drawn with their centre at a quarter of a segment, so the
 * pointer has to be moved by half a segment to land on one.
 */
export function segmentAt(rotation: number): number {
  const step = 360 / SPIN_SEGMENTS.length;
  const raw = Math.round((-rotation - step / 2) / step);
  return ((raw % SPIN_SEGMENTS.length) + SPIN_SEGMENTS.length) % SPIN_SEGMENTS.length;
}

/** Mixes a hex color with white (`amount` above 0) or black (below 0). */
function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const mix = (channel: number): number => {
    const target = amount >= 0 ? 255 : 0;
    return Math.round(channel + (target - channel) * Math.abs(amount));
  };
  return `#${[mix(r), mix(g), mix(b)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

export interface SpinWheelProps {
  /** The rotation of the wheel, in degrees. */
  rotation: SharedValue<number>;
  /** The diameter of the wheel. */
  size?: number;
  /** `true` when the wheel cannot be spun (the day is used up). */
  dimmed?: boolean;
  /** The segment that was won (it pulses). */
  winningIndex?: number | null;
  /** `true` when the pointer has to tick. */
  ticking?: boolean;
}

/** The wheel of the daily spin. */
export function SpinWheel({
  rotation,
  size = 300,
  dimmed = false,
  winningIndex = null,
  ticking = true,
}: SpinWheelProps) {
  const step = 360 / SPIN_SEGMENTS.length;
  const chase = useSharedValue(0);
  const tick = useSharedValue(0);
  const pulse = useSharedValue(0);

  // The bulbs of the rim chase each other around the frame.
  useEffect(() => {
    chase.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(chase);
    };
  }, [chase]);

  // The pointer ticks every time a segment passes under it.
  useAnimatedReaction(
    () => segmentAt(rotation.value),
    (current, previous) => {
      if (previous === null || current === previous) {
        return;
      }
      tick.value = withSequence(
        withTiming(1, { duration: 45, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 9, stiffness: 320, mass: 0.4 }),
      );
      if (ticking) {
        runOnJS(hapticImpact)('light');
      }
    },
  );

  // The segment that was won pulses.
  useEffect(() => {
    if (winningIndex === null) {
      pulse.value = 0;
      return undefined;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, winningIndex]);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pointerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tick.value * 9 }, { rotate: `${tick.value * 5}deg` }],
  }));

  const hubStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  const wedges = SPIN_SEGMENTS.map((segment, index) => {
    const start = (index * step - 90) * (Math.PI / 180);
    const end = ((index + 1) * step - 90) * (Math.PI / 180);
    const x1 = VIEW / 2 + FACE_RADIUS * Math.cos(start);
    const y1 = VIEW / 2 + FACE_RADIUS * Math.sin(start);
    const x2 = VIEW / 2 + FACE_RADIUS * Math.cos(end);
    const y2 = VIEW / 2 + FACE_RADIUS * Math.sin(end);
    return {
      index,
      reward: segment.reward,
      color: spinSegmentColors[index % spinSegmentColors.length] ?? colors.primary,
      path: `M ${VIEW / 2} ${VIEW / 2} L ${x1} ${y1} A ${FACE_RADIUS} ${FACE_RADIUS} 0 0 1 ${x2} ${y2} Z`,
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Glow color={colors.wheel} size={size * 1.35} opacity={dimmed ? 0.16 : 0.4} style={styles.glow} />

      {/* The face of the wheel: the only part that turns. */}
      <Animated.View style={[styles.wheel, { width: size, height: size }, wheelStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
          <Defs>
            {wedges.map((wedge) => (
              <LinearGradient
                key={`grad-${wedge.index}`}
                id={`wedge${wedge.index}`}
                x1="0"
                y1="0"
                x2="0.35"
                y2="1"
              >
                <Stop offset="0" stopColor={shade(wedge.color, 0.35)} />
                <Stop offset="0.55" stopColor={wedge.color} />
                <Stop offset="1" stopColor={shade(wedge.color, -0.28)} />
              </LinearGradient>
            ))}
            <LinearGradient id="hubGold" x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor="#ffe9a8" />
              <Stop offset="0.5" stopColor="#ffd166" />
              <Stop offset="1" stopColor="#e08b0a" />
            </LinearGradient>
          </Defs>

          <Circle cx={VIEW / 2} cy={VIEW / 2} r={FACE_RADIUS} fill="#1b1d24" />

          {wedges.map((wedge) => (
            <Path
              key={wedge.index}
              d={wedge.path}
              fill={`url(#wedge${wedge.index})`}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth="0.8"
            />
          ))}

          {wedges.map((wedge) => {
            const angle = (wedge.index * step + step / 2 - 90) * (Math.PI / 180);
            const x = VIEW / 2 + FACE_RADIUS * 0.62 * Math.cos(angle);
            const y = VIEW / 2 + FACE_RADIUS * 0.62 * Math.sin(angle);
            return (
              <G key={`label-${wedge.index}`}>
                <SvgText
                  x={x}
                  y={y}
                  fill="rgba(0,0,0,0.55)"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth="2.6"
                  fontSize="13"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {wedge.reward}
                </SvgText>
                <SvgText
                  x={x}
                  y={y}
                  fill="#ffffff"
                  fontSize="13"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {wedge.reward}
                </SvgText>
              </G>
            );
          })}

          <Circle cx={VIEW / 2} cy={VIEW / 2} r={FACE_RADIUS} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
        </Svg>
      </Animated.View>

      {/* The frame of the wheel: the ring of bulbs. */}
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
      >
        <Defs>
          <LinearGradient id="rimGold" x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0" stopColor="#ffe9a8" />
            <Stop offset="0.5" stopColor="#f0a91f" />
            <Stop offset="1" stopColor="#8a5a05" />
          </LinearGradient>
        </Defs>

        <Circle
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={RIM_RADIUS}
          fill="none"
          stroke="url(#rimGold)"
          strokeWidth="9"
        />
        <Circle
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={RIM_RADIUS - 5}
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth="1.5"
        />
      </Svg>

      {/* The bulbs of the rim: they chase each other around the frame. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: BULB_COUNT }, (_, index) => (
          <Bulb key={index} index={index} chase={chase} dimmed={dimmed} scale={size / VIEW} />
        ))}
      </View>

      {/* The wheel is dimmed when the day is used up. */}
      {dimmed ? <View style={styles.dim} pointerEvents="none" /> : null}

      {/* The hub of the wheel. */}
      <Animated.View style={[styles.hub, hubStyle]} pointerEvents="none">
        <Text style={styles.hubText}>SPIN</Text>
      </Animated.View>

      {/* The pointer that ticks. */}
      <Animated.View style={[styles.pointer, pointerStyle]} pointerEvents="none">
        <View style={styles.pointerBody} />
      </Animated.View>
    </View>
  );
}

/** One bulb of the rim: it lights up when the chase passes it. */
function Bulb({
  index,
  chase,
  dimmed,
  scale,
}: {
  index: number;
  chase: SharedValue<number>;
  dimmed: boolean;
  scale: number;
}) {
  const angle = (index / BULB_COUNT) * Math.PI * 2 - Math.PI / 2;
  const x = (VIEW / 2 + RIM_RADIUS * Math.cos(angle)) * scale;
  const y = (VIEW / 2 + RIM_RADIUS * Math.sin(angle)) * scale;
  const bulb = 7 * scale;

  const style = useAnimatedStyle(() => {
    const head = chase.value;
    const position = index / BULB_COUNT;
    const distance = Math.abs(((position - head + 1.5) % 1) - 0.5);
    const lit = Math.max(0, 1 - distance * 7);
    return {
      opacity: dimmed ? 0.22 + lit * 0.3 : 0.35 + lit * 0.65,
      transform: [{ scale: 0.85 + lit * 0.35 }],
    };
  });

  return (
    <Animated.View style={[styles.bulb, { left: x - bulb / 2, top: y - bulb / 2, width: bulb, height: bulb }, style]}>
      <Svg width={bulb} height={bulb} viewBox="0 0 8 8">
        <Circle cx="4" cy="4" r="3.6" fill="#fff6d6" />
        <Circle cx="4" cy="4" r="3.6" fill="none" stroke="rgba(120,70,0,0.5)" strokeWidth="0.9" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  wheel: {
    ...StyleSheet.absoluteFill,
  },
  bulb: {
    position: 'absolute',
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 7, 12, 0.55)',
    borderRadius: 999,
  },
  hub: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#ffd166',
    borderWidth: 5,
    borderColor: '#8a5a05',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  hubText: {
    color: '#4a2a00',
    fontFamily: fonts.title,
    fontSize: 17,
    letterSpacing: 1.5,
  },
  pointer: {
    position: 'absolute',
    top: -12,
    alignItems: 'center',
  },
  pointerBody: {
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderTopWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
