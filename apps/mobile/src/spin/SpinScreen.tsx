import {
  SPIN_SEGMENTS,
  localDayKey,
  spinSegmentIndex,
  type WalletSnapshot,
} from '@study-app/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { openLocalDatabase } from '@/db/local';
import { readDailySpin, spinDailyWheelLocal } from '@/db/packs';
import { readWallet } from '@/db/wallet';
import { playSfx, prepareSfx } from '@/modes/fishing/sfx';
import { colors, font, radius, spinSegmentColors } from '@/theme';

import { SpinWheel } from './SpinWheel';

/**
 * The daily wheel.
 *
 * The wheel can be spun once per local day. The reward is decided by the
 * local store (the same pure code the server would run), and the wheel then
 * spins down to the segment that was won.
 */

const SPIN_DURATION_MS = 4200;

export function SpinScreen() {
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [wonToday, setWonToday] = useState<number | null>(null);
  const [alreadySpun, setAlreadySpun] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rotation = useSharedValue(0);
  const cardScale = useSharedValue(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const db = await openLocalDatabase();
      const today = localDayKey(new Date());
      setWallet(await readWallet(db, today));
      const spun = await readDailySpin(db, today);
      if (spun !== null) {
        setWonToday(spun);
        setAlreadySpun(true);
      }
    } catch {
      // The wheel stays empty when the local store cannot be read.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    void prepareSfx();
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const onSpin = useCallback(async () => {
    if (spinning || alreadySpun) {
      return;
    }

    setSpinning(true);
    setMessage(null);

    try {
      const db = await openLocalDatabase();
      const result = await spinDailyWheelLocal(db, localDayKey(new Date()));

      if (!result.ok) {
        setMessage(result.message);
        setSpinning(false);
        return;
      }

      setWallet(result.wallet);

      // The wheel spins down to the segment that was won.
      const index = Math.max(0, spinSegmentIndex(result.reward));
      const jitter = (Math.random() - 0.5) * 24;
      const target = 5 * 360 - index * (360 / SPIN_SEGMENTS.length) + jitter;
      rotation.value = withTiming(target, {
        duration: SPIN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });

      const timer = setTimeout(() => {
        timerRef.current = null;
        setReward(result.reward);
        setWonToday(result.reward);
        setSpinning(false);
        setAlreadySpun(true);
        cardScale.value = withSequence(
          withTiming(1.12, { duration: 160, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 11, stiffness: 170 }),
        );
        playSfx('coin');
      }, SPIN_DURATION_MS + 120);
      timerRef.current = timer;
    } catch {
      setMessage('The wheel could not be spun.');
      setSpinning(false);
    }
  }, [spinning, alreadySpun, rotation, cardScale]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: reward === null ? 0 : 1,
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>DAILY SPIN</Text>
        <Text style={styles.subtitle}>One spin a day. The tokens are a bonus, not a grind.</Text>

        <View style={styles.wallet}>
          <Text style={styles.walletValue}>🪙 {wallet?.balance ?? 0}</Text>
          <Text style={styles.walletLabel}>tokens</Text>
        </View>

        <View style={styles.wheelBox}>
          <SpinWheel rotation={rotation} />
        </View>

        {message === null ? null : <Text style={styles.message}>{message}</Text>}

        <Pressable
          accessibilityRole="button"
          disabled={spinning || alreadySpun}
          onPress={() => {
            void onSpin();
          }}
          style={({ pressed }) => [
            styles.spinButton,
            alreadySpun ? styles.spinButtonOff : null,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.spinButtonText}>
            {spinning ? 'SPINNING…' : alreadySpun ? 'COME BACK TOMORROW' : 'SPIN THE WHEEL'}
          </Text>
        </Pressable>

        {wonToday === null ? null : (
          <Text style={styles.wonToday}>Today the wheel paid you 🪙 {wonToday} tokens</Text>
        )}

        <View style={styles.legend}>
          {SPIN_SEGMENTS.map((segment, index) => (
            <View key={segment.reward} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: segmentColorOf(index) }]} />
              <Text style={styles.legendText}>{segment.reward} tokens</Text>
              <Text style={styles.legendWeight}>{segment.weight}%</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {reward === null ? null : (
        <View style={styles.backdrop}>
          <Animated.View style={[styles.rewardCard, cardStyle]}>
            <Text style={styles.rewardTitle}>YOU WON</Text>
            <Text style={styles.rewardValue}>+{reward}</Text>
            <Text style={styles.rewardLabel}>tokens</Text>
            <Text style={styles.rewardHint}>Come back tomorrow for another spin.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setReward(null);
              }}
              style={({ pressed }) => [styles.continue, pressed && styles.pressed]}
            >
              <Text style={styles.continueText}>Nice!</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

/** The color of the segment with an index. */
function segmentColorOf(index: number): string {
  return spinSegmentColors[index % spinSegmentColors.length] ?? colors.primary;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 18,
    paddingBottom: 48,
    gap: 14,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: font.heavy,
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: font.medium,
    textAlign: 'center',
  },
  wallet: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  walletValue: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: font.heavy,
  },
  walletLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: font.bold,
    textTransform: 'uppercase',
  },
  wheelBox: {
    marginVertical: 10,
  },
  message: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: font.bold,
  },
  spinButton: {
    width: '100%',
    borderRadius: radius.button,
    backgroundColor: colors.wheel,
    borderBottomWidth: 7,
    borderBottomColor: colors.wheelDark,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinButtonOff: {
    backgroundColor: colors.surfaceLight,
    borderBottomColor: colors.backgroundDeep,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 2 }],
  },
  spinButtonText: {
    color: '#3b2400',
    fontSize: 20,
    fontWeight: font.heavy,
    letterSpacing: 1,
  },
  wonToday: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: font.bold,
  },
  legend: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: font.bold,
  },
  legendWeight: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: font.bold,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 3, 16, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  rewardCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 4,
    borderColor: colors.gold,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 4,
  },
  rewardTitle: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: font.heavy,
    letterSpacing: 3,
  },
  rewardValue: {
    color: colors.text,
    fontSize: 56,
    fontWeight: font.heavy,
  },
  rewardLabel: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: font.bold,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  rewardHint: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: font.medium,
    marginTop: 6,
  },
  continue: {
    marginTop: 16,
    width: '100%',
    borderRadius: radius.button,
    backgroundColor: colors.wheel,
    borderBottomWidth: 6,
    borderBottomColor: colors.wheelDark,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    color: '#3b2400',
    fontSize: 18,
    fontWeight: font.heavy,
  },
});
