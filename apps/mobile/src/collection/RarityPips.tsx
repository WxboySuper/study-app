import type { CritterRarity } from '@study-app/core';
import { StyleSheet, View } from 'react-native';

import { rarityColors } from '@/theme';

/**
 * The rarity of a critter as a row of five small diamonds.
 *
 * Common lights one, legendary lights all five. The row is quieter than a
 * text badge, so a whole grid of cards stays easy to scan.
 */
export interface RarityPipsProps {
  /** The rarity of the critter. */
  rarity: CritterRarity;
  /** The size of one diamond. */
  size?: number;
}

/** How many diamonds every rarity lights. */
export const RARITY_LEVEL: Record<CritterRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

/** The rarity of a critter as five diamonds. */
export function RarityPips({ rarity, size = 7 }: RarityPipsProps) {
  const color = rarityColors[rarity];
  const level = RARITY_LEVEL[rarity];

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no">
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 2,
            transform: [{ rotate: '45deg' }],
            backgroundColor: i < level ? color : 'transparent',
            borderWidth: 1,
            borderColor: i < level ? color : 'rgba(255,255,255,0.18)',
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
