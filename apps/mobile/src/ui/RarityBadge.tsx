import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { CritterRarity } from '@study-app/core';

import { fonts, gradientDirection, radius, rarityGradients, rarityLabels } from '@/theme';

/**
 * The badge of a rarity.
 *
 * The color of the rarity is the color of the whole reveal: the badge, the
 * glow behind the critter and the rays of the opening.
 */
export interface RarityBadgeProps {
  /** The rarity of the critter. */
  rarity: CritterRarity;
  /** The size of the badge. */
  size?: 'sm' | 'md' | 'lg';
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
  /** `false` to show the badge without the label. */
  showLabel?: boolean;
}

const SIZES = {
  sm: { font: 10, padding: 10 },
  md: { font: 13, padding: 14 },
  lg: { font: 18, padding: 20 },
} as const;

/** The badge of a rarity. */
export function RarityBadge({ rarity, size = 'md', style, showLabel = true }: RarityBadgeProps) {
  const metrics = SIZES[size];

  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={rarityGradients[rarity]}
        start={gradientDirection.start}
        end={gradientDirection.end}
        style={[
          styles.badge,
          {
            paddingHorizontal: metrics.padding,
            paddingVertical: metrics.padding / 2.4,
            borderRadius: radius.chip,
          },
        ]}
      >
        <Text style={[styles.label, { fontSize: metrics.font }]}>
          {showLabel ? rarityLabels[rarity] : rarityLabels[rarity].slice(0, 3).toUpperCase()}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
  },
  badge: {
    overflow: 'hidden',
  },
  label: {
    color: '#10121a',
    fontFamily: fonts.title,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
