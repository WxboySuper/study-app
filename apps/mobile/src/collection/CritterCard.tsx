import type { CritterDef } from '@study-app/core';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { critterArt } from '@/packs/critterArt';
import { colors, fonts, radius, rarityGradients, type Gradient } from '@/theme';
import { GlassCard, RarityBadge, Shine } from '@/ui';

/**
 * One critter of the album.
 *
 * The card is a pane of glass in the gradient of the rarity of the critter,
 * so the shelf of the album is a rainbow of rarities. A critter the player
 * owns is drawn in full and counts its copies in a bubble; a critter that is
 * still missing is a dark silhouette with a question mark that shimmers, so
 * the album always shows what is still to be found.
 */
export interface CritterCardProps {
  /** The critter of the catalogue. */
  critter: CritterDef;
  /** How many copies the player owns. */
  count: number;
  /** The position of the card in the grid (for the entrance). */
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

  // The face of the card is the gradient of the rarity, but see-through:
  // the glass of the card still shows the background of the screen.
  const tinted: Gradient = [`${face[0]}4d`, `${face[1]}1a`];

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16).stiffness(140).delay(index * 45)}
      style={styles.wrap}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          owned ? `${critter.name}, ${count} owned` : `${critter.name}, not collected yet`
        }
        onPress={onPress}
        style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      >
        <GlassCard
          style={styles.card}
          contentStyle={styles.cardContent}
          tint={face[0]}
          face={owned ? tinted : undefined}
          borderRadius={radius.tile}
          accessibilityLabel={critter.name}
        >
          <View style={styles.artBox}>
            {art === null ? (
              <Text style={[styles.emoji, !owned && styles.emojiMissing]}>{critter.emoji}</Text>
            ) : (
              <Image
                source={art}
                style={[styles.art, !owned && styles.silhouette]}
                resizeMode="contain"
              />
            )}

            {!owned ? (
              <>
                <View style={styles.shade} pointerEvents="none" />
                <Text style={styles.question}>?</Text>
                <View style={styles.shimmer} pointerEvents="none">
                  <Shine width={54} duration={2000} interval={1500} />
                </View>
              </>
            ) : null}

            {owned && shiny ? <Shine width={130} duration={1300} interval={2400} /> : null}

            {owned ? (
              <View style={styles.countBubble}>
                <Text style={styles.countText}>x{count}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.meta}>
            <RarityBadge rarity={critter.rarity} size="sm" />
            <Text style={[styles.name, !owned && styles.nameMissing]} numberOfLines={2}>
              {critter.name}
            </Text>
          </View>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '31.5%',
  },
  press: {
    flex: 1,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  card: {
    overflow: 'hidden',
  },
  cardContent: {
    padding: 7,
    gap: 6,
  },
  artBox: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radius.tile - 6,
  },
  art: {
    width: '100%',
    height: '100%',
  },
  silhouette: {
    opacity: 0.9,
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 7, 12, 0.88)',
  },
  question: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.42)',
    fontFamily: fonts.title,
    fontSize: 46,
    lineHeight: 52,
    textAlignVertical: 'center',
  },
  shimmer: {
    ...StyleSheet.absoluteFill,
    opacity: 0.4,
  },
  emoji: {
    fontSize: 44,
    textAlign: 'center',
  },
  emojiMissing: {
    opacity: 0.35,
  },
  countBubble: {
    position: 'absolute',
    right: 4,
    top: 4,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'rgba(8, 10, 16, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 12,
  },
  meta: {
    alignItems: 'center',
    gap: 4,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
  nameMissing: {
    color: colors.textDim,
  },
});
