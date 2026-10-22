import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Coin } from '@/ui';

/**
 * The coins that fly to the wallet.
 *
 * When the player sells something, the coins of the sale leave the button
 * and arc up to the counter of the wallet: the reward is seen, not only
 * read.
 */
export interface CoinFlightProps {
  /** Where the coins start (the centre of the button). */
  from: { x: number; y: number };
  /** Where the coins land (the centre of the counter). */
  to: { x: number; y: number };
  /** How many coins fly. */
  count: number;
  /** Called when the last coin landed. */
  onDone: () => void;
}

/** The coins that fly to the wallet. */
export function CoinFlight({ from, to, count, onDone }: CoinFlightProps) {
  const coins = Array.from({ length: Math.max(1, Math.min(14, count)) }, (_, index) => index);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {coins.map((index) => (
        <FlyingCoin
          key={index}
          index={index}
          last={index === coins.length - 1}
          from={from}
          to={to}
          onDone={onDone}
        />
      ))}
    </View>
  );
}

/** One coin of the flight. */
function FlyingCoin({
  index,
  last,
  from,
  to,
  onDone,
}: {
  index: number;
  last: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  onDone: () => void;
}) {
  const progress = useSharedValue(0);
  const duration = 820 + index * 45;

  useEffect(() => {
    progress.value = withDelay(
      index * 55,
      withTiming(
        1,
        { duration, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished && last) {
            runOnJS(onDone)();
          }
        },
      ),
    );
  }, [duration, index, last, onDone, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const x = from.x + (to.x - from.x) * p;
    const y = from.y + (to.y - from.y) * p - Math.sin(Math.PI * p) * (70 + index * 6);
    return {
      opacity: p < 0.82 ? 1 : Math.max(0, 1 - (p - 0.82) / 0.18),
      transform: [
        { translateX: x - 12 },
        { translateY: y - 12 },
        { rotate: `${p * 540 + index * 40}deg` },
        { scale: 1 - p * 0.35 },
      ],
    };
  });

  return (
    <Animated.View style={[styles.coin, style]}>
      <Coin size={24} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  coin: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
