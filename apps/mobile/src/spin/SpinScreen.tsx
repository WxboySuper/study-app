import {
  SPIN_SEGMENTS,
  canSpin,
  localDayKey,
  spinSegmentIndex,
  type WalletSnapshot,
} from '@study-app/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { openLocalStore } from '@/db/local';
import { playSfx, prepareSfx } from '@/modes/fishing/sfx';
import { colors, fonts, radius, spinSegmentColors } from '@/theme';
import { GameBackground, GameButton, GlassCard, ScreenHeader, TokenCounter } from '@/ui';

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
      const store = await openLocalStore();
      const today = localDayKey(new Date());
      setWallet(await store.readWallet(today));

      // The wheel can be spun once per local day.
      const last = await store.readLastSpin();
      setAlreadySpun(!canSpin(last?.localDate ?? null, today));
      setWonToday(last !== null && last.localDate === today ? last.reward : null);
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
      const store = await openLocalStore();
      const result = await store.spinDailyWheel(localDayKey(new Date()));

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
    <GameBackground variant="spin">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="DAILY SPIN"
            subtitle="One spin a day. The tokens are a bonus, not a grind."
            right={
              <GlassCard borderRadius={radius.chip} elevated={false} style={styles.headerChip}>
                <TokenCounter value={wallet?.balance ?? 0} size={18} />
              </GlassCard>
            }
          />

          <View style={styles.wheelBox}>
            <SpinWheel rotation={rotation} />
          </View>

          {message === null ? null : <Text style={styles.message}>{message}</Text>}

          <GameButton
            label={spinning ? 'SPINNING…' : alreadySpun ? 'COME BACK TOMORROW' : 'SPIN THE WHEEL'}
            variant="wheel"
            size="lg"
            disabled={spinning || alreadySpun}
            onPress={() => {
              void onSpin();
            }}
          />

          {wonToday === null ? null : (
            <Text style={styles.wonToday}>Today the wheel paid you 🪙 {wonToday} tokens</Text>
          )}

          <GlassCard style={styles.legend}>
            {SPIN_SEGMENTS.map((segment, index) => (
              <View key={segment.reward} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: segmentColorOf(index) }]} />
                <Text style={styles.legendText}>{segment.reward} tokens</Text>
                <Text style={styles.legendWeight}>{segment.weight}%</Text>
              </View>
            ))}
          </GlassCard>
        </ScrollView>

        {reward === null ? null : (
          <View style={styles.backdrop}>
            <Animated.View style={[styles.rewardCard, cardStyle]}>
              <Text style={styles.rewardTitle}>YOU WON</Text>
              <Text style={styles.rewardValue}>+{reward}</Text>
              <Text style={styles.rewardLabel}>tokens</Text>
              <Text style={styles.rewardHint}>Come back tomorrow for another spin.</Text>
              <GameButton
                label="Nice!"
                variant="wheel"
                size="lg"
                onPress={() => {
                  setReward(null);
                }}
              />
            </Animated.View>
          </View>
        )}
      </SafeAreaView>
    </GameBackground>
  );
}

/** The color of the segment with an index. */
function segmentColorOf(index: number): string {
  return spinSegmentColors[index % spinSegmentColors.length] ?? colors.primary;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 14,
    alignItems: 'stretch',
  },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  wheelBox: {
    marginVertical: 10,
    alignItems: 'center',
  },
  message: {
    color: colors.danger,
    fontSize: 14,
    fontFamily: fonts.titleSemi,
    textAlign: 'center',
  },
  wonToday: {
    color: colors.gold,
    fontSize: 14,
    fontFamily: fonts.titleSemi,
    textAlign: 'center',
  },
  legend: {
    gap: 6,
    padding: 12,
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
    fontFamily: fonts.titleSemi,
  },
  legendWeight: {
    color: colors.textDim,
    fontSize: 13,
    fontFamily: fonts.titleSemi,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 7, 11, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  rewardCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.card,
    backgroundColor: 'rgba(24, 25, 31, 0.96)',
    borderWidth: 2,
    borderColor: colors.gold,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  rewardTitle: {
    color: colors.gold,
    fontSize: 20,
    fontFamily: fonts.title,
    letterSpacing: 3,
  },
  rewardValue: {
    color: colors.text,
    fontSize: 56,
    fontFamily: fonts.title,
  },
  rewardLabel: {
    color: colors.textMuted,
    fontSize: 16,
    fontFamily: fonts.titleSemi,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  rewardHint: {
    color: colors.textDim,
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    marginTop: 6,
    marginBottom: 10,
  },
});
