import type { CritterDef, PackDef } from '@study-app/core';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { hapticImpact, hapticSuccess } from '@/haptics';
import { useReduceMotion } from '@/settings';
import { colors, fonts, rarityColors } from '@/theme';
import { GameButton, GlassCard, Glow, LightRays, Particles, RarityBadge } from '@/ui';

import { critterArt } from './critterArt';
import { PackPouch } from './PackPouch';
import { packTheme } from './packThemes';

/**
 * The opening of a pack.
 *
 * The pack flies to the middle of the screen, shakes harder and harder,
 * the screen flashes, the rays of the rarity come out and the critter pops
 * in with its label. A legendary is a show of its own: golden rays, more
 * confetti and heavy haptics.
 */

const FLY_MS = 420;
const SHAKE_MS = 900;
const FLASH_MS = 340;

export interface PackOpeningProps {
  /** `true` while the opening is on the screen. */
  visible: boolean;
  /** The pack that was opened. */
  pack: PackDef;
  /** The critter that came out of the pack. */
  critter: CritterDef | null;
  /** `true` when the player already owned the critter. */
  duplicate: boolean;
  /** Called when the player closes the reveal. */
  onContinue: () => void;
  /** Called when the player opens the same pack again. */
  onOpenAnother?: () => void;
}

type OpeningPhase = 'idle' | 'fly' | 'shake' | 'flash' | 'reveal';

export function PackOpening({
  visible,
  pack,
  critter,
  duplicate,
  onContinue,
  onOpenAnother,
}: PackOpeningProps) {
  const reduceMotion = useReduceMotion();

  const [phase, setPhase] = useState<OpeningPhase>('idle');
  const [burst, setBurst] = useState(0);

  const backdrop = useSharedValue(0);
  const fly = useSharedValue(0);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const critterScale = useSharedValue(0);
  const labelScale = useSharedValue(0);
  const stampScale = useSharedValue(0);

  const rarity = critter?.rarity ?? 'common';
  const rarityColor = rarityColors[rarity];
  const legendary = rarity === 'legendary';
  const theme = packTheme(pack.id);
  const art = critter === null ? null : critterArt(critter);

  // The intensity of the show depends on the rarity.
  const show = useMemo(
    () => ({
      rays: legendary ? 18 : 12,
      rayOpacity: legendary ? 0.4 : rarity === 'epic' ? 0.3 : 0.2,
      particles: legendary ? 64 : rarity === 'epic' ? 42 : rarity === 'rare' ? 32 : 24,
      colors: legendary
        ? [colors.gold, '#fff7d6', '#fbbf24', '#ffffff']
        : [rarityColor, '#ffffff', colors.gold],
      haptics: legendary ? 'heavy' : rarity === 'epic' ? 'medium' : 'light',
    }),
    [legendary, rarity, rarityColor],
  );

  // The whole show is one timeline.
  useEffect(() => {
    if (!visible) {
      setPhase('idle');
      backdrop.value = withTiming(0, { duration: 150 });
      fly.value = 0;
      shake.value = 0;
      flash.value = 0;
      critterScale.value = 0;
      labelScale.value = 0;
      stampScale.value = 0;
      return undefined;
    }

    if (reduceMotion) {
      setPhase('reveal');
      backdrop.value = withTiming(1, { duration: 120 });
      critterScale.value = withTiming(1, { duration: 160 });
      labelScale.value = withTiming(1, { duration: 160 });
      stampScale.value = withTiming(1, { duration: 160 });
      setBurst((current) => current + 1);
      return undefined;
    }

    setPhase('fly');
    backdrop.value = withTiming(1, { duration: 220 });
    fly.value = withSequence(
      withTiming(1, { duration: FLY_MS, easing: Easing.out(Easing.cubic) }),
    );

    const flyTimer = setTimeout(() => {
      setPhase('shake');
      shake.value = withTiming(1, { duration: SHAKE_MS, easing: Easing.linear });
    }, FLY_MS);

    const flashTimer = setTimeout(() => {
      setPhase('flash');
      flash.value = withSequence(
        withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: FLASH_MS - 140, easing: Easing.out(Easing.quad) }),
      );
      hapticImpact(legendary ? 'heavy' : 'medium');
    }, FLY_MS + SHAKE_MS);

    const revealTimer = setTimeout(() => {
      setPhase('reveal');
      setBurst((current) => current + 1);
      hapticSuccess();
    }, FLY_MS + SHAKE_MS + FLASH_MS);

    return () => {
      clearTimeout(flyTimer);
      clearTimeout(flashTimer);
      clearTimeout(revealTimer);
    };
  }, [
    backdrop,
    critterScale,
    flash,
    fly,
    labelScale,
    legendary,
    reduceMotion,
    shake,
    stampScale,
    visible,
  ]);

  // The pack shakes harder and harder, with a buzz on every beat.
  useEffect(() => {
    if (phase !== 'shake') {
      return undefined;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    let step = 0;
    const gaps = [180, 150, 120, 100, 80, 70, 60, 50, 45, 40];

    const tick = () => {
      const gap = gaps[Math.min(step, gaps.length - 1)] ?? 40;
      elapsed += gap;
      step += 1;
      const timer = setTimeout(() => {
        hapticImpact(step % 4 === 0 ? 'medium' : 'light');
        if (elapsed < SHAKE_MS) {
          tick();
        }
      }, gap);
      timers.push(timer);
    };

    tick();

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [phase]);

  // The critter pops in, the label slams down and the stamp lands.
  useEffect(() => {
    if (phase !== 'reveal') {
      return undefined;
    }

    critterScale.value = withSequence(
      withTiming(1.16, { duration: 170, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 11, stiffness: 170 }),
    );
    labelScale.value = withSequence(
      withTiming(2.4, { duration: 70, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 15, stiffness: 230 }),
    );
    stampScale.value = withSequence(
      withTiming(1.35, { duration: 90, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 200 }),
    );

    return undefined;
  }, [critterScale, labelScale, phase, stampScale]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const packStyle = useAnimatedStyle(() => ({
    opacity:
      phase === 'flash' || phase === 'reveal'
        ? Math.max(0, 1 - Math.min(1, flash.value * 1.6))
        : 1,
    transform: [
      { translateY: -140 + fly.value * 140 },
      { scale: 0.55 + fly.value * 0.45 },
      { rotate: `${-14 + fly.value * 14 + Math.sin(shake.value * 60) * shake.value * 9}deg` },
      { translateX: Math.sin(shake.value * 46) * shake.value * 12 },
    ],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const critterStyle = useAnimatedStyle(() => ({
    opacity: phase === 'reveal' ? 1 : 0,
    transform: [{ scale: critterScale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: phase === 'reveal' ? 1 : 0,
    transform: [{ scale: labelScale.value }],
  }));

  const stampStyle = useAnimatedStyle(() => ({
    opacity: phase === 'reveal' ? 1 : 0,
    transform: [{ rotate: '-9deg' }, { scale: stampScale.value }],
  }));

  if (!visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue"
      onPress={phase === 'reveal' ? onContinue : undefined}
      style={styles.backdrop}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.tint, backdropStyle]} />

      {phase === 'reveal' ? (
        <>
          <LightRays
            color={legendary ? colors.gold : rarityColor}
            count={show.rays}
            size={760}
            opacity={show.rayOpacity}
            style={styles.rays}
          />
          <Particles
            trigger={burst}
            count={show.particles}
            colors={show.colors}
            size={legendary ? 16 : 12}
            distance={legendary ? 300 : 220}
            gravity={legendary ? 320 : 260}
          />
        </>
      ) : null}

      {phase !== 'reveal' ? (
        <Animated.View style={[styles.pack, packStyle]}>
          <Glow color={theme.glow} size={280} opacity={0.55} style={styles.packGlow} />
          <PackPouch gradient={theme.gradient} crimp={theme.crimp} width={168} height={196} />
          <Text style={styles.packName} numberOfLines={1}>
            {pack.name}
          </Text>
        </Animated.View>
      ) : null}

      {phase === 'reveal' && critter !== null ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={styles.revealWrap}
          pointerEvents="box-none"
        >
          <Glow color={rarityColor} size={240} opacity={0.45} style={styles.critterGlow} />

          <Animated.View style={styles.badgeWrap} pointerEvents="none">
            <Animated.View
              style={[
                styles.stamp,
                { backgroundColor: duplicate ? colors.textDim : colors.success },
                stampStyle,
              ]}
            >
              <Text style={styles.stampText}>{duplicate ? 'DUPLICATE' : 'NEW!'}</Text>
            </Animated.View>
          </Animated.View>

          <GlassCard style={styles.reveal} tint={rarityColor}>
            <Animated.View style={[styles.artBox, critterStyle]}>
              {art === null ? (
                <Text style={styles.emoji}>{critter.emoji}</Text>
              ) : (
                <Image source={art} style={styles.art} resizeMode="contain" />
              )}
            </Animated.View>

            <Animated.View style={labelStyle}>
              <RarityBadge rarity={rarity} size="md" />
              <Text style={styles.name}>{critter.name}</Text>
              <Text style={styles.vibe}>{critter.vibe}</Text>
            </Animated.View>

            <View style={styles.actions} pointerEvents="box-none">
              <GameButton
                label="CONTINUE"
                variant="primary"
                size="lg"
                onPress={onContinue}
                accessibilityLabel="Continue"
              />
              {onOpenAnother === undefined ? null : (
                <GameButton
                  label="OPEN ANOTHER"
                  variant="secondary"
                  size="md"
                  onPress={onOpenAnother}
                  accessibilityLabel="Open another pack"
                />
              )}
            </View>
          </GlassCard>
        </Animated.View>
      ) : null}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(4, 5, 8, 0.55)',
  },
  tint: {
    backgroundColor: 'rgba(6, 7, 11, 0.96)',
  },
  rays: {
    top: '50%',
    left: '50%',
    marginTop: -380,
    marginLeft: -380,
  },
  pack: {
    alignItems: 'center',
    gap: 10,
  },
  packGlow: {
    position: 'absolute',
    top: -30,
  },
  packName: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 15,
    letterSpacing: 1,
    textAlign: 'center',
  },
  revealWrap: {
    width: '100%',
    maxWidth: 380,
  },
  reveal: {
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  badgeWrap: {
    position: 'absolute',
    top: -22,
    right: 14,
    zIndex: 3,
  },
  stamp: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 3,
    borderColor: colors.backgroundDeep,
  },
  stampText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 15,
    letterSpacing: 1.5,
  },
  critterGlow: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
  },
  artBox: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    width: 180,
    height: 180,
  },
  emoji: {
    fontSize: 96,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 26,
    textAlign: 'center',
    marginTop: 6,
  },
  vibe: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 2,
  },
  actions: {
    width: '100%',
    marginTop: 12,
    gap: 10,
  },
  flash: {
    backgroundColor: '#ffffff',
  },
});
