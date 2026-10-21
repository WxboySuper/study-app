import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, gradientDirection, radius, shadow, type Gradient } from '@/theme';

/**
 * A glassy card.
 *
 * A gradient border, a 1px inset highlight along the top edge and a soft
 * large drop shadow: the card looks like a pane of dark glass that the
 * content behind it lights up.
 *
 * The card has two skins: the outside (`style`) and the content inside
 * (`contentStyle`). The padding, the gap and the direction of the content
 * belong to the content, so they never fight with the frame of the card.
 */
export interface GlassCardProps {
  /** The content of the card. */
  children?: ReactNode;
  /** The style of the card (the outside). */
  style?: StyleProp<ViewStyle>;
  /** The style of the content of the card (the inside). */
  contentStyle?: StyleProp<ViewStyle>;
  /** The color of the border of the card. */
  tint?: string;
  /** The gradient of the face of the card (defaults to the glass fill). */
  face?: Gradient;
  /** The radius of the corners. */
  borderRadius?: number;
  /** The padding inside the card. */
  padded?: boolean;
  /** `false` to draw the card without the drop shadow. */
  elevated?: boolean;
  /** The label the screen reader reads. */
  accessibilityLabel?: string;
}

/** A glassy card of the game. */
export function GlassCard({
  children,
  style,
  contentStyle,
  tint = '#ffffff',
  face,
  borderRadius = radius.card,
  padded = false,
  elevated = true,
  accessibilityLabel,
}: GlassCardProps) {
  const innerRadius = Math.max(0, borderRadius - 1);

  return (
    <View
      style={[styles.wrapper, { borderRadius }, elevated ? shadow.card : null, style]}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
    >
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
              borderRadius: innerRadius,
              padding: padded ? 16 : 0,
            },
            contentStyle,
          ]}
        >
          {face === undefined ? null : (
            <LinearGradient
              colors={face}
              start={gradientDirection.start}
              end={gradientDirection.end}
              style={[StyleSheet.absoluteFill, { borderRadius: innerRadius }]}
              pointerEvents="none"
            />
          )}
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
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    overflow: 'hidden',
    backgroundColor: 'rgba(22, 23, 29, 0.86)',
  },
  highlight: {
    top: 0,
    height: '46%',
  },
});
