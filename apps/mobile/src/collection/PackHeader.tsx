import type { PackDef } from '@study-app/core';
import { StyleSheet, Text, View } from 'react-native';

import { PackPouch } from '@/packs/PackPouch';
import { packTheme } from '@/packs/packThemes';
import { colors, fonts, radius } from '@/theme';
import { GlassCard, ProgressRing } from '@/ui';

/**
 * The header of a page of the album.
 *
 * The pouch of the pack, the ring that shows how much of it is collected
 * and the number of the critters that are still missing.
 */
export interface PackHeaderProps {
  /** The pack of the page. */
  pack: PackDef;
  /** How many critters of the pack are collected. */
  owned: number;
  /** How many critters the pack holds. */
  total: number;
}

/** The header of a page of the album. */
export function PackHeader({ pack, owned, total }: PackHeaderProps) {
  const theme = packTheme(pack.id);
  const progress = total === 0 ? 0 : owned / total;

  return (
    <GlassCard contentStyle={styles.card} tint={theme.glow}>
      <View style={styles.art}>
        <PackPouch gradient={theme.gradient} crimp={theme.crimp} width={62} height={74} />
      </View>

      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={2}>
          {pack.name}
        </Text>
        <Text style={styles.hint}>
          {total - owned === 0 ? 'Complete! Every critter is yours.' : `${total - owned} still hiding`}
        </Text>
      </View>

      <ProgressRing progress={progress} size={62} stroke={6} color={theme.glow}>
        <View style={styles.ringCenter}>
          <Text style={styles.ringValue}>{owned}</Text>
          <Text style={styles.ringTotal}>/{total}</Text>
        </View>
      </ProgressRing>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.card,
  },
  art: {
    width: 62,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 17,
    lineHeight: 21,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  ringCenter: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  ringValue: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 19,
  },
  ringTotal: {
    color: colors.textDim,
    fontFamily: fonts.titleSemi,
    fontSize: 12,
  },
});
