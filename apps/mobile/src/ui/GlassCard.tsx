import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, gradientDirection, radius, shadow } from '@/theme';

/**
 * A glassy card.
 *
 * A gradient border, a 1px inset highlight along the top edge and a soft
 * large drop shadow: the card looks like a pane of dark glass that the
 * content behind it lights up.
 */
export interface GlassCardProps {
  /** The content of the card. */
  children?: ReactNode;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
  /** The color of the border of the card. */
  tint?: string;
  /** The radius of the corners. */
  borderRadius?: number;
  /** The padding inside the card. */
  padded?: boolean;
  /** `false` to draw the card without the drop shadow. */
  elevated?: boolean;
}

/** A glassy card of the game. */
export function GlassCard({
  children,
  style,
  tint = '#ffffff',
  borderRadius = radius.card,
  padded = false,
  elevated = true,
}: GlassCardProps) {
  return (
    <View style={[styles.wrapper, { borderRadius }, elevated ? shadow.card : null, style]}>
      <LinearGradient
        colors={[`${tint}38`, `${tint}0d`]}
        start={gradientDirection.start}
        end={gradientDirection.end}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      <View style={[styles.frame, { borderRadius, padding: 1 }]}>
        <View
          style={[
            styles.inner,
            {
              borderRadius: Math.max(0, borderRadius - 1),
              padding: padded ? 16 : 0,
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0)']}
            style={[StyleSheet.absoluteFill, styles.highlight]}
            pointerEvents="none"
          />
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.backgroundDeep,
  },
  frame: {
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(22, 23, 29, 0.86)',
  },
  highlight: {
    top: 0,
    height: '46%',
  },
});
