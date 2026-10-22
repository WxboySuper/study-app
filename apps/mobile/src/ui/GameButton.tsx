import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { hapticImpact } from '@/haptics';
import { colors, fonts, gradientDirection, gradients, radius, shadow, type Gradient } from '@/theme';

/**
 * The chunky 3D button of the game.
 *
 * The face of the button is a gradient that sits on a darker base: when the
 * player presses it, the face sinks into the base with a spring and the
 * phone buzzes a little. It is the button of a game, not the button of a
 * form.
 */

/** The kinds of buttons of the game. */
export type GameButtonVariant =
  | 'primary'
  | 'secondary'
  | 'shop'
  | 'wheel'
  | 'collection'
  | 'danger'
  | 'ghost';

/** The sizes of the buttons. */
export type GameButtonSize = 'sm' | 'md' | 'lg';

interface VariantSpec {
  face: Gradient;
  base: string;
  text: string;
}

const VARIANTS: Record<GameButtonVariant, VariantSpec> = {
  primary: { face: gradients.primary, base: colors.primaryDark, text: '#ffffff' },
  secondary: { face: gradients.ticket, base: colors.ticketDark, text: '#062b38' },
  shop: { face: gradients.shop, base: colors.shopDark, text: '#ffffff' },
  wheel: { face: gradients.wheel, base: colors.wheelDark, text: '#3b2400' },
  collection: { face: gradients.collection, base: colors.collectionDark, text: '#04231a' },
  danger: { face: gradients.danger, base: colors.dangerDark, text: '#ffffff' },
  ghost: { face: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)'], base: 'rgba(0,0,0,0.5)', text: colors.text },
};

const SIZES: Record<GameButtonSize, { height: number; font: number; padding: number }> = {
  sm: { height: 42, font: 15, padding: 16 },
  md: { height: 54, font: 18, padding: 22 },
  lg: { height: 66, font: 23, padding: 30 },
};

/** How deep the face sinks into the base when the button is pressed. */
const BASE_DEPTH = 6;

/** The props of the button. */
export interface GameButtonProps {
  /** The label of the button. */
  label: string;
  /** Called when the button is pressed. */
  onPress: () => void;
  /** The kind of button. */
  variant?: GameButtonVariant;
  /** The size of the button. */
  size?: GameButtonSize;
  /** `true` when the button cannot be pressed. */
  disabled?: boolean;
  /** A little icon in front of the label. */
  icon?: ReactNode;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
  /** The style of the label. */
  textStyle?: StyleProp<TextStyle>;
  /** The label the screen reader reads. */
  accessibilityLabel?: string;
  /** What the screen reader announces about the action. */
  accessibilityHint?: string;
  /** `false` to keep the phone quiet. */
  haptic?: boolean;
  /** `true` to make the button breathe (the play button of the home screen). */
  pulse?: boolean;
  /**
   * `true` to dim the button without switching it off: it still answers the
   * press (the shop tells the player why the pack cannot be opened).
   */
  muted?: boolean;
}

/** A chunky 3D button of the game. */
export function GameButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  haptic = true,
  pulse = false,
  muted = false,
}: GameButtonProps) {
  const spec = VARIANTS[variant];
  const metrics = SIZES[size];
  const pressed = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    if (disabled) {
      pressed.value = withTiming(0, { duration: 120 });
    }
  }, [disabled, pressed]);

  useEffect(() => {
    if (!pulse) {
      cancelAnimation(breath);
      breath.value = 0;
      return undefined;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(breath);
    };
  }, [breath, pulse]);

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * BASE_DEPTH }, { scale: 1 - pressed.value * 0.02 }],
  }));

  const breathStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + breath.value * 0.32,
    transform: [{ scale: 0.92 + breath.value * 0.16 }],
  }));

  const onPressIn = () => {
    if (disabled) {
      return;
    }
    if (haptic) {
      hapticImpact('light');
    }
    pressed.value = withSpring(1, { damping: 18, stiffness: 320, mass: 0.6 });
  };

  const onPressOut = () => {
    pressed.value = withSpring(0, { damping: 14, stiffness: 240, mass: 0.5 });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.root, style]}
    >
      {pulse ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.breath, { backgroundColor: spec.face[0] }, breathStyle]}
        />
      ) : null}

      <View
        style={[
          styles.base,
          {
            borderRadius: radius.button,
            backgroundColor: spec.base,
            paddingBottom: BASE_DEPTH,
            opacity: disabled ? 0.45 : muted ? 0.62 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.face,
            { borderRadius: radius.button, minHeight: metrics.height },
            faceStyle,
          ]}
        >
          <LinearGradient
            colors={spec.face}
            start={gradientDirection.start}
            end={gradientDirection.end}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.highlight} pointerEvents="none" />
          <View style={[styles.content, { paddingHorizontal: metrics.padding }]}>
            {icon}
            <Text
              style={[
                styles.label,
                {
                  color: spec.text,
                  fontSize: metrics.font,
                },
                textStyle,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
  },
  breath: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: -4,
    bottom: -10,
    borderRadius: radius.button + 6,
  },
  base: {
    ...shadow.soft,
  },
  face: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  highlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontFamily: fonts.title,
    letterSpacing: 1,
  },
});
