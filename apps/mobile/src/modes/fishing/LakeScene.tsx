import type { FishingPhase } from '@study-app/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fishingSprite } from './assets';
import { Sprite } from './Sprite';

/**
 * The lake of the fishing mode (docs/design/fishing.md §11).
 *
 * The scene is built from plain views and images that are stacked on top of
 * each other: the background, two wave strips, the shadow of the fish, the
 * bobber, the line and the fisher. Every animation runs on the UI thread
 * (Reanimated shared values), so the scene stays smooth while the JS thread
 * is busy with the next card.
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

export interface LakeSceneProps {
  /** Where the mode is right now. */
  phase: FishingPhase;
  /** The tier of the catch on the line, so the shadow can hint at its size. */
  hintTier: string | null;
  /** `true` while the frenzy lasts. */
  frenzy: boolean;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
  /** The overlays (HUD, question note, reveal card...). */
  children?: ReactNode;
}

export function LakeScene({ phase, hintTier, frenzy, reduceMotion, children }: LakeSceneProps) {
  const { width, height } = useWindowDimensions();

  const daySprite = fishingSprite('bg_lake_day');
  const frenzySprite = fishingSprite('bg_lake_frenzy');

  // The water line and the spot of the bobber.
  const waterY = height * 0.62;
  const bobHomeX = width * 0.64;
  const rodX = width * 0.26;
  const rodY = height * 0.74;

  const bobX = useSharedValue(rodX);
  const bobY = useSharedValue(rodY);
  const bobBob = useSharedValue(0);
  const shadowX = useSharedValue(bobHomeX);
  const shadowScale = useSharedValue(0.4);
  const shadowOpacity = useSharedValue(0);
  const waveX = useSharedValue(0);
  const wave2X = useSharedValue(0);
  const splashScale = useSharedValue(0.2);
  const splashOpacity = useSharedValue(0);
  const rippleScale = useSharedValue(0.3);
  const rippleOpacity = useSharedValue(0);
  const frenzyGlow = useSharedValue(0);
  const fisherBob = useSharedValue(0);

  const hintSize = hintTier === null ? 60 : (SHADOW_SIZES[hintTier] ?? 60);

  // The water and the fisher never stop moving.
  useEffect(() => {
    if (reduceMotion) {
      waveX.value = 0;
      wave2X.value = 0;
      fisherBob.value = 0;
      bobBob.value = 0;
      return;
    }

    waveX.value = withRepeat(withTiming(-60, { duration: 5200, easing: Easing.linear }), -1, false);
    wave2X.value = withRepeat(withTiming(-38, { duration: 7800, easing: Easing.linear }), -1, false);
    fisherBob.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    bobBob.value = withRepeat(
      withSequence(
        withTiming(-9, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, waveX, wave2X, fisherBob, bobBob]);

  // The frenzy tints the whole scene.
  useEffect(() => {
    frenzyGlow.value = withTiming(frenzy ? 1 : 0, { duration: 600 });
  }, [frenzy, frenzyGlow]);

  // The phases of the loop.
  useEffect(() => {
    switch (phase) {
      case 'casting': {
        bobX.value = withSpring(bobHomeX, { damping: 14, stiffness: 90 });
        bobY.value = withSpring(waterY, { damping: 14, stiffness: 90 });
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
        bobX.value = withTiming(width * 0.5, { duration: 900, easing: Easing.inOut(Easing.quad) });
        bobY.value = withTiming(height * 0.3, { duration: 900, easing: Easing.inOut(Easing.quad) });
        shadowScale.value = withTiming(1.6, { duration: 900 });
        shadowOpacity.value = withTiming(0, { duration: 700 });
        break;
      }
      case 'reveal': {
        bobOpacityHidden();
        break;
      }
      case 'got_away': {
        // The line snaps and the fish swims off.
        shadowX.value = withTiming(width * 1.2, { duration: 700, easing: Easing.out(Easing.quad) });
        shadowOpacity.value = withTiming(0, { duration: 700 });
        bobY.value = withTiming(waterY - 40, { duration: 200 });
        break;
      }
      case 'idle': {
        bobX.value = withSpring(rodX, { damping: 16, stiffness: 80 });
        bobY.value = withSpring(rodY, { damping: 16, stiffness: 80 });
        shadowOpacity.value = withTiming(0, { duration: 300 });
        shadowScale.value = withTiming(0.4, { duration: 300 });
        splashOpacity.value = 0;
        rippleOpacity.value = 0;
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
    bobHomeX,
    waterY,
    rodX,
    rodY,
    width,
    height,
  ]);

  function bobOpacityHidden(): void {
    bobY.value = withTiming(height * 0.28, { duration: 240 });
  }

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
      { translateY: waterY + 42 - (hintSize * shadowScale.value) / 2 },
      { scale: shadowScale.value },
    ],
  }));

  const waveStyle = useAnimatedStyle(() => ({ transform: [{ translateX: waveX.value }] }));
  const wave2Style = useAnimatedStyle(() => ({ transform: [{ translateX: wave2X.value }] }));

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

  const frenzyStyle = useAnimatedStyle(() => ({ opacity: frenzyGlow.value * 0.55 }));

  const fisherStyle = useAnimatedStyle(() => ({ transform: [{ translateY: fisherBob.value }] }));

  const lineStyle = useAnimatedStyle(() => {
    const dx = bobX.value - rodX;
    const dy = bobY.value - rodY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      width: length,
      transform: [{ translateX: rodX }, { translateY: rodY }, { rotate: `${angle}deg` }],
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.background}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#9ad9e8' }]} />
        <View style={[styles.hills, { backgroundColor: '#7fb069' }]} />
        <View style={[styles.water, { top: waterY, backgroundColor: '#48cae4' }]} />
        {daySprite === null ? null : (
          <Image source={daySprite} resizeMode="cover" style={styles.cover} />
        )}
        {frenzySprite === null ? null : (
          <Animated.View style={[StyleSheet.absoluteFill, frenzyStyle]} pointerEvents="none">
            <Image source={frenzySprite} resizeMode="cover" style={styles.cover} />
          </Animated.View>
        )}
      </View>

      <Animated.View style={[styles.wave, styles.waveBack, wave2Style]} pointerEvents="none">
        <WaveStrip width={width} />
      </Animated.View>
      <Animated.View style={[styles.wave, styles.waveFront, waveStyle]} pointerEvents="none">
        <WaveStrip width={width} />
      </Animated.View>

      <Animated.View style={[styles.shadow, shadowStyle]} pointerEvents="none">
        <Sprite assetId="fish_shadow" size={hintSize} />
      </Animated.View>

      <Animated.View style={[styles.line, lineStyle]} pointerEvents="none" />

      <Animated.View style={splashStyle} pointerEvents="none">
        <Sprite assetId="splash" size={80} />
      </Animated.View>

      <Animated.View style={rippleStyle} pointerEvents="none">
        <Sprite assetId="ripple_ring" size={120} />
      </Animated.View>

      <Animated.View style={[styles.bobber, bobberStyle]} pointerEvents="none">
        <Sprite assetId="bobber" size={32} />
      </Animated.View>

      <Animated.View style={[styles.fisher, fisherStyle]} pointerEvents="none">
        <Sprite assetId="fisher_rod" size={120} />
        <Text style={styles.fisherLabel}>you</Text>
      </Animated.View>

      {children}
    </View>
  );
}

/**
 * A strip of water.
 *
 * Without the PNG the strip is a soft band of foam; with it, the real wave
 * sprite is tiled across the screen.
 */
function WaveStrip({ width }: { width: number }) {
  const source = fishingSprite('wave_strip');

  if (source !== null) {
    return <Image source={source} resizeMode="stretch" style={{ width: width + 160, height: 26 }} />;
  }

  return <View style={{ width: width + 160, height: 26, backgroundColor: '#caf0f8', borderRadius: 13, opacity: 0.75 }} />;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  hills: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '26%',
    top: '22%',
    borderTopLeftRadius: 120,
    borderTopRightRadius: 160,
    opacity: 0.85,
  },
  water: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.92,
  },
  wave: {
    position: 'absolute',
    left: -80,
    right: -80,
    height: 26,
    opacity: 0.55,
  },
  waveBack: {
    opacity: 0.32,
    top: '68%',
  },
  waveFront: {
    top: '57%',
  },
  shadow: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  line: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2,
    backgroundColor: '#f8fafc',
    transformOrigin: 'left center',
    opacity: 0.85,
  },
  bobber: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  ripple: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  fisher: {
    position: 'absolute',
    left: 16,
    bottom: 24,
    alignItems: 'center',
  },
  fisherLabel: {
    color: '#e0fbfc',
    fontSize: 11,
    marginTop: -6,
  },
});
