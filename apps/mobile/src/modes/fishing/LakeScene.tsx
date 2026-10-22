import type { FishingPhase, RolledCatch } from '@study-app/core';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { Glow } from '@/ui';

import { assetIdOf } from './catchArt';
import { Sprite } from './Sprite';
import { tierColor } from './assets';

/**
 * The lake of the fishing mode (docs/design/fishing.md §11).
 *
 * The scene is drawn, not photographed: a sky that fades into a golden
 * horizon, a sun that burns above the water, four wave bands that drift at
 * their own speed (the parallax) and a little boat with the fisher in the
 * foreground. The line goes out to the bobber, the bobber bobs, the fish
 * comes out of the water with a splash.
 *
 * Every animation runs on the UI thread (Reanimated shared values), so the
 * scene stays smooth while the JS thread is busy with the next card.
 */

/** How big the shadow of a catch is, per tier (a rough 10x ladder). */
const SHADOW_SIZES: Record<string, number> = {
  trash: 54,
  easy: 78,
  great: 112,
  rare: 158,
  epic: 210,
  cotd: 270,
  legend: 340,
};

/** The colors of the sky, from the top of the screen to the horizon. */
const SKY = ['#0d1236', '#241a55', '#5b2a6e', '#b8466b', '#ff8a5b', '#ffc178'] as const;

/** The colors of the water, from the horizon to the bottom of the screen. */
const WATER = ['#ffbe80', '#6aa9d8', '#2b6fae', '#12447f', '#081f47'] as const;

export interface LakeSceneProps {
  /** Where the mode is right now. */
  phase: FishingPhase;
  /** The tier of the catch on the line, so the shadow can hint at its size. */
  hintTier: string | null;
  /** `true` while the frenzy lasts. */
  frenzy: boolean;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
  /** The catch that comes out of the water. */
  landed?: RolledCatch | null;
  /** The overlays (HUD, question note, reveal card...). */
  children?: React.ReactNode;
}

export function LakeScene({
  phase,
  hintTier,
  frenzy,
  reduceMotion,
  landed = null,
  children,
}: LakeSceneProps) {
  const { width, height } = useWindowDimensions();

  // The water line and the spot of the bobber.
  const waterY = height * 0.62;
  const horizonY = height * 0.58;
  const bobHomeX = width * 0.64;
  const rodTipX = width * 0.36;
  const rodTipY = height * 0.42;
  const boatX = width * 0.16;
  const boatY = height * 0.74;

  const bobX = useSharedValue(rodTipX);
  const bobY = useSharedValue(rodTipY);
  const bobBob = useSharedValue(0);
  const shadowX = useSharedValue(bobHomeX);
  const shadowScale = useSharedValue(0.4);
  const shadowOpacity = useSharedValue(0);
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const wave3 = useSharedValue(0);
  const wave4 = useSharedValue(0);
  const splashScale = useSharedValue(0.2);
  const splashOpacity = useSharedValue(0);
  const rippleScale = useSharedValue(0.3);
  const rippleOpacity = useSharedValue(0);
  const catchPop = useSharedValue(0);
  const catchOpacity = useSharedValue(0);
  const frenzyGlow = useSharedValue(0);

  const hintSize = hintTier === null ? 60 : (SHADOW_SIZES[hintTier] ?? 60);

  // The water and the boat never stop moving.
  useEffect(() => {
    if (reduceMotion) {
      wave1.value = 0;
      wave2.value = 0;
      wave3.value = 0;
      wave4.value = 0;
      bobBob.value = 0;
      return;
    }

    wave1.value = withRepeat(withTiming(-1, { duration: 14000, easing: Easing.linear }), -1, false);
    wave2.value = withRepeat(withTiming(-1, { duration: 9000, easing: Easing.linear }), -1, false);
    wave3.value = withRepeat(withTiming(-1, { duration: 6200, easing: Easing.linear }), -1, false);
    wave4.value = withRepeat(withTiming(-1, { duration: 4200, easing: Easing.linear }), -1, false);
    bobBob.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [bobBob, reduceMotion, wave1, wave2, wave3, wave4]);

  // The frenzy tints the whole scene.
  useEffect(() => {
    frenzyGlow.value = withTiming(frenzy ? 1 : 0, { duration: 600 });
  }, [frenzy, frenzyGlow]);

  // The phases of the loop.
  useEffect(() => {
    switch (phase) {
      case 'casting': {
        // The line arcs out of the boat and the bobber hits the water.
        bobX.value = withTiming(bobHomeX, { duration: 600, easing: Easing.out(Easing.cubic) });
        bobY.value = withSequence(
          withTiming(rodTipY - 30, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(waterY, { duration: 320, easing: Easing.in(Easing.quad) }),
        );
        splashScale.value = 0.2;
        splashOpacity.value = 0;
        rippleScale.value = 0.3;
        rippleOpacity.value = 0;
        break;
      }
      case 'waiting': {
        shadowOpacity.value = withTiming(0.55, { duration: 700 });
        shadowScale.value = withTiming(0.8, { duration: 700 });
        shadowX.value = withRepeat(
          withSequence(
            withTiming(bobHomeX - 26, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
            withTiming(bobHomeX + 26, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          false,
        );
        break;
      }
      case 'hooked': {
        bobY.value = withSequence(
          withTiming(waterY + 22, { duration: 140 }),
          withTiming(waterY - 6, { duration: 260 }),
        );
        splashOpacity.value = withSequence(
          withTiming(1, { duration: 90 }),
          withTiming(0, { duration: 520 }),
        );
        splashScale.value = withSequence(
          withTiming(1.1, { duration: 260 }),
          withTiming(1.8, { duration: 420 }),
        );
        rippleOpacity.value = withSequence(
          withTiming(0.9, { duration: 120 }),
          withTiming(0, { duration: 900 }),
        );
        rippleScale.value = withSequence(
          withTiming(1, { duration: 420 }),
          withTiming(2.4, { duration: 800 }),
        );
        shadowScale.value = withTiming(1, { duration: 260 });
        shadowOpacity.value = withTiming(0.85, { duration: 200 });
        break;
      }
      case 'question': {
        // The line stays taut and the fish thrashes.
        bobY.value = withTiming(waterY + 10, { duration: 220 });
        shadowX.value = withRepeat(
          withSequence(
            withTiming(bobHomeX - 14, { duration: 260 }),
            withTiming(bobHomeX + 14, { duration: 260 }),
          ),
          -1,
          false,
        );
        break;
      }
      case 'reeling': {
        // The catch comes out of the water.
        bobX.value = withTiming(width * 0.5, { duration: 900, easing: Easing.inOut(Easing.quad) });
        bobY.value = withTiming(height * 0.34, { duration: 900, easing: Easing.inOut(Easing.quad) });
        shadowScale.value = withTiming(1.6, { duration: 900 });
        shadowOpacity.value = withTiming(0, { duration: 700 });
        catchOpacity.value = withTiming(1, { duration: 260 });
        catchPop.value = withSequence(
          withTiming(1.18, { duration: 220, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 9, stiffness: 150 }),
        );        splashOpacity.value = withSequence(
          withTiming(1, { duration: 80 }),
          withTiming(0, { duration: 600 }),
        );
        splashScale.value = withSequence(
          withTiming(1.2, { duration: 240 }),
          withTiming(2, { duration: 440 }),
        );
        break;
      }
      case 'reveal': {
        // The card of the catch takes over from the scene.
        catchOpacity.value = withTiming(0, { duration: 260 });
        break;
      }
      case 'got_away': {
        // The line snaps and the fish swims off.
        shadowX.value = withTiming(width * 1.2, { duration: 700, easing: Easing.out(Easing.quad) });
        shadowOpacity.value = withTiming(0, { duration: 700 });
        bobY.value = withTiming(waterY - 40, { duration: 200 });
        catchOpacity.value = withTiming(0, { duration: 260 });
        break;
      }
      case 'idle': {
        bobX.value = withSpring(rodTipX, { damping: 16, stiffness: 80 });
        bobY.value = withSpring(rodTipY, { damping: 16, stiffness: 80 });
        shadowOpacity.value = withTiming(0, { duration: 300 });
        shadowScale.value = withTiming(0.4, { duration: 300 });
        splashOpacity.value = 0;
        rippleOpacity.value = 0;
        catchOpacity.value = 0;
        catchPop.value = 0;
        break;
      }
      default:
        break;
    }
  }, [
    phase,
    bobX,
    bobY,
    shadowX,
    shadowScale,
    shadowOpacity,
    splashScale,
    splashOpacity,
    rippleScale,
    rippleOpacity,
    catchPop,
    catchOpacity,
    bobHomeX,
    waterY,
    rodTipX,
    rodTipY,
    width,
    height,
  ]);

  const bobberStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: bobX.value - 16 },
      { translateY: bobY.value - 16 + bobBob.value },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: shadowOpacity.value,
    transform: [
      { translateX: shadowX.value - hintSize / 2 },
      { translateY: waterY + 46 - (hintSize * shadowScale.value) / 2 },
      { scale: shadowScale.value },
    ],
  }));

  const splashStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
    transform: [
      { translateX: bobHomeX - 40 },
      { translateY: waterY - 40 },
      { scale: splashScale.value },
    ],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacity.value,
    transform: [
      { translateX: bobHomeX - 60 },
      { translateY: waterY - 20 },
      { scale: rippleScale.value },
    ],
  }));

  const catchStyle = useAnimatedStyle(() => ({
    opacity: catchOpacity.value,
    transform: [
      { translateX: bobX.value - 70 },
      { translateY: bobY.value - 96 + catchPop.value * 8 },
      { scale: catchPop.value },
    ],
  }));

  const frenzyStyle = useAnimatedStyle(() => ({ opacity: frenzyGlow.value * 0.5 }));

  const lineStyle = useAnimatedStyle(() => {
    const dx = bobX.value - rodTipX;
    const dy = bobY.value - rodTipY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      width: length,
      transform: [
        { translateX: rodTipX },
        { translateY: rodTipY },
        { rotate: `${angle}deg` },
      ],
    };
  });

  const wave1Style = useAnimatedStyle(() => ({ transform: [{ translateX: wave1.value * 90 }] }));
  const wave2Style = useAnimatedStyle(() => ({ transform: [{ translateX: wave2.value * 130 }] }));
  const wave3Style = useAnimatedStyle(() => ({ transform: [{ translateX: wave3.value * 190 }] }));
  const wave4Style = useAnimatedStyle(() => ({ transform: [{ translateX: wave4.value * 260 }] }));

  // The catch that comes out of the water.
  const catchAsset = useMemo(() => (landed === null ? null : assetIdOf(landed)), [landed]);
  const catchColor = landed === null ? '#ffd166' : colorOfLanding(landed);

  return (
    <View style={styles.container}>
      {/* The sky and the sun. */}
      <LinearGradient colors={SKY} style={[styles.sky, { height: waterY + 30 }]} />
      <Glow
        color="#ffb765"
        size={300}
        opacity={0.55}
        style={[styles.sun, { left: width * 0.62 - 150, top: horizonY - 190 }]}
      />
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Circle cx={width * 0.62} cy={horizonY - 66} r={38} fill="#ffe6ad" opacity={0.95} />
        <Circle cx={width * 0.62} cy={horizonY - 66} r={58} fill="#ffd48a" opacity={0.22} />
      </Svg>

      {/* The far shore and the hills behind it. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Path
          d={`M 0 ${horizonY}
              Q ${width * 0.1} ${horizonY - 40} ${width * 0.2} ${horizonY - 14}
              Q ${width * 0.32} ${horizonY - 58} ${width * 0.44} ${horizonY - 18}
              Q ${width * 0.56} ${horizonY - 44} ${width * 0.68} ${horizonY - 16}
              Q ${width * 0.82} ${horizonY - 40} ${width} ${horizonY - 12}
              L ${width} ${horizonY + 6} L 0 ${horizonY + 6} Z`}
          fill="#2a1c52"
          opacity={0.85}
        />
        {/* A few clouds in the warm part of the sky. */}
        <Ellipse cx={width * 0.22} cy={horizonY - 150} rx={54} ry={13} fill="#ffb27a" opacity={0.16} />
        <Ellipse cx={width * 0.78} cy={horizonY - 116} rx={70} ry={15} fill="#ffc178" opacity={0.13} />
        <Ellipse cx={width * 0.46} cy={horizonY - 196} rx={44} ry={10} fill="#ff8a5b" opacity={0.1} />
      </Svg>

      {/* The water. */}
      <LinearGradient colors={WATER} style={[styles.water, { top: waterY }]} />

      {/* The sun and its glitter on the water. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Circle cx={width * 0.62} cy={horizonY - 66} r={38} fill="#ffe6ad" opacity={0.95} />
        <Circle cx={width * 0.62} cy={horizonY - 66} r={58} fill="#ffd48a" opacity={0.22} />
        {[0, 1, 2, 3, 4].map((index) => (
          <Rect
            key={`glitter-${index}`}
            x={width * 0.62 - 40 + index * 4}
            y={waterY + 6 + index * 16}
            width={80 - index * 8}
            height={4}
            rx={2}
            fill="#ffe6ad"
            opacity={0.32 - index * 0.05}
          />
        ))}
      </Svg>

      {/* The wave bands: the parallax of the scene. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.band, { top: waterY - 6, height: 30 }, wave1Style]}
      >
        <WaveBand width={width} height={30} amplitude={6} wavelength={150} phase={0} color="#ffd9a8" opacity={0.45} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.band, { top: waterY + 12, height: 40 }, wave2Style]}
      >
        <WaveBand width={width} height={40} amplitude={9} wavelength={190} phase={1.4} color="#9fd4f2" opacity={0.5} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.band, { top: waterY + 44, height: 54 }, wave3Style]}
      >
        <WaveBand width={width} height={54} amplitude={12} wavelength={230} phase={2.6} color="#4f9ed6" opacity={0.62} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.band, { top: waterY + 88, height: 70 }, wave4Style]}
      >
        <WaveBand width={width} height={70} amplitude={15} wavelength={280} phase={3.9} color="#1c5ea6" opacity={0.8} />
      </Animated.View>

      {/* The boat and the fisher. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Defs>
          <SvgGradient id="hull" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2a1a3d" />
            <Stop offset="1" stopColor="#150d24" />
          </SvgGradient>
        </Defs>
        <G>
          {/* The hull. */}
          <Path
            d={`M ${boatX - 66} ${boatY} L ${boatX + 66} ${boatY}
                L ${boatX + 44} ${boatY + 32} Q ${boatX} ${boatY + 42} ${boatX - 44} ${boatY + 32} Z`}
            fill="url(#hull)"
          />
          {/* The rim of the boat. */}
          <Path
            d={`M ${boatX - 68} ${boatY} L ${boatX + 68} ${boatY} L ${boatX + 66} ${boatY + 5}
                L ${boatX - 66} ${boatY + 5} Z`}
            fill="#3a2550"
          />
          {/* The fisher. */}
          <Ellipse cx={boatX - 8} cy={boatY - 30} rx={12} ry={13} fill="#1d1330" />
          <Path
            d={`M ${boatX - 24} ${boatY - 4} Q ${boatX - 8} ${boatY - 50} ${boatX + 10} ${boatY - 4} Z`}
            fill="#1d1330"
          />
          {/* The lantern of the boat. */}
          <Circle cx={boatX + 34} cy={boatY - 16} r={5} fill="#ffd166" opacity={0.9} />
          {/* The rod. */}
          <Path
            d={`M ${boatX + 4} ${boatY - 30} Q ${boatX + 46} ${boatY - 76} ${rodTipX} ${rodTipY}`}
            stroke="#2b1c3d"
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Svg>

      {/* The frenzy washes the scene in pink. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frenzy, frenzyStyle]} />

      {/* The shadow of the catch under the water. */}
      <Animated.View style={[styles.shadow, shadowStyle]} pointerEvents="none">
        <View style={styles.shadowBlob} />
      </Animated.View>

      {/* The line and the bobber. */}
      <Animated.View style={[styles.line, lineStyle]} pointerEvents="none" />
      <Animated.View style={[styles.bobber, bobberStyle]} pointerEvents="none">
        <Bobber />
      </Animated.View>

      {/* The ripples and the splash. */}
      <Animated.View style={[styles.ripple, rippleStyle]} pointerEvents="none">
        <Svg width={120} height={120} viewBox="0 0 120 120">
          <Ellipse cx="60" cy="60" rx="52" ry="20" fill="none" stroke="#eaf6ff" strokeWidth="3" opacity={0.8} />
          <Ellipse cx="60" cy="60" rx="34" ry="12" fill="none" stroke="#eaf6ff" strokeWidth="2" opacity={0.5} />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.splash, splashStyle]} pointerEvents="none">
        <Svg width={80} height={80} viewBox="0 0 80 80">
          <Path
            d="M 40 8 Q 52 26 62 20 Q 54 38 68 40 Q 52 52 56 70 Q 40 60 24 70 Q 28 52 12 40 Q 26 38 18 20 Q 28 26 40 8 Z"
            fill="#eaf6ff"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>

      {/* The catch that comes out of the water. */}
      {catchAsset === null ? null : (
        <Animated.View style={[styles.catch, catchStyle]} pointerEvents="none">
          <Glow color={catchColor} size={210} opacity={0.7} style={styles.catchGlow} />
          <Sprite assetId={catchAsset} size={140} />
        </Animated.View>
      )}

      {children}
    </View>
  );
}

/** One band of water: a wave that repeats over and over. */
function WaveBand({
  width,
  height,
  amplitude,
  wavelength,
  phase,
  color,
  opacity,
}: {
  width: number;
  height: number;
  amplitude: number;
  wavelength: number;
  phase: number;
  color: string;
  opacity: number;
}) {
  const total = width + wavelength;

  let d = `M 0 ${height}`;
  for (let x = 0; x <= total; x += 6) {
    const y = height * 0.42 + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amplitude;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L ${total} ${height} Z`;

  return (
    <Svg width={total} height={height} viewBox={`0 0 ${total} ${height}`}>
      <Path d={d} fill={color} opacity={opacity} />
    </Svg>
  );
}

/** The float of the line. */
function Bobber() {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <Defs>
        <SvgGradient id="bobberRed" x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor="#ff6b6b" />
          <Stop offset="1" stopColor="#c1121f" />
        </SvgGradient>
      </Defs>
      <Circle cx="16" cy="17" r="12" fill="#f8fafc" />
      <Path d="M 4 17 A 12 12 0 0 1 28 17 Z" fill="url(#bobberRed)" />
      <Circle cx="16" cy="17" r="12" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1.2" />
      <Path d="M 16 5 L 16 1" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" />
      <Circle cx="16" cy="12" r="3" fill="#ffe66d" />
    </Svg>
  );
}

/** The color of a catch (the color of its tier). */
function colorOfLanding(landed: RolledCatch): string {
  if (landed.kind === 'fish' || landed.kind === 'critter' || landed.kind === 'junk' || landed.kind === 'heavy') {
    return tierColor(landed.catch.tier);
  }
  if (landed.kind === 'pack_ticket') {
    return '#ffd60a';
  }
  if (landed.kind === 'frenzy') {
    return '#ff5d8f';
  }
  return '#8be9fd';
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: '#081f47',
  },
  sky: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  sun: {
    position: 'absolute',
  },
  water: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  band: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
  },
  frenzy: {
    backgroundColor: '#ff5d8f',
  },
  shadow: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  shadowBlob: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(4, 14, 32, 0.55)',
  },
  line: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    transformOrigin: 'left center',
  },
  bobber: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  ripple: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  catch: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catchGlow: {
    position: 'absolute',
  },
});
