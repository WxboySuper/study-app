import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse, Path } from 'react-native-svg';

/** One fish of the school: depth is a fraction of the free water, speed in seconds per crossing. */
interface SchoolFish {
  depth: number;
  size: number;
  seconds: number;
  delay: number;
  /** `1` swims to the right, `-1` to the left. */
  dir: 1 | -1;
  opacity: number;
}

const SCHOOL: readonly SchoolFish[] = [
  { depth: 0.08, size: 46, seconds: 19, delay: 0, dir: 1, opacity: 0.2 },
  { depth: 0.24, size: 70, seconds: 27, delay: 4000, dir: -1, opacity: 0.24 },
  { depth: 0.42, size: 38, seconds: 16, delay: 9000, dir: 1, opacity: 0.17 },
  { depth: 0.6, size: 94, seconds: 34, delay: 2000, dir: -1, opacity: 0.28 },
  { depth: 0.78, size: 56, seconds: 23, delay: 12000, dir: 1, opacity: 0.2 },
];

/**
 * The shadows of fish that swim through the deep water under the boat.
 *
 * They are decoration only: they make the lake feel alive between casts and
 * show the player that something is down there. With reduced motion they
 * rest where they are.
 *
 * @param top The top of the free water.
 * @param bottom The bottom of the free water.
 */
export function LakeFish({
  top,
  bottom,
  width,
  reduceMotion,
}: {
  top: number;
  bottom: number;
  width: number;
  reduceMotion: boolean;
}) {
  const span = Math.max(40, bottom - top);

  return (
    <>
      {SCHOOL.map((fish, index) => (
        <Swimmer
          key={index}
          fish={fish}
          y={top + span * fish.depth}
          width={width}
          reduceMotion={reduceMotion}
          phase={index}
        />
      ))}
    </>
  );
}

function Swimmer({
  fish,
  y,
  width,
  reduceMotion,
  phase,
}: {
  fish: SchoolFish;
  y: number;
  width: number;
  reduceMotion: boolean;
  phase: number;
}) {
  const t = useSharedValue(reduceMotion ? 0.2 + phase * 0.17 : 0);

  useEffect(() => {
    if (reduceMotion) {
      t.value = 0.2 + phase * 0.17;
      return;
    }
    t.value = 0;
    t.value = withDelay(
      fish.delay,
      withRepeat(withTiming(1, { duration: fish.seconds * 1000, easing: Easing.linear }), -1, false),
    );
  }, [fish.delay, fish.seconds, phase, reduceMotion, t]);

  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(
      withSequence(
        withTiming(5, { duration: 1800 + phase * 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(-5, { duration: 1800 + phase * 260, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [bob, phase, reduceMotion]);

  const style = useAnimatedStyle(() => {
    const run = width + fish.size * 2;
    const x = fish.dir === 1 ? -fish.size + t.value * run : width + fish.size - t.value * run;
    return {
      transform: [{ translateX: x }, { translateY: bob.value }, { scaleX: fish.dir }],
    };
  });

  const h = fish.size * 0.46;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.fish, { top: y, width: fish.size, height: h, opacity: fish.opacity }, style]}
    >
      <Svg width={fish.size} height={h} viewBox="0 0 100 46">
        <Ellipse cx={42} cy={23} rx={38} ry={17} fill="#04122e" />
        <Path d="M 76 23 L 99 6 Q 92 23 99 40 Z" fill="#04122e" />
        <Path d="M 34 8 Q 44 -2 56 8 Z" fill="#04122e" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fish: {
    position: 'absolute',
    left: 0,
  },
});
