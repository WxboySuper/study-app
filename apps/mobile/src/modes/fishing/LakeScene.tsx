import type { FishingPhase, RolledCatch } from '@study-app/core';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { Glow } from '@/ui';

import { assetIdOf } from './catchArt';
import { Sprite } from './Sprite';
import { tierColor } from './assets';

/**
 * The lake of the fishing mode (docs/design/fishing.md §11).
 *
 * The scene is drawn, not photographed: a sky that fades into a golden
 * horizon, a sun that burns above the water, four wave bands that drift at
 * their own speed (the parallax), a little boat that rocks with the waves
 * and a fisher that holds a rod. The line goes out to the bobber, the bobber
 * bobs on the water, the fish comes out of the water with a splash.
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

/** The colors of the fisher. */
const SKIN = '#f7c9a0';
const JACKET = '#f97316';
const JACKET_DARK = '#c2410c';
const PANTS = '#334155';
const CAP = '#0ea5e9';
const CAP_DARK = '#0369a1';

/** The colors of the boat. */
const HULL_TOP = '#3a2450';
const HULL_BOTTOM = '#170e26';
const HULL_RIM = '#7c5aa8';
const HULL_STRIPE = '#54387a';

/**
 * The rod, in the frame of the boat (the origin is the water line of the
 * boat). The hands hold it and the tip points at the water.
 */
const ROD_HAND_X = 26;
const ROD_HAND_Y = -48;
const ROD_TIP_X = 86;
const ROD_TIP_Y = -160;

/** The tip of the rod, in the frame of the rod (the origin is the hands). */
const ROD_TIP_DX = ROD_TIP_X - ROD_HAND_X;
const ROD_TIP_DY = ROD_TIP_Y - ROD_HAND_Y;

/** The size of the view of the boat (the origin is in its middle). */
const BOAT_W = 230;
const BOAT_H = 260;

/** The size of the view of the rod (the origin, the hands, is in its middle). */
const ROD_W = 230;
const ROD_H = 230;

/** The number of pieces the fishing line is made of. */
const LINE_SEGMENTS = 14;

/** The length of one piece of the line (it is scaled to fit the curve). */
const LINE_SEG = 10;

/** How much the line sags, per moment (a fraction of the length of the line). */
const SAG_SLACK = 0.15;
const SAG_CAST = 0.05;
const SAG_TAUT = 0.012;

/** How high the bobber flies during a cast. */
const CAST_ARC = 74;

/** How long the cast lasts (the machine waits the same time). */
const CAST_MS = 600;

/** Where the bobber is frozen for the screenshot of the cast. */
const CAST_FROZEN = 0.44;

/** The size of the bobber. */
const BOBBER = 30;

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
  /** `true` when the scene is frozen (the screenshots of the cast). */
  frozen?: boolean;
  /** The overlays (HUD, question note, reveal card...). */
  children?: React.ReactNode;
}

export function LakeScene({
  phase,
  hintTier,
  frenzy,
  reduceMotion,
  landed = null,
  frozen = false,
  children,
}: LakeSceneProps) {
  const { width, height } = useWindowDimensions();

  // The far shore and the water.
  const horizonY = height * 0.545;
  const waterY = height * 0.575;

  // The boat floats in the foreground, the bobber waits far out on the lake.
  const boatX = width * 0.22;
  const boatWaterY = height * 0.7;
  const bobHomeX = width * 0.68;

  /**
   * The water line at a given distance.
   *
   * The surface of the lake is not a straight line on the screen: it falls
   * a little towards the right, where the bobber waits.
   */
  const waterLineAt = (x: number) => waterY + 20 + Math.sin((x / Math.max(width, 1)) * Math.PI) * 8;

  // The bobber floats on the water, half of it in the lake.
  const bobHomeY = waterLineAt(bobHomeX) - 4;

  const bobX = useSharedValue(bobHomeX);
  const bobY = useSharedValue(bobHomeY);
  /** The progress of the cast (0 is the rod, 1 is the water). */
  const castP = useSharedValue(0);
  /** `1` while the bobber flies along the arc of the cast. */
  const castOn = useSharedValue(0);
  /** The phase of the waves (the boat and the bobber follow it). */
  const waveT = useSharedValue(0);
  /** `0` when the animations have to be reduced. */
  const motion = useSharedValue(reduceMotion ? 0 : 1);
  const drift1 = useSharedValue(0);
  const drift2 = useSharedValue(0);
  const drift3 = useSharedValue(0);
  const drift4 = useSharedValue(0);
  /** The swing of the rod, in degrees. */
  const rodSwing = useSharedValue(0);
  /** How much the line sags (a fraction of the length of the line). */
  const sag = useSharedValue(SAG_SLACK);
  /** The progress of the ripples of the bobber. */
  const rippleT = useSharedValue(0);
  const splashScale = useSharedValue(0.2);
  const splashOpacity = useSharedValue(0);
  const shadowScale = useSharedValue(0.4);
  const shadowOpacity = useSharedValue(0);
  const shadowX = useSharedValue(bobHomeX);
  const catchPop = useSharedValue(0);
  const catchOpacity = useSharedValue(0);
  const frenzyGlow = useSharedValue(0);

  const hintSize = hintTier === null ? 60 : (SHADOW_SIZES[hintTier] ?? 60);

  // The water and the boat never stop moving.
  useEffect(() => {
    motion.value = reduceMotion ? 0 : 1;

    if (reduceMotion) {
      waveT.value = 0;
      drift1.value = 0;
      drift2.value = 0;
      drift3.value = 0;
      drift4.value = 0;
      rippleT.value = 0;
      return;
    }

    waveT.value = withRepeat(withTiming(Math.PI * 2, { duration: 5200, easing: Easing.linear }), -1, false);
    rippleT.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
    drift1.value = withRepeat(withTiming(-1, { duration: 14000, easing: Easing.linear }), -1, false);
    drift2.value = withRepeat(withTiming(-1, { duration: 9000, easing: Easing.linear }), -1, false);
    drift3.value = withRepeat(withTiming(-1, { duration: 6200, easing: Easing.linear }), -1, false);
    drift4.value = withRepeat(withTiming(-1, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [drift1, drift2, drift3, drift4, motion, reduceMotion, rippleT, waveT]);

  /** The rock of the boat, in degrees (it follows the waves). */
  const boatRock = useDerivedValue(() => Math.sin(waveT.value + 0.9) * 2.4 * motion.value);

  /** The bob of the boat, in pixels (it follows the waves). */
  const boatBob = useDerivedValue(() => Math.sin(waveT.value + 0.9) * 2.6 * motion.value);

  // The frenzy tints the whole scene.
  useEffect(() => {
    frenzyGlow.value = withTiming(frenzy ? 1 : 0, { duration: 600 });
  }, [frenzy, frenzyGlow]);

  // The phases of the loop.
  useEffect(() => {
    switch (phase) {
      case 'casting': {
        // The rod flicks and the bobber flies over the water.
        castOn.value = 1;
        castP.value = frozen ? CAST_FROZEN : 0;
        sag.value = SAG_CAST;
        if (frozen) {
          rodSwing.value = -14;
        } else if (reduceMotion) {
          // Without motion the bobber is simply on the water.
          castP.value = 1;
        } else {
          castP.value = withTiming(1, { duration: CAST_MS, easing: Easing.linear });
          rodSwing.value = withSequence(
            withTiming(-16, { duration: 130, easing: Easing.out(Easing.quad) }),
            withTiming(9, { duration: 190, easing: Easing.inOut(Easing.quad) }),
            withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }),
          );
        }
        break;
      }
      case 'waiting': {
        // The bobber sits on the water and the fish swims below it.
        castOn.value = 0;
        bobX.value = withTiming(bobHomeX, { duration: 140 });
        bobY.value = withTiming(bobHomeY, { duration: 140 });
        sag.value = withTiming(SAG_SLACK, { duration: 400 });
        splashScale.value = withSequence(withTiming(1, { duration: 220 }), withTiming(1.9, { duration: 420 }));
        splashOpacity.value = withSequence(withTiming(0.95, { duration: 90 }), withTiming(0, { duration: 520 }));
        shadowOpacity.value = withTiming(0.5, { duration: 700 });
        shadowScale.value = withTiming(0.8, { duration: 700 });
        shadowX.value = withRepeat(
          withSequence(
            withTiming(bobHomeX - 22, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
            withTiming(bobHomeX + 22, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          false,
        );
        break;
      }
      case 'hooked': {
        // The bobber goes under and the line goes tight.
        castOn.value = 0;
        bobY.value = withSequence(
          withTiming(bobHomeY + 30, { duration: 130, easing: Easing.in(Easing.quad) }),
          withTiming(bobHomeY - 2, { duration: 300, easing: Easing.out(Easing.quad) }),
        );
        sag.value = withTiming(SAG_TAUT, { duration: 180 });
        splashScale.value = withSequence(withTiming(1, { duration: 220 }), withTiming(1.8, { duration: 420 }));
        splashOpacity.value = withSequence(withTiming(0.9, { duration: 80 }), withTiming(0, { duration: 520 }));
        shadowScale.value = withTiming(1, { duration: 260 });
        shadowOpacity.value = withTiming(0.8, { duration: 200 });
        break;
      }
      case 'question': {
        // The line stays taut and the fish thrashes.
        castOn.value = 0;
        bobY.value = withTiming(bobHomeY + 12, { duration: 220 });
        sag.value = withTiming(SAG_TAUT, { duration: 200 });
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
        castOn.value = 0;
        bobX.value = withTiming(width * 0.52, { duration: 900, easing: Easing.inOut(Easing.quad) });
        bobY.value = withTiming(height * 0.36, { duration: 900, easing: Easing.inOut(Easing.quad) });
        sag.value = withTiming(0.06, { duration: 300 });
        shadowOpacity.value = withTiming(0, { duration: 700 });
        catchOpacity.value = withTiming(1, { duration: 260 });
        catchPop.value = withSequence(
          withTiming(1.18, { duration: 220, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 9, stiffness: 150 }),
        );
        splashScale.value = withSequence(withTiming(1.2, { duration: 240 }), withTiming(2, { duration: 440 }));
        splashOpacity.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 600 }));
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
        bobY.value = withTiming(bobHomeY - 30, { duration: 200 });
        sag.value = withTiming(SAG_SLACK, { duration: 400 });
        catchOpacity.value = withTiming(0, { duration: 260 });
        break;
      }
      case 'idle': {
        // The line is already out and the bobber waits on the water.
        castOn.value = 0;
        bobX.value = withTiming(bobHomeX, { duration: 300 });
        bobY.value = withTiming(bobHomeY, { duration: 300 });
        shadowOpacity.value = withTiming(0, { duration: 300 });
        shadowScale.value = withTiming(0.4, { duration: 300 });
        splashOpacity.value = 0;
        catchOpacity.value = 0;
        catchPop.value = 0;
        rodSwing.value = withSpring(0, { damping: 14, stiffness: 90 });
        sag.value = withTiming(SAG_SLACK, { duration: 400 });
        break;
      }
      default:
        break;
    }
  }, [
    phase,
    frozen,
    reduceMotion,
    bobX,
    bobY,
    castP,
    castOn,
    sag,
    shadowX,
    shadowScale,
    shadowOpacity,
    splashScale,
    splashOpacity,
    catchPop,
    catchOpacity,
    rodSwing,
    bobHomeX,
    bobHomeY,
    width,
    height,
  ]);

  /**
   * The tip of the rod, on the screen.
   *
   * The rod swings on the hands of the fisher and the boat rocks on the
   * waves, so the tip moves a little all the time.
   */
  const rodTipX = useDerivedValue(() => {
    const swing = (rodSwing.value * Math.PI) / 180;
    const rock = (boatRock.value * Math.PI) / 180;
    const dx = ROD_TIP_DX * Math.cos(swing) - ROD_TIP_DY * Math.sin(swing);
    const dy = ROD_TIP_DX * Math.sin(swing) + ROD_TIP_DY * Math.cos(swing);
    const localX = ROD_HAND_X + dx;
    const localY = ROD_HAND_Y + dy;
    return boatX + localX * Math.cos(rock) - localY * Math.sin(rock);
  });

  const rodTipY = useDerivedValue(() => {
    const swing = (rodSwing.value * Math.PI) / 180;
    const rock = (boatRock.value * Math.PI) / 180;
    const dx = ROD_TIP_DX * Math.cos(swing) - ROD_TIP_DY * Math.sin(swing);
    const dy = ROD_TIP_DX * Math.sin(swing) + ROD_TIP_DY * Math.cos(swing);
    const localX = ROD_HAND_X + dx;
    const localY = ROD_HAND_Y + dy;
    return boatWaterY + boatBob.value + localX * Math.sin(rock) + localY * Math.cos(rock);
  });

  /** Where the bobber is: on the arc of the cast, or on the water. */
  const bobPosX = useDerivedValue(() => {
    if (castOn.value === 1) {
      return rodTipX.value + (bobHomeX - rodTipX.value) * castP.value;
    }
    return bobX.value;
  });

  const bobPosY = useDerivedValue(() => {
    if (castOn.value === 1) {
      const p = castP.value;
      return rodTipY.value + (bobHomeY - rodTipY.value) * p - CAST_ARC * 4 * p * (1 - p);
    }
    return bobY.value + Math.sin(waveT.value) * 3.2;
  });

  const bobberStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: bobPosX.value - BOBBER / 2 },
      { translateY: bobPosY.value - BOBBER / 2 },
    ],
  }));

  const boatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: boatBob.value },
      { rotate: `${boatRock.value}deg` },
    ],
  }));

  const rodStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rodSwing.value}deg` }],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: shadowOpacity.value,
    transform: [
      { translateX: shadowX.value - hintSize / 2 },
      { translateY: bobHomeY + 44 - hintSize / 6 },
      { scaleX: shadowScale.value },
      { scaleY: shadowScale.value },
    ],
  }));

  const splashStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
    transform: [
      { translateX: bobPosX.value - 40 },
      { translateY: bobPosY.value - 46 },
      { scale: splashScale.value },
    ],
  }));

  /**
   * The ripples stay on the water, where the bobber landed.
   *
   * They follow the bobber while it waits (it bobs with the waves) and they
   * stay where the bobber was when it flies away.
   */
  const rippleStyle = useAnimatedStyle(() => {
    const t = rippleT.value;
    return {
      opacity: (1 - t) * 0.5,
      transform: [
        { translateX: bobHomeX - 60 },
        { translateY: bobHomeY - 60 + Math.sin(waveT.value) * 3.2 },
        { scale: 0.22 + t * 1.25 },
      ],
    };
  });

  const rippleStyle2 = useAnimatedStyle(() => {
    const t = (rippleT.value + 0.5) % 1;
    return {
      opacity: (1 - t) * 0.35,
      transform: [
        { translateX: bobHomeX - 60 },
        { translateY: bobHomeY - 60 + Math.sin(waveT.value) * 3.2 },
        { scale: 0.22 + t * 1.25 },
      ],
    };
  });

  const catchStyle = useAnimatedStyle(() => ({
    opacity: catchOpacity.value,
    transform: [
      { translateX: bobPosX.value - 70 },
      { translateY: bobPosY.value - 96 + catchPop.value * 8 },
      { scale: catchPop.value },
    ],
  }));

  const frenzyStyle = useAnimatedStyle(() => ({ opacity: frenzyGlow.value * 0.5 }));

  const wave1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift1.value * 120 },
      { translateY: Math.sin(waveT.value) * 1.6 },
    ],
  }));
  const wave2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift2.value * 170 },
      { translateY: Math.sin(waveT.value + 1.1) * 2 },
    ],
  }));
  const wave3Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift3.value * 230 },
      { translateY: Math.sin(waveT.value + 2.2) * 2.4 },
    ],
  }));
  const wave4Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift4.value * 300 },
      { translateY: Math.sin(waveT.value + 3.3) * 2.8 },
    ],
  }));

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

      {/* The far shore and the hills behind it. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Circle cx={width * 0.62} cy={horizonY - 66} r={38} fill="#ffe6ad" opacity={0.95} />
        <Circle cx={width * 0.62} cy={horizonY - 66} r={58} fill="#ffd48a" opacity={0.22} />
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

      {/* The glitter of the sun on the water. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
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
        style={[styles.band, { top: waterY - 10, height: 34 }, wave1Style]}
      >
        <WaveBand width={width} height={34} amplitude={6} wavelength={150} phase={0} color="#ffd9a8" opacity={0.45} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.band, { top: waterY + 10, height: 46 }, wave2Style]}
      >
        <WaveBand width={width} height={46} amplitude={9} wavelength={190} phase={1.4} color="#9fd4f2" opacity={0.5} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.band, { top: waterY + 38, height: 60 }, wave3Style]}
      >
        <WaveBand width={width} height={60} amplitude={12} wavelength={230} phase={2.6} color="#4f9ed6" opacity={0.62} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.band, { top: waterY + 76, height: 78 }, wave4Style]}
      >
        <WaveBand width={width} height={78} amplitude={15} wavelength={280} phase={3.9} color="#1c5ea6" opacity={0.8} />
      </Animated.View>

      {/* The boat and the fisher: they float on the waves. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.boat,
          { left: boatX - BOAT_W / 2, top: boatWaterY - BOAT_H / 2, width: BOAT_W, height: BOAT_H },
          boatStyle,
        ]}
      >
        <Svg width={BOAT_W} height={BOAT_H} viewBox={`0 0 ${BOAT_W} ${BOAT_H}`}>
          <Defs>
            <SvgGradient id="hull" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={HULL_TOP} />
              <Stop offset="1" stopColor={HULL_BOTTOM} />
            </SvgGradient>
            <ClipPath id="hullClip">
              <Path d={HULL_PATH} />
            </ClipPath>
          </Defs>
          <G transform={`translate(${BOAT_W / 2} ${BOAT_H / 2})`}>
            {/* The fisher, sitting in the boat. */}
            <Path d="M -9 -8 Q -12 -30 -4 -48 L 8 -50 Q 11 -26 6 -8 Z" fill={JACKET_DARK} />
            <Path d="M 6 -10 L 26 -15 L 27 -2 L 6 -2 Z" fill={PANTS} />
            <Circle cx={22} cy={-12} r={5.5} fill={PANTS} />
            <Path d="M -11 -8 Q -15 -30 -12 -50 L 9 -52 Q 13 -28 9 -8 Z" fill={JACKET} />
            <Path d="M -6 -44 L 18 -46" stroke={JACKET_DARK} strokeWidth={7} strokeLinecap="round" />
            <Circle cx={18} cy={-46} r={4.5} fill={SKIN} />
            <Path d="M 3 -46 L 26 -48" stroke={JACKET} strokeWidth={7.5} strokeLinecap="round" />
            <Circle cx={26} cy={-48} r={4.5} fill={SKIN} />
            <Circle cx={0} cy={-64} r={10} fill={SKIN} />
            <Path d="M -10 -65 A 10 10 0 0 1 10 -65 Z" fill={CAP} />
            <Path d="M 3 -69 L 22 -66 L 21 -62 L 2 -65 Z" fill={CAP_DARK} />
            <Circle cx={5} cy={-59} r={1.6} fill="#1f2937" />

            {/* The hull. */}
            <Path d={HULL_PATH} fill="url(#hull)" />
            <Path d={HULL_STRIPE_PATH} fill="none" stroke={HULL_STRIPE} strokeWidth={4} />
            <Path d={HULL_RIM_PATH} fill="none" stroke={HULL_RIM} strokeWidth={5} strokeLinecap="round" />

            {/* The water in front of the hull: the boat sits in the lake. */}
            <Path d={HULL_WATER_PATH} fill="rgba(38, 110, 180, 0.88)" clipPath="url(#hullClip)" />
            <Path
              d="M -84 2 Q -42 9 0 3 Q 42 10 84 1"
              fill="none"
              stroke="rgba(226, 240, 255, 0.45)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </G>
        </Svg>

        {/* The rod: it swings on the hands of the fisher. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rod,
            { left: ROD_HAND_X + BOAT_W / 2 - ROD_W / 2, top: ROD_HAND_Y + BOAT_H / 2 - ROD_H / 2 },
            rodStyle,
          ]}
        >
          <Svg width={ROD_W} height={ROD_H} viewBox={`0 0 ${ROD_W} ${ROD_H}`}>
            <G transform={`translate(${ROD_W / 2} ${ROD_H / 2})`}>
              <Path d={taperedPath(-13, 9, ROD_TIP_DX, ROD_TIP_DY, 3.4, 0.8)} fill="#4a3122" />
              <Path d={taperedPath(-13, 9, -2, 1, 4.2, 3.2)} fill="#a97142" />
              <Circle cx={2} cy={6} r={5.5} fill="#64748b" />
              <Circle cx={2} cy={6} r={2.4} fill="#334155" />
              <Path d="M 2 11 L 2 14.5" stroke="#475569" strokeWidth={2.2} strokeLinecap="round" />
              <Circle cx={ROD_TIP_DX} cy={ROD_TIP_DY} r={2.2} fill="#e2e8f0" />
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* The frenzy washes the scene in pink. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frenzy, frenzyStyle]} />

      {/* The shadow of the catch under the water. */}
      <Animated.View pointerEvents="none" style={[styles.shadow, shadowStyle]}>
        <Svg width={hintSize} height={hintSize / 3} viewBox={`0 0 ${hintSize} ${hintSize / 3}`}>
          <Ellipse
            cx={hintSize / 2}
            cy={hintSize / 6}
            rx={hintSize / 2}
            ry={hintSize / 7}
            fill="rgba(4, 14, 32, 0.34)"
          />
        </Svg>
      </Animated.View>

      {/* The ripples of the bobber. */}
      <Animated.View pointerEvents="none" style={[styles.ripple, rippleStyle]}>
        <Svg width={120} height={120} viewBox="0 0 120 120">
          <Ellipse cx="60" cy="60" rx="52" ry="17" fill="none" stroke="#eaf6ff" strokeWidth="3" opacity={0.9} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.ripple, rippleStyle2]}>
        <Svg width={120} height={120} viewBox="0 0 120 120">
          <Ellipse cx="60" cy="60" rx="52" ry="17" fill="none" stroke="#eaf6ff" strokeWidth="2" opacity={0.7} />
        </Svg>
      </Animated.View>

      {/* The line of the rod, piece by piece. */}
      {Array.from({ length: LINE_SEGMENTS }, (_, index) => (
        <LineSegment
          key={`line-${index}`}
          index={index}
          segments={LINE_SEGMENTS}
          tipX={rodTipX}
          tipY={rodTipY}
          bobX={bobPosX}
          bobY={bobPosY}
          sag={sag}
        />
      ))}

      {/* The splash of the bobber. */}
      <Animated.View pointerEvents="none" style={[styles.splash, splashStyle]}>
        <Svg width={80} height={80} viewBox="0 0 80 80">
          <Path
            d="M 40 8 Q 52 26 62 20 Q 54 38 68 40 Q 52 52 56 70 Q 40 60 24 70 Q 28 52 12 40 Q 26 38 18 20 Q 28 26 40 8 Z"
            fill="#eaf6ff"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>

      {/* The bobber. */}
      <Animated.View pointerEvents="none" style={[styles.bobber, bobberStyle]}>
        <Bobber />
      </Animated.View>

      {/* The catch that comes out of the water. */}
      {catchAsset === null ? null : (
        <Animated.View pointerEvents="none" style={[styles.catch, catchStyle]}>
          <Glow color={catchColor} size={210} opacity={0.7} style={styles.catchGlow} />
          <Sprite assetId={catchAsset} size={140} />
        </Animated.View>
      )}

      {children}
    </View>
  );
}

/** The hull of the boat, in the frame of the boat. */
const HULL_PATH = 'M -78 -24 Q 0 -8 78 -24 L 50 18 Q 0 34 -50 18 Z';

/** The rim of the boat (the top edge of the hull). */
const HULL_RIM_PATH = 'M -80 -23 Q 0 -6 80 -23';

/** The stripe of the boat. */
const HULL_STRIPE_PATH = 'M -70 -2 Q 0 14 70 -2';

/** The water that covers the bottom of the hull. */
const HULL_WATER_PATH = 'M -86 0 Q -43 8 0 3 Q 43 10 86 0 L 86 48 L -86 48 Z';

/**
 * One piece of the fishing line.
 *
 * The line is a curve that sags under its own weight: it hangs from the tip
 * of the rod and it dips more when it is longer and less when the fish
 * pulls on it. Every piece of the line is a small bar that is turned along
 * the curve, so the whole line follows the bobber on the UI thread.
 */
function LineSegment({
  index,
  segments,
  tipX,
  tipY,
  bobX,
  bobY,
  sag,
}: {
  index: number;
  segments: number;
  tipX: SharedValue<number>;
  tipY: SharedValue<number>;
  bobX: SharedValue<number>;
  bobY: SharedValue<number>;
  sag: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const x0 = tipX.value;
    const y0 = tipY.value;
    const x2 = bobX.value;
    const y2 = bobY.value;
    const dx = x2 - x0;
    const dy = y2 - y0;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    // The control point of the curve: the middle of the line, pulled down.
    const cx = (x0 + x2) / 2;
    const cy = (y0 + y2) / 2 + 2 * sag.value * distance;
    const from = index / segments;
    const to = (index + 1) / segments;
    const start = quadraticPoint(x0, y0, cx, cy, x2, y2, from);
    const end = quadraticPoint(x0, y0, cx, cy, x2, y2, to);
    const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
    return {
      transform: [
        { translateX: start.x },
        { translateY: start.y },
        { rotate: `${angle}deg` },
        { scaleX: length / LINE_SEG },
      ],
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.lineSeg, style]} />;
}

/**
 * A point of a quadratic curve.
 *
 * The line of the rod is a curve that sags in the middle, so every piece of
 * it is placed on that curve.
 */
function quadraticPoint(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): { x: number; y: number } {
  'worklet';
  const rest = 1 - t;
  return {
    x: rest * rest * x0 + 2 * rest * t * cx + t * t * x1,
    y: rest * rest * y0 + 2 * rest * t * cy + t * t * y1,
  };
}

/**
 * A tapered rod.
 *
 * A rod is thick at the handle and thin at the tip, so it is drawn as a quad
 * that narrows down from one end to the other.
 */
function taperedPath(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return [
    `M ${(x0 + nx * w0).toFixed(1)} ${(y0 + ny * w0).toFixed(1)}`,
    `L ${(x1 + nx * w1).toFixed(1)} ${(y1 + ny * w1).toFixed(1)}`,
    `L ${(x1 - nx * w1).toFixed(1)} ${(y1 - ny * w1).toFixed(1)}`,
    `L ${(x0 - nx * w0).toFixed(1)} ${(y0 - ny * w0).toFixed(1)}`,
    'Z',
  ].join(' ');
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
    <Svg width={BOBBER} height={BOBBER} viewBox="0 0 32 32">
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
  boat: {
    position: 'absolute',
  },
  rod: {
    position: 'absolute',
    width: ROD_W,
    height: ROD_H,
  },
  shadow: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  lineSeg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LINE_SEG,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
