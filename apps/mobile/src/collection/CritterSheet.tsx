import type { CritterDef } from '@study-app/core';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { critterArt } from '@/packs/critterArt';
import { colors, fonts, radius, rarityGradients } from '@/theme';
import { GameButton, GlassCard, Glow, RarityBadge } from '@/ui';

import { CritterFrame } from './CritterFrame';
import { RarityPips } from './RarityPips';

/**
 * The sheet of a critter.
 *
 * The sheet slides up with a spring: the critter in the middle of a halo of
 * its rarity, its vibe under its name and a stepper that sells the
 * duplicates one by one (or all at once) with the price of the sale shown
 * before it happens.
 */
export interface CritterSheetProps {
  /** The critter that was tapped. */
  critter: CritterDef;
  /** How many copies the player owns. */
  count: number;
  /** How many copies can be sold. */
  duplicates: number;
  /** What one copy is worth. */
  sellValue: number;
  /** Called when the sheet is closed. */
  onClose: () => void;
  /** Called when the player sells `qty` copies. */
  onSell: (qty: number) => void;
  /** `true` when this critter is the companion of the home screen. */
  isCompanion?: boolean;
  /** Makes this critter the companion (or removes it when it already is). */
  onCompanion?: () => void;
}

/** The sheet of a critter. */
export function CritterSheet({
  critter,
  count,
  duplicates,
  sellValue,
  onClose,
  onSell,
  isCompanion = false,
  onCompanion,
}: CritterSheetProps) {
  const [qty, setQty] = useState(1);
  const open = useSharedValue(0);
  const art = critterArt(critter);
  const face = rarityGradients[critter.rarity];

  // The sheet springs up every time it opens.
  useEffect(() => {
    setQty(1);
    open.value = withSpring(1, { damping: 17, stiffness: 170, mass: 0.8 });
  }, [open, critter.id]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(open.value, { duration: 160, easing: Easing.out(Easing.quad) }),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - open.value) * 420 }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + open.value * 0.45,
    transform: [{ scale: 0.8 + open.value * 0.2 }],
  }));

  const total = qty * sellValue;

  return (
    <View style={styles.backdropWrap} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.sheetWrap, sheetStyle]}>
        <View style={styles.handle} />

        <GlassCard
          contentStyle={styles.sheet}
          tint={face[0]}
          face={[`${face[0]}33`, `${face[1]}12`]}
          padded
        >
          <CritterFrame rarity={critter.rarity} style={styles.window}>
            <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
              <Glow color={face[0]} size={210} opacity={0.55} />
            </Animated.View>
            {art === null ? (
              <Text style={styles.emoji}>{critter.emoji}</Text>
            ) : (
              <Image source={art} style={styles.art} resizeMode="contain" />
            )}
          </CritterFrame>

          <View style={styles.rarityRow}>
            <RarityBadge rarity={critter.rarity} size="md" />
            <RarityPips rarity={critter.rarity} size={9} />
          </View>

          <Text style={styles.name}>{critter.name}</Text>
          <Text style={styles.vibe}>{critter.vibe}</Text>

          {count > 0 && onCompanion !== undefined ? (
            <GameButton
              label={isCompanion ? 'COMPANION · TAP TO REMOVE' : 'MAKE COMPANION'}
              variant={isCompanion ? 'secondary' : 'primary'}
              size="md"
              onPress={onCompanion}
            />
          ) : null}

          {duplicates === 0 ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>
                {count === 0
                  ? 'You do not own this critter yet. Open a pack to find it.'
                  : 'You only own one copy, and the last copy is never sold.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.stepper}>
                <StepButton
                  label="−"
                  disabled={qty <= 1}
                  onPress={() => {
                    setQty((current) => Math.max(1, current - 1));
                  }}
                />
                <View style={styles.qtyBox}>
                  <Text style={styles.qtyText}>{qty}</Text>
                  <Text style={styles.qtyHint}>of {duplicates}</Text>
                </View>
                <StepButton
                  label="+"
                  disabled={qty >= duplicates}
                  onPress={() => {
                    setQty((current) => Math.min(duplicates, current + 1));
                  }}
                />
              </View>

              <View style={styles.preview}>
                <Text style={styles.previewLabel}>You get</Text>
                <Text style={styles.previewValue}>+{total}</Text>
                <Text style={styles.previewCoins}>coins</Text>
              </View>

              <GameButton
                label={`SELL ${qty === 1 ? 'THIS COPY' : `${qty} COPIES`}`}
                variant="collection"
                size="lg"
                onPress={() => {
                  onSell(qty);
                }}
              />
            </>
          )}

          <GameButton label="CLOSE" variant="ghost" size="md" onPress={onClose} />
        </GlassCard>
      </Animated.View>
    </View>
  );
}

/** One button of the stepper. */
function StepButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const press = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.12 }],
    opacity: disabled ? 0.35 : 1,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'More' : 'Less'}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 70 });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 110 });
      }}
    >
      <Animated.View style={[styles.step, style]}>
        <Text style={styles.stepText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(4, 5, 9, 0.78)',
  },
  sheetWrap: {
    paddingHorizontal: 12,
    paddingBottom: 26,
  },
  handle: {
    alignSelf: 'center',
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginBottom: 10,
  },
  sheet: {
    gap: 10,
    alignItems: 'stretch',
    paddingVertical: 20,
  },
  window: {
    aspectRatio: 1.7,
  },
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  glow: {
    position: 'absolute',
  },
  art: {
    width: '78%',
    height: '86%',
  },
  emoji: {
    fontSize: 78,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 24,
    textAlign: 'center',
  },
  vibe: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  note: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.tile,
    padding: 14,
  },
  noteText: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 4,
  },
  step: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 24,
    lineHeight: 28,
  },
  qtyBox: {
    minWidth: 84,
    alignItems: 'center',
  },
  qtyText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 30,
  },
  qtyHint: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.tile,
    paddingVertical: 10,
  },
  previewLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  previewValue: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 24,
  },
  previewCoins: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
});
