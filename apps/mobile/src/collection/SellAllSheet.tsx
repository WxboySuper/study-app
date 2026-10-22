import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type HostInstance } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, radius } from '@/theme';
import { GameButton, GlassCard } from '@/ui';

/**
 * The sheet that sells every duplicate at once.
 *
 * It shows what the sale is worth before it happens, so the player never
 * sells a critter by accident.
 */
export interface SellAllSheetProps {
  /** How many copies are sold. */
  copies: number;
  /** How many tokens the sale is worth. */
  tokens: number;
  /** Called when the sheet is closed. */
  onClose: () => void;
  /** Called when the player confirms; the point is where the coins fly from. */
  onConfirm: (origin: { x: number; y: number }) => void;
}

/** The sheet that sells every duplicate at once. */
export function SellAllSheet({ copies, tokens, onClose, onConfirm }: SellAllSheetProps) {
  const open = useSharedValue(0);

  useEffect(() => {
    open.value = withSpring(1, { damping: 17, stiffness: 170, mass: 0.8 });
  }, [open]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(open.value, { duration: 160, easing: Easing.out(Easing.quad) }),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - open.value) * 420 }, { scale: 0.94 + open.value * 0.06 }],
  }));

  return (
    <View style={styles.backdropWrap} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.sheetWrap, sheetStyle]}>
        <GlassCard contentStyle={styles.sheet} tint={colors.collection} padded>
          <Text style={styles.title}>Sell every duplicate?</Text>
          <Text style={styles.body}>
            {copies} duplicate{copies === 1 ? '' : 's'} go back to the shop. You keep one of every
            critter you own.
          </Text>

          <View style={styles.total}>
            <Text style={styles.totalLabel}>You get</Text>
            <Text style={styles.totalValue}>+{tokens}</Text>
            <Text style={styles.totalCoins}>coins</Text>
          </View>

          <ConfirmButton tokens={tokens} onConfirm={onConfirm} />
          <GameButton label="KEEP THEM" variant="ghost" size="md" onPress={onClose} />
        </GlassCard>
      </Animated.View>
    </View>
  );
}

/**
 * The button that starts the sale.
 *
 * It measures itself, so the coins know where they have to fly from.
 */
function ConfirmButton({
  tokens,
  onConfirm,
}: {
  tokens: number;
  onConfirm: (origin: { x: number; y: number }) => void;
}) {
  const anchor = useRef<HostInstance>(null);

  return (
    <View ref={anchor} collapsable={false}>
      <GameButton
        label={`SELL THEM ALL (+${tokens})`}
        variant="collection"
        size="lg"
        onPress={() => {
          const node = anchor.current;
          if (node === null) {
            onConfirm({ x: 0, y: 0 });
            return;
          }
          node.measureInWindow((x, y, width, height) => {
            onConfirm({ x: x + width / 2, y: y + height / 2 });
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  backdrop: {
    backgroundColor: 'rgba(4, 5, 9, 0.8)',
  },
  sheetWrap: {
    width: '100%',
    maxWidth: 380,
  },
  sheet: {
    gap: 12,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.tile,
    paddingVertical: 12,
  },
  totalLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  totalValue: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 30,
  },
  totalCoins: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
});
