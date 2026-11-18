import type { CatchTier, RolledCatch } from '@study-app/core';
import { CATCH_TIERS, formatLbs, isCatchOutcome } from '@study-app/core';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { artFor } from '@/content/art';
import { colors, fonts, radius, rarityColors } from '@/theme';
import { GlassCard, Glow, LightRays, Particles } from '@/ui';

import { assetIdOf, captionOf, nameOf } from './catchArt';
import { tierColor } from './assets';
import { Sprite } from './Sprite';

/**
 * The claim card of the fishing mode (docs/design/fishing.md §5).
 *
 * After a correct answer the scene dims, the catch flies out of the water and
 * a centred card shows the category, the name, the art, the tier badge and
 * the weight. The card waits for a tap: the haul only ticks up when the
 * player taps **Tap to claim**, so the catch is never counted before the
 * player has seen it.
 *
 * The special catches (a new lure, the frenzy, a powerup and the pack ticket)
 * get their own card. A catch never grants a critter to the collection (only
 * a pack does), so the card has no "NEW!" stamp: it shows the catch, nothing
 * more.
 *
 * The card is built from the UI art of the mode: the light rays of
 * `ui_reveal_rays` turn slowly behind the catch, the tier name sits on the
 * ribbon of `ui_tier_ribbon` (tinted with the colour of the tier) and the
 * name of the catch hangs on the wooden tag of `ui_tag_wood`.
 *
 * A heavy catch (a `kind: 'heavy'` catch of the Angler's Legend tier) gets
 * its own deep sea theme: gold accents, extra rays, a bigger splash and a
 * heavier haptic.
 */

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
  /** Called when the player claims the card. */
  onContinue: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function RevealCard({ visible, catch: landed, onContinue, reduceMotion }: RevealCardProps) {
  const scale = useSharedValue(0.6);
  const flash = useSharedValue(0);
  const spin = useSharedValue(0);
  const [burst, setBurst] = useState(0);

  const isCatch = isCatchOutcome(landed);
  const tier: CatchTier | null = isCatch ? landed.tier : null;
  const isHeavy = landed.kind === 'heavy';
  const tierName =
    tier === null ? null : (CATCH_TIERS.find((entry) => entry.id === tier)?.name ?? tier);
  const color = tier === null ? '#38bdf8' : tierColor(tier);
  const lbs = isCatch ? landed.lbs : 0;
  const rarityColor =
    landed.kind === 'critter' && isCatch ? rarityColors[landed.critter.rarity] : color;

  // The art of the UI pieces of the card.
  const raysArt = artFor('ui_reveal_rays');

  useEffect(() => {
    if (!visible) {
      cancelAnimation(spin);
      spin.value = 0;
      return;
    }

    if (reduceMotion) {
      scale.value = 1;
      flash.value = 0;
      spin.value = 0;
      return;
    }

    scale.value = withSequence(
      withTiming(1.06, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 150 }),
    );
    // The rays of the reveal turn slowly behind the catch.
    spin.value = withRepeat(
      withTiming(360, { duration: 26_000, easing: Easing.linear }),
      -1,
      false,
    );
    setBurst((current) => current + 1);

    // The big catches flash the whole screen.
    if (tier === 'cotd' || tier === 'legend' || isHeavy) {
      flash.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 520 }),
      );
    }
  }, [visible, reduceMotion, scale, flash, spin, tier, isHeavy, setBurst]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: visible ? 1 : 0,
    transform: [{ scale: scale.value }],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.55 }));

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  if (!visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tap to claim ${nameOf(landed)}`}
      accessibilityHint="Adds the catch to the haul"
      onPress={onContinue}
      style={styles.root}
    >
      {/* The scene dims behind the card. */}
      <View style={styles.dim} pointerEvents="none" />

      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />

      {tier === 'cotd' || tier === 'legend' ? (
        <LightRays color={color} count={18} size={720} opacity={0.34} style={styles.rays} />
      ) : null}

      {isHeavy ? (
        <LightRays color={HEAVY_THEME.rays} count={28} size={860} opacity={0.42} style={styles.rays} />
      ) : null}

      <View style={styles.center} pointerEvents="none">
        <Animated.View style={[styles.card, cardStyle]}>
          <GlassCard
            tint={rarityColor}
            face={
              isHeavy
                ? [`${HEAVY_THEME.deep}ee`, `${HEAVY_THEME.deep}88`]
                : [`${rarityColor}33`, `${rarityColor}0f`]
            }
          >
            <View style={styles.cardContent}>
              <Text style={[styles.category, isHeavy ? { color: HEAVY_THEME.gold } : null]}>
                {categoryOf(landed)}
              </Text>

              <Text style={styles.name}>{nameOf(landed)}</Text>

              {tierName === null ? null : (
                <View
                  style={[
                    styles.ribbon,
                    { backgroundColor: color, borderBottomColor: 'rgba(0,0,0,0.32)' },
                  ]}
                >
                  <Text style={styles.ribbonText}>{tierName}</Text>
                </View>
              )}

              <View style={styles.art}>
                <Glow
                  color={isHeavy ? HEAVY_THEME.gold : rarityColor}
                  size={250}
                  opacity={0.65}
                  style={styles.artGlow}
                />
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

              {isCatch ? (
                <View style={styles.weightRow}>
                  <Text style={styles.weightLabel}>WEIGHT</Text>
                  <Text
                    style={[
                      styles.weight,
                      { color: isHeavy ? HEAVY_THEME.gold : '#fff3cf' },
                    ]}
                  >
                    {formatLbs(lbs)}
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.claimButton,
                  { backgroundColor: isHeavy ? HEAVY_THEME.gold : color },
                ]}
              >
                <Text style={styles.claim}>TAP TO CLAIM</Text>
              </View>

              {captionOf(landed) === undefined ? null : (
                <Text style={styles.joke}>“{captionOf(landed)}”</Text>
              )}
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
    </Pressable>
  );
}

/** The category line of the card. */
function categoryOf(landed: RolledCatch): string {
  switch (landed.kind) {
    case 'critter':
      return 'CRITTER CATCH';
    case 'junk':
      return 'JUNK CATCH';
    case 'heavy':
      return 'HEAVY CATCH';
    case 'fish':
      return 'CATCH';
    default:
      return 'SPECIAL CATCH';
  }
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 9, 21, 0.62)',
  },
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
    maxWidth: 380,
  },
  cardContent: {
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 4,
  },
  category: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  name: {
    color: '#fff8e7',
    fontSize: 24,
    fontFamily: fonts.title,
    textAlign: 'center',
    textShadowColor: 'rgba(30, 16, 4, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ribbon: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 150,
    height: 40,
    borderRadius: 999,
    borderBottomWidth: 4,
    paddingHorizontal: 26,
    marginTop: 10,
  },
  ribbonText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: fonts.title,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(4, 10, 24, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  art: {
    width: 190,
    height: 176,
    marginVertical: 4,
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
  weightRow: {
    alignItems: 'center',
    marginTop: 2,
  },
  weightLabel: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 8,
    letterSpacing: 1.8,
  },
  weight: {
    marginTop: 1,
    fontSize: 28,
    fontFamily: fonts.title,
    textAlign: 'center',
    textShadowColor: 'rgba(30, 16, 4, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  claimButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginTop: 14,
    borderRadius: radius.pill,
    borderBottomWidth: 5,
    borderBottomColor: 'rgba(0,0,0,0.3)',
  },
  claim: {
    color: '#0b1020',
    fontFamily: fonts.title,
    fontSize: 14,
    letterSpacing: 1.8,
  },
  claimPlain: {
    marginTop: 12,
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 14,
    letterSpacing: 1.8,
  },
  joke: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 17,
  },
  splash: {
    top: '35%',
    bottom: '35%',
  },
});
