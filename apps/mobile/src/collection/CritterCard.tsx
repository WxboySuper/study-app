import type { CritterDef } from '@study-app/core';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { critterArt } from '@/packs/critterArt';
import { colors, fonts, radius, rarityColors, rarityGradients, rarityLabels } from '@/theme';
import { GlassCard, Shine } from '@/ui';

import { CritterFrame } from './CritterFrame';
import { RarityPips } from './RarityPips';

/**
 * One critter of the album, drawn as a study card.
 *
 * Top row: the catalogue number and the rarity as five diamonds. Then the art
 * window (a sheet of graph paper tinted with the rarity), the name and a
 * line of vibe. A critter the player owns is drawn in full and counts its
 * copies in a chip; a missing one is a dark silhouette with "???" so the
 * album always shows what is left to find.
 */
export interface CritterCardProps {
  /** The critter of the catalogue. */
  critter: CritterDef;
  /** How many copies the player owns. */
  count: number;
  /** The position of the card in the grid (also its catalogue number). */
  index: number;
  /** Called when the card is tapped. */
  onPress: () => void;
}

/** One critter of the album. */
export function CritterCard({ critter, count, index, onPress }: CritterCardProps) {
  const owned = count > 0;
  const art = critterArt(critter);
  const face = rarityGradients[critter.rarity];
  const shiny = critter.rarity === 'legendary' || critter.rarity === 'epic';
  const number = String(index + 1).padStart(2, '0');

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16).stiffness(140).delay(index * 45)}
      style={styles.wrap}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          owned
            ? `${critter.name}, ${rarityLabels[critter.rarity]}, ${count} owned`
            : `Number ${number}, not collected yet`
        }
        onPress={onPress}
        style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      >
        <GlassCard
          style={styles.card}
          contentStyle={styles.cardContent}
          tint={owned ? face[0] : '#ffffff'}
          borderRadius={radius.card}
        >
          <View style={styles.top}>
            <Text style={styles.number}>No. {number}</Text>
            <RarityPips rarity={critter.rarity} />
          </View>

          <CritterFrame rarity={critter.rarity} missing={!owned}>
            {art === null ? (
              <Text style={[styles.emoji, !owned && styles.dim]}>{critter.emoji}</Text>
            ) : (
              <Image
                source={art}
                style={[styles.art, !owned && styles.dim]}
                resizeMode="contain"
              />
            )}
            {!owned ? (
              <>
                <View style={styles.shade} pointerEvents="none" />
                <Text style={styles.question}>?</Text>
              </>
            ) : null}
            {owned && shiny ? <Shine width={130} duration={1300} interval={2600} /> : null}
            {owned ? (
              <View style={styles.countChip}>
                <Text style={styles.countText}>x{count}</Text>
              </View>
            ) : null}
          </CritterFrame>

          <View style={styles.meta}>
            <Text style={[styles.name, !owned && styles.nameMissing]} numberOfLines={1}>
              {owned ? critter.name : '???'}
            </Text>
            <Text
              style={[styles.vibe, { color: owned ? rarityColors[critter.rarity] : colors.textDim }]}
              numberOfLines={1}
            >
              {owned ? rarityLabels[critter.rarity] : 'Not found yet'}
            </Text>
          </View>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '48.4%',
  },
  press: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  card: {
    overflow: 'hidden',
  },
  cardContent: {
    padding: 10,
    gap: 8,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  number: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  art: {
    width: '88%',
    height: '88%',
  },
  dim: {
    opacity: 0.9,
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 7, 12, 0.86)',
  },
  question: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.34)',
    fontFamily: fonts.title,
    fontSize: 54,
    lineHeight: 60,
    textAlignVertical: 'center',
  },
  emoji: {
    fontSize: 52,
    textAlign: 'center',
  },
  countChip: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    minWidth: 28,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(8, 10, 16, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 12,
  },
  meta: {
    gap: 1,
    paddingHorizontal: 2,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 15,
  },
  nameMissing: {
    color: colors.textDim,
  },
  vibe: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
