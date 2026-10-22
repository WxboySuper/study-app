import type { CatchTier, RolledCatch } from '@study-app/core';
import { CATCH_TIERS, isCatchOutcome } from '@study-app/core';
import { useEffect, useState } from 'react';
import { Image, ImageBackground, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { artFor } from '@/content/art';
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
 *
 * A catch never grants a critter to the collection (only a pack does), so the
 * card has no "NEW!" stamp: it shows the catch, nothing more.
 *
 * The card is built from the UI art of the mode: the light rays of
 * `ui_reveal_rays` turn slowly behind the catch, the tier name sits on the
 * ribbon of `ui_tier_ribbon` (tinted with the colour of the tier) and the
 * name of the catch hangs on the wooden tag of `ui_tag_wood`.
 *
 * A heavy catch (the "Heavy Catch" tier) gets its own deep sea theme: a
 * gold "HEAVY CATCH!" banner, extra rays, a bigger splash and a heavier
 * haptic.
 */

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** The deep sea colours of a heavy catch. */
const HEAVY_THEME = {
  /** The colour of the banner and of the gold accents. */
  gold: '#f5c542',
  /** The deep water behind the card. */
  deep: '#0b3b3a',
  /** The colour of the rays. */
  rays: '#ffd75e',
};

export interface RevealCardProps {
  /** `true` while the card is on the screen. */
  visible: boolean;
  /** The catch that was landed. */
  catch: RolledCatch;
  /** Called when the player dismisses the card. */
  onContinue: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function RevealCard({ visible, catch: landed, onContinue, reduceMotion }: RevealCardProps) {
  const scale = useSharedValue(0.6);
  const weight = useSharedValue(0);
  const flash = useSharedValue(0);
  const spin = useSharedValue(0);
  const [burst, setBurst] = useState(0);

  const isCatch = isCatchOutcome(landed);
  const tier: CatchTier | null = isCatch ? landed.tier : null;
  const isHeavy = tier === 'heavy';
  const tierName = tier === null ? null : (CATCH_TIERS.find((entry) => entry.id === tier)?.name ?? tier);
  const color = tier === null ? '#38bdf8' : tierColor(tier);
  const lbs = isCatch ? landed.lbs : 0;
  const isCritter = landed.kind === 'critter';
  const rarityColor = isCritter && landed.kind === 'critter' ? rarityColors[landed.critter.rarity] : color;

  // The art of the UI pieces of the card.
  const raysArt = artFor('ui_reveal_rays');
  const ribbonArt = artFor('ui_tier_ribbon');
  const tagArt = artFor('ui_tag_wood');

  useEffect(() => {
    if (!visible) {
      cancelAnimation(spin);
      spin.value = 0;
      return;
    }

    weight.value = 0;

    if (reduceMotion) {
      scale.value = 1;
      weight.value = lbs;
      flash.value = 0;
      spin.value = 0;
      return;
    }

    scale.value = withSequence(
      withTiming(1.06, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 150 }),
    );
    weight.value = withTiming(lbs, { duration: 900, easing: Easing.out(Easing.cubic) });
    // The rays of the reveal turn slowly behind the catch.
    spin.value = withRepeat(
      withTiming(360, { duration: 26_000, easing: Easing.linear }),
      -1,
      false,
    );
    setBurst((current) => current + 1);

    // The big catches flash the whole screen.
    if (tier === 'cotd' || tier === 'legend' || tier === 'heavy') {
      flash.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 520 }),
      );
    }
  }, [visible, reduceMotion, scale, weight, flash, spin, lbs, tier, setBurst]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: visible ? 1 : 0,
    transform: [{ scale: scale.value }],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.55 }));

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const weightProps = useAnimatedProps(() => ({
    text: `${Math.round(weight.value).toLocaleString('en-US')} lbs`,
    defaultValue: `${Math.round(weight.value).toLocaleString('en-US')} lbs`,
  }));

  if (!visible) {
    return null;
  }

  const tagContent = (
    <>
      <Text style={styles.name}>{nameOf(landed)}</Text>

      {isCatch ? (
        <AnimatedTextInput
          editable={false}
          animatedProps={weightProps}
          underlineColorAndroid="transparent"
          style={[styles.weight, { color: isHeavy ? HEAVY_THEME.gold : '#fff3cf' }]}
          accessibilityLabel={`${nameOf(landed)} weighs ${Math.round(lbs).toLocaleString('en-US')} lbs`}
        />
      ) : null}
    </>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />

      {tier === 'cotd' || tier === 'legend' ? (
        <LightRays color={color} count={18} size={720} opacity={0.34} style={styles.rays} />
      ) : null}

      {isHeavy ? (
        <LightRays color={HEAVY_THEME.rays} count={28} size={860} opacity={0.42} style={styles.rays} />
      ) : null}

      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <GlassCard
            contentStyle={styles.cardContent}
            tint={rarityColor}
            face={isHeavy ? [`${HEAVY_THEME.deep}dd`, `${HEAVY_THEME.deep}66`] : [`${rarityColor}33`, `${rarityColor}0f`]}
          >
            {isHeavy ? (
              <View style={styles.heavyBanner}>
                <Text style={styles.heavyBannerText}>HEAVY CATCH!</Text>
              </View>
            ) : null}

            {tierName === null ? null : ribbonArt === null ? (
              <View style={[styles.ribbon, { backgroundColor: color }]}>
                <Text style={styles.ribbonText}>{tierName}</Text>
              </View>
            ) : (
              <ImageBackground
                source={ribbonArt}
                resizeMode="cover"
                style={styles.ribbon}
                imageStyle={styles.ribbonImage}
              >
                <View style={[styles.ribbonTint, { backgroundColor: color }]} pointerEvents="none" />
                <Text style={styles.ribbonText}>{tierName}</Text>
              </ImageBackground>
            )}

            <View style={styles.art}>
              <Glow color={isHeavy ? HEAVY_THEME.gold : rarityColor} size={250} opacity={0.65} style={styles.artGlow} />
              {raysArt === null ? null : (
                <Animated.View style={[styles.raysSpin, spinStyle]} pointerEvents="none">
                  <Image
                    source={raysArt}
                    resizeMode="contain"
                    style={styles.raysImage}
                    accessibilityIgnoresInvertColors
                  />
                </Animated.View>
              )}
              <Sprite assetId={assetIdOf(landed)} size={isHeavy ? 168 : 150} />
            </View>

            {tagArt === null ? (
              <View style={styles.tagPlain}>{tagContent}</View>
            ) : (
              <ImageBackground
                source={tagArt}
                resizeMode="cover"
                style={styles.tag}
                imageStyle={styles.tagImage}
              >
                {tagContent}
              </ImageBackground>
            )}

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
        count={isHeavy ? 44 : 26}
        colors={
          isHeavy
            ? [HEAVY_THEME.gold, '#ffffff', '#2dd4bf', colors.gold]
            : [rarityColor, '#ffffff', colors.gold]
        }
        size={isHeavy ? 14 : 11}
        distance={isHeavy ? 280 : 180}
        gravity={isHeavy ? 360 : 300}
        duration={isHeavy ? 1400 : 1000}
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
  heavyBanner: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderRadius: radius.chip,
    paddingVertical: 7,
    marginBottom: 10,
    backgroundColor: HEAVY_THEME.gold,
    borderWidth: 2,
    borderColor: '#0b3b3a',
  },
  heavyBannerText: {
    color: '#0b3b3a',
    fontSize: 15,
    fontFamily: fonts.title,
    letterSpacing: 2.4,
  },
  ribbon: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 62,
    borderRadius: radius.chip,
    marginBottom: 12,
    overflow: 'hidden',
  },
  ribbonImage: {
    borderRadius: radius.chip,
  },
  ribbonTint: {
    ...StyleSheet.absoluteFill,
    opacity: 0.62,
  },
  ribbonText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: fonts.title,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(4, 10, 24, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  art: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlow: {
    position: 'absolute',
  },
  raysSpin: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  raysImage: {
    width: 260,
    height: 260,
  },
  tag: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 78,
    marginTop: 8,
    overflow: 'hidden',
  },
  tagImage: {
    borderRadius: radius.chip,
  },
  tagPlain: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 8,
  },
  name: {
    color: '#fff8e7',
    fontSize: 22,
    fontFamily: fonts.title,
    textAlign: 'center',
    textShadowColor: 'rgba(30, 16, 4, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  weight: {
    marginTop: 2,
    fontSize: 26,
    fontFamily: fonts.title,
    padding: 0,
    minWidth: 140,
    textAlign: 'center',
    textShadowColor: 'rgba(30, 16, 4, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
