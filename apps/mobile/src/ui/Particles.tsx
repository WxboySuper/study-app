import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * A burst of particles.
 *
 * Confetti and sparkles fly out of the center of the container with a
 * random velocity, fall back down because of gravity and fade out. The
 * pack opening uses it to celebrate the critter that came out.
 */
export interface ParticlesProps {
  /** How many particles fly. */
  count?: number;
  /** The colors of the particles. */
  colors?: readonly string[];
  /** The biggest particle. */
  size?: number;
  /** How wide the burst is, in degrees. */
  spread?: number;
  /** How far the particles travel, in points. */
  distance?: number;
  /** The pull of the gravity, in points. */
  gravity?: number;
  /** How long the burst takes, in milliseconds. */
  duration?: number;
  /** Change it to fire the burst again. */
  trigger?: number;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

interface ParticleSpec {
  id: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  delay: number;
  spin: number;
  round: boolean;
}

/** A burst of particles. */
export function Particles({
  count = 28,
  colors = ['#ffd166', '#7b61ff', '#38bdf8', '#f472b6', '#ffffff'],
  size = 12,
  spread = 150,
  distance = 190,
  gravity = 260,
  duration = 1400,
  trigger = 0,
  style,
}: ParticlesProps) {
  const palette = useMemo(() => [...colors], [colors.join('|')]);

  const particles = useMemo<ParticleSpec[]>(() => {
    return Array.from({ length: count }, (_, id) => {
      // The burst goes up: -90 degrees is straight up.
      const angle = -90 + (Math.random() - 0.5) * spread;
      const reach = distance * (0.55 + Math.random() * 0.45);
      const radians = (angle * Math.PI) / 180;

      return {
        id,
        vx: Math.cos(radians) * reach,
        vy: Math.sin(radians) * reach,
        color: palette[Math.floor(Math.random() * palette.length)] ?? '#ffffff',
        size: size * (0.45 + Math.random() * 0.55),
        delay: Math.random() * 220,
        spin: (Math.random() - 0.5) * 540,
        round: Math.random() > 0.45,
      };
    });
  }, [count, distance, gravity, palette, size, spread]);

  return (
    <View key={trigger} pointerEvents="none" style={[styles.root, style]}>
      {particles.map((particle) => (
        <BurstParticle key={particle.id} particle={particle} duration={duration} gravity={gravity} />
      ))}
    </View>
  );
}

/** One particle of the burst. */
function BurstParticle({
  particle,
  duration,
  gravity,
}: {
  particle: ParticleSpec;
  duration: number;
  gravity: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      particle.delay,
      withTiming(1, { duration, easing: Easing.out(Easing.quad) }),
    );
  }, [duration, particle.delay, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.45),
      transform: [
        { translateX: particle.vx * p },
        { translateY: particle.vy * p + 0.5 * gravity * p * p },
        { rotate: `${particle.spin * p}deg` },
        { scale: 1 - p * 0.35 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: particle.size,
          height: particle.round ? particle.size : particle.size * 0.6,
          borderRadius: particle.round ? particle.size / 2 : 2,
          backgroundColor: particle.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
});
