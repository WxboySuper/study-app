import type { CritterRarity } from '@study-app/core';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gradientDirection, rarityColors, rarityGradients } from '@/theme';

/**
 * The art window of a critter card.
 *
 * Every critter lives on a sheet of graph paper tinted with the color of its
 * rarity, like a figure drawn in a lab notebook. The card of the album and
 * the sheet of a critter share this window, so the critter looks the same
 * wherever it shows up.
 */
export interface CritterFrameProps {
  /** The rarity that tints the paper. */
  rarity: CritterRarity;
  /** `true` for the dimmed window of a critter that is still missing. */
  missing?: boolean;
  /** The radius of the window. */
  borderRadius?: number;
  /** The style of the window. */
  style?: StyleProp<ViewStyle>;
  /** The art (and the chips) drawn on the paper. */
  children?: ReactNode;
}

/** How many grid lines the paper has in each direction. */
const GRID_LINES = 7;

/** The art window of a critter card. */
export function CritterFrame({
  rarity,
  missing = false,
  borderRadius = 14,
  style,
  children,
}: CritterFrameProps) {
  const face = rarityGradients[rarity];
  const line = missing ? 'rgba(255,255,255,0.05)' : `${rarityColors[rarity]}26`;
  const steps = Array.from({ length: GRID_LINES }, (_, i) => `${((i + 1) / (GRID_LINES + 1)) * 100}%` as const);

  return (
    <View style={[styles.window, { borderRadius }, style]}>
      <LinearGradient
        colors={missing ? ['#10121a', '#0a0b10'] : [`${face[0]}40`, `${face[1]}14`]}
        start={gradientDirection.start}
        end={gradientDirection.end}
        style={StyleSheet.absoluteFill}
      />
      {steps.map((at) => (
        <View key={`h${at}`} style={[styles.hLine, { top: at, backgroundColor: line }]} />
      ))}
      {steps.map((at) => (
        <View key={`v${at}`} style={[styles.vLine, { left: at, backgroundColor: line }]} />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  vLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
});
