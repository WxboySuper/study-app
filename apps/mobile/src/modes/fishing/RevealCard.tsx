import type { CatchTier, RolledCatch } from '@study-app/core';
import { CATCH_TIERS, isCatchOutcome } from '@study-app/core';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, radius, rarityColors } from '@/theme';
import { GameButton, GlassCard, Glow, LightRays, Particles } from '@/ui';

import { assetIdOf, captionOf, nameOf } from './catchArt';
import { tierColor } from './assets';
import { Sprite } from './Sprite';

/**
 * The reveal card of the fishing mode (docs/design/fishing.md §5).
 *
 * The catch springs out of the water onto a card with its rarity ribbon, its
 * weight (counting up) and, for the silly catches, a joke. The special
 * catches (a new lure, the frenzy, a powerup and the pack ticket) get their
 * own card.
 */

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface RevealCardProps {
  /** `true` while the card is on the screen. */
  visible: boolean;
  /** The catch that was landed. */
  catch: RolledCatch;
  /** `true` when the catch was caught for the first time. */
  isNew: boolean;
  /** Called when the player dismisses the card. */
  onContinue: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function RevealCard({ visible, catch: landed, isNew, onContinue, reduceMotion }: RevealCardProps) {
  const scale = useSharedValue(0.6);
  const weight = useSharedValue(0);
  const flash = useSharedValue(0);
  const stamp = useSharedValue(0);
  const [burst, setBurst] = useState(0);

  const isCatch = isCatchOutcome(landed);
  const tier: CatchTier | null = isCatch ? landed.tier : null;
  const tierName = tier === null ? null : (CATCH_TIERS.find((entry) => entry.id === tier)?.name ?? tier);
  const color = tier === null ? '#38bdf8' : tierColor(tier);
  const lbs = isCatch ? landed.lbs : 0;
  const isCritter = landed.kind === 'critter';
  const rarityColor = isCritter && landed.kind === 'critter' ? rarityColors[landed.critter.rarity] : color;

  useEffect(() => {
    if (!visible) {
      return;
    }

    weight.value = 0;

    if (reduceMotion) {
      scale.value = 1;
      weight.value = lbs;
      flash.value = 0;
      stamp.value = 1;
      return;
    }

    scale.value = withSequence(
      withTiming(1.06, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 150 }),
    );
    weight.value = withTiming(lbs, { duration: 900, easing: Easing.out(Easing.cubic) });
    stamp.value = withSequence(
      withTiming(1.4, { duration: 90, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 11, stiffness: 200 }),
    );
    setBurst((current) => current + 1);

    // The big catches flash the whole screen.
    if (tier === 'cotd' || tier === 'legend') {
      flash.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 520 }),
      );
    }
  }, [visible, reduceMotion, scale, weight, flash, stamp, lbs, tier, setBurst]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: visible ? 1 : 0,
    transform: [{ scale: scale.value }],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.55 }));

  const stampStyle = useAnimatedStyle(() => ({
    opacity: visible ? 1 : 0,
    transform: [{ rotate: '-9deg' }, { scale: stamp.value }],
  }));

  const weightProps = useAnimatedProps(() => ({
    text: `${Math.round(weight.value).toLocaleString('en-US')} lbs`,
    defaultValue: `${Math.round(weight.value).toLocaleString('en-US')} lbs`,
  }));

  if (!visible) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />

      {tier === 'cotd' || tier === 'legend' ? (
        <LightRays color={color} count={18} size={720} opacity={0.34} style={styles.rays} />
      ) : null}

      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <GlassCard
            contentStyle={styles.cardContent}
            tint={rarityColor}
            face={[`${rarityColor}33`, `${rarityColor}0f`]}
          >
            {tierName === null ? null : (
              <View style={[styles.ribbon, { backgroundColor: color }]}>
                <Text style={styles.ribbonText}>{tierName}</Text>
              </View>
            )}

            <View style={styles.art}>
              <Glow color={rarityColor} size={250} opacity={0.65} style={styles.artGlow} />
              <Sprite assetId={assetIdOf(landed)} size={150} />
              {isNew ? (
                <Animated.View style={[styles.newStamp, stampStyle]}>
                  <Text style={styles.newStampText}>NEW!</Text>
                </Animated.View>
              ) : null}
            </View>

            <Text style={styles.name}>{nameOf(landed)}</Text>

            {isCatch ? (
              <AnimatedTextInput
                editable={false}
                animatedProps={weightProps}
                underlineColorAndroid="transparent"
                style={[styles.weight, { color }]}
                accessibilityLabel={`${nameOf(landed)} weighs ${Math.round(lbs).toLocaleString('en-US')} lbs`}
              />
            ) : null}

            {captionOf(landed) === undefined ? null : (
              <Text style={styles.joke}>“{captionOf(landed)}”</Text>
            )}

            <View style={styles.actions}>
              <GameButton label="CONTINUE" variant="primary" size="lg" onPress={onContinue} />
            </View>
          </GlassCard>
        </Animated.View>
      </View>

      <Particles
        trigger={burst}
        count={26}
        colors={[rarityColor, '#ffffff', colors.gold]}
        size={11}
        distance={180}
        gravity={300}
        duration={1000}
        style={styles.splash}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flash: {
    backgroundColor: '#ffffff',
  },
  rays: {
    top: '50%',
    left: '50%',
    marginTop: -360,
    marginLeft: -360,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '86%',
  },
  cardContent: {
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  ribbon: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderRadius: radius.chip,
    paddingVertical: 6,
    marginBottom: 12,
  },
  ribbonText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: fonts.title,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  art: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlow: {
    position: 'absolute',
  },
  newStamp: {
    position: 'absolute',
    top: 2,
    right: -6,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 3,
    borderColor: 'rgba(8, 10, 16, 0.9)',
  },
  newStampText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: fonts.title,
    letterSpacing: 1.2,
  },
  name: {
    marginTop: 6,
    color: colors.text,
    fontSize: 23,
    fontFamily: fonts.title,
    textAlign: 'center',
  },
  weight: {
    marginTop: 2,
    fontSize: 26,
    fontFamily: fonts.title,
    padding: 0,
    minWidth: 140,
    textAlign: 'center',
  },
  joke: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    marginTop: 16,
  },
  splash: {
    top: '35%',
    bottom: '35%',
  },
});
