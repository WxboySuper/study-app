import type { CritterDef, PackDef } from '@study-app/core';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/settings';
import { colors, font, radius, rarityColors, rarityLabels } from '@/theme';

import { critterArt } from './critterArt';

/**
 * The opening of a pack.
 *
 * The pack shakes, bursts open and shows the critter that came out: the card
 * glows in the color of the rarity and tells the player whether the critter
 * is NEW or a DUPLICATE.
 */

const SHAKE_MS = 720;
const BURST_MS = 380;

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
}

type OpeningPhase = 'shaking' | 'burst' | 'revealed';

export function PackOpening({ visible, pack, critter, duplicate, onContinue }: PackOpeningProps) {
  const reduceMotion = useReduceMotion();

  const [phase, setPhase] = useState<OpeningPhase>('shaking');

  const shake = useSharedValue(0);
  const burst = useSharedValue(0);
  const cardScale = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      setPhase('shaking');
      shake.value = 0;
      burst.value = 0;
      cardScale.value = 0;
      glow.value = 0;
      return;
    }

    if (reduceMotion) {
      setPhase('revealed');
      cardScale.value = 1;
      glow.value = 1;
      return;
    }

    setPhase('shaking');
    shake.value = withSequence(
      withTiming(-1, { duration: 70, easing: Easing.linear }),
      withTiming(1, { duration: 70, easing: Easing.linear }),
      withTiming(-1, { duration: 70, easing: Easing.linear }),
      withTiming(1, { duration: 70, easing: Easing.linear }),
      withTiming(-1, { duration: 70, easing: Easing.linear }),
      withTiming(1, { duration: 70, easing: Easing.linear }),
      withTiming(0, { duration: 70, easing: Easing.linear }),
    );

    const burstTimer = setTimeout(() => {
      setPhase('burst');
      burst.value = withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.quad) });
    }, SHAKE_MS);

    const revealTimer = setTimeout(() => {
      setPhase('revealed');
    }, SHAKE_MS + BURST_MS);

    return () => {
      clearTimeout(burstTimer);
      clearTimeout(revealTimer);
    };
  }, [visible, reduceMotion, shake, burst, cardScale, glow]);

  useEffect(() => {
    if (phase !== 'revealed' || reduceMotion) {
      return;
    }
    cardScale.value = withSequence(
      withTiming(1.12, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 11, stiffness: 170 }),
    );
    glow.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(0.55, { duration: 700 }),
    );
  }, [phase, reduceMotion, cardScale, glow]);

  const shakeStyle = useAnimatedStyle(
    () => ({
      transform: [
        { translateX: shake.value * 10 },
        { rotate: `${shake.value * 4}deg` },
      ],
    }),
    [shake],
  );

  const burstStyle = useAnimatedStyle(
    () => ({
      opacity: 1 - burst.value,
      transform: [{ scale: 1 + burst.value * 0.6 }],
    }),
    [burst],
  );

  const cardStyle = useAnimatedStyle(
    () => ({
      opacity: phase === 'revealed' ? 1 : 0,
      transform: [{ scale: cardScale.value }],
    }),
    [phase, cardScale],
  );

  const glowStyle = useAnimatedStyle(
    () => ({
      opacity: glow.value,
      transform: [{ scale: 0.7 + glow.value * 0.5 }],
    }),
    [glow],
  );

  if (!visible) {
    return null;
  }

  const rarity = critter?.rarity ?? 'common';
  const rarityColor = rarityColors[rarity];
  const art = critter === null ? null : critterArt(critter);

  return (
    <View style={styles.backdrop}>
      {phase !== 'revealed' ? (
        <Animated.View style={[styles.pack, shakeStyle, burstStyle]}>
          <View style={styles.packArt}>
            {pack.critters.slice(0, 4).map((packCritter) => {
              const packArt = critterArt(packCritter);
              return packArt === null ? null : (
                <Image key={packCritter.id} source={packArt} style={styles.packSprite} />
              );
            })}
          </View>
          <Text style={styles.packName} numberOfLines={1}>
            {pack.name}
          </Text>
          <View style={styles.packStripe} />
        </Animated.View>
      ) : null}

      {phase === 'revealed' && critter !== null ? (
        <Animated.View style={[styles.reveal, cardStyle]}>
          <Animated.View
            style={[
              styles.glow,
              { backgroundColor: rarityColor },
              glowStyle,
            ]}
            pointerEvents="none"
          />

          <View style={[styles.badge, duplicate ? styles.badgeDuplicate : styles.badgeNew]}>
            <Text style={styles.badgeText}>{duplicate ? 'DUPLICATE' : 'NEW!'}</Text>
          </View>

          <View style={styles.artBox}>
            {art === null ? (
              <Text style={styles.emoji}>{critter.emoji}</Text>
            ) : (
              <Image source={art} style={styles.art} resizeMode="contain" />
            )}
          </View>

          <Text style={[styles.rarity, { color: rarityColor }]}>{rarityLabels[rarity]}</Text>
          <Text style={styles.name}>{critter.name}</Text>
          <Text style={styles.vibe}>{critter.vibe}</Text>

          <Pressable
            accessibilityRole="button"
            onPress={onContinue}
            style={({ pressed }) => [styles.continue, pressed && styles.pressed]}
          >
            <Text style={styles.continueText}>Nice!</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 3, 16, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pack: {
    width: 210,
    height: 250,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 4,
    borderColor: colors.border,
    borderBottomWidth: 10,
    borderBottomColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
  },
  packArt: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2,
  },
  packSprite: {
    width: 78,
    height: 78,
  },
  packName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: font.heavy,
    textAlign: 'center',
  },
  packStripe: {
    position: 'absolute',
    bottom: 10,
    left: 18,
    right: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  reveal: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 4,
    borderColor: colors.border,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    top: -30,
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0,
  },
  badge: {
    position: 'absolute',
    top: -18,
    right: 14,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 3,
    borderColor: colors.backgroundDeep,
    transform: [{ rotate: '10deg' }],
  },
  badgeNew: {
    backgroundColor: colors.success,
  },
  badgeDuplicate: {
    backgroundColor: colors.textDim,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: font.heavy,
    letterSpacing: 1,
  },
  artBox: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    width: 160,
    height: 160,
  },
  emoji: {
    fontSize: 84,
  },
  rarity: {
    fontSize: 15,
    fontWeight: font.heavy,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: font.heavy,
    textAlign: 'center',
    marginTop: 2,
  },
  vibe: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: font.medium,
    textAlign: 'center',
    marginTop: 4,
  },
  continue: {
    marginTop: 18,
    width: '100%',
    minHeight: 52,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    borderBottomWidth: 6,
    borderBottomColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 2 }],
  },
  continueText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: font.heavy,
  },
});
