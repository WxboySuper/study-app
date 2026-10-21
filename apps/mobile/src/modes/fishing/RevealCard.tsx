import type { CatchTier } from '@study-app/core';
import { CATCH_TIERS } from '@study-app/core';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tierColor } from './assets';
import { Sprite } from './Sprite';

/**
 * The reveal card of the fishing mode (docs/design/fishing.md §5).
 *
 * The catch springs out of the water onto a card with its rarity ribbon, its
 * weight (counting up) and, for the silly catches, a joke.
 */

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface RevealCardProps {
  /** `true` while the card is on the screen. */
  visible: boolean;
  /** The name of the catch. */
  name: string;
  /** The tier of the catch. */
  tier: CatchTier;
  /** The weight of the catch, in lbs. */
  lbs: number;
  /** The asset id of the sprite. */
  assetId: string;
  /** The joke of a silly catch. */
  joke?: string | undefined;
  /** `true` when the catch was caught for the first time. */
  isNew: boolean;
  /** Called when the player dismisses the card. */
  onContinue: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function RevealCard({
  visible,
  name,
  tier,
  lbs,
  assetId,
  joke,
  isNew,
  onContinue,
  reduceMotion,
}: RevealCardProps) {
  const scale = useSharedValue(0.6);
  const weight = useSharedValue(0);
  const flash = useSharedValue(0);

  const tierName = CATCH_TIERS.find((entry) => entry.id === tier)?.name ?? tier;
  const color = tierColor(tier);

  useEffect(() => {
    if (!visible) {
      return;
    }

    weight.value = 0;

    if (reduceMotion) {
      scale.value = 1;
      weight.value = lbs;
      flash.value = 0;
      return;
    }

    scale.value = withSequence(
      withTiming(1.05, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 150 }),
    );
    weight.value = withTiming(lbs, { duration: 900, easing: Easing.out(Easing.cubic) });

    // The big catches flash the whole screen.
    if (tier === 'cotd' || tier === 'legend') {
      flash.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 520 }),
      );
    }
  }, [visible, reduceMotion, scale, weight, flash, lbs, tier]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: visible ? 1 : 0,
    transform: [{ scale: scale.value }],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.55 }));

  const weightProps = useAnimatedProps(() => ({
    text: `${Math.round(weight.value).toLocaleString('en-US')} lbs`,
    defaultValue: `${Math.round(weight.value).toLocaleString('en-US')} lbs`,
  }));

  if (!visible) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />

      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={[styles.ribbon, { backgroundColor: color }]}>
            <Text style={styles.ribbonText}>{tierName}</Text>
          </View>

          <View style={styles.art}>
            <Sprite assetId={assetId} size={140} />
            {isNew ? (
              <View style={styles.newStamp}>
                <Text style={styles.newStampText}>NEW!</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.name}>{name}</Text>

          <AnimatedTextInput
            editable={false}
            animatedProps={weightProps}
            underlineColorAndroid="transparent"
            style={[styles.weight, { color }]}
            accessibilityLabel={`${name} weighs ${Math.round(lbs).toLocaleString('en-US')} lbs`}
          />

          {joke === undefined ? null : <Text style={styles.joke}>“{joke}”</Text>}
          <Pressable
            accessibilityRole="button"
            onPress={onContinue}
            style={({ pressed }) => [styles.continue, pressed && styles.continuePressed]}
          >
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flash: {
    backgroundColor: '#ffffff',
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '84%',
    borderRadius: 20,
    backgroundColor: '#fdf6e3',
    borderWidth: 4,
    borderColor: '#1d3557',
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  ribbon: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  ribbonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  art: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newStamp: {
    position: 'absolute',
    top: 0,
    right: -4,
    backgroundColor: '#ef476f',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: [{ rotate: '12deg' }],
  },
  newStampText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  name: {
    marginTop: 6,
    color: '#1d3557',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  weight: {
    marginTop: 2,
    fontSize: 26,
    fontWeight: '900',
    padding: 0,
    minWidth: 140,
    textAlign: 'center',
  },
  joke: {
    marginTop: 8,
    color: '#6f4e37',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  continue: {
    marginTop: 16,
    backgroundColor: '#1d3557',
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  continuePressed: {
    opacity: 0.8,
  },
  continueText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
});
