import {
  SPIN_JACKPOT,
  SPIN_SEGMENTS,
  canSpin,
  localDayKey,
  spinSegmentIndex,
  spinTargetRotation,
  type WalletSnapshot,
} from '@study-app/core';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { openLocalStore } from '@/db/local';
import { hapticImpact, hapticSuccess } from '@/haptics';
import { playSfx, prepareSfx } from '@/modes/fishing/sfx';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, spinSegmentColors } from '@/theme';
import {
  GameBackground,
  GameButton,
  GlassCard,
  LightRays,
  Particles,
  ScreenHeader,
  TokenCounter,
} from '@/ui';

import { SpinWheel } from './SpinWheel';

/**
 * The daily wheel.
 *
 * The wheel can be spun once per local day. The reward is decided by the
 * local store (the same pure code the server would run), and the wheel then
 * spins down to the segment that was won and stops dead centre on it (no
 * snap back), while the pointer ticks on every segment
 * that passes under it.
 *
 * The jackpot is a show of its own: golden rays, a storm of confetti and
 * the heavy buzz of the phone.
 */

/** How long the wheel spins. */
const SPIN_DURATION_MS = 4600;


export function SpinScreen() {
  const params = useLocalSearchParams<{ demo?: string }>();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [wonToday, setWonToday] = useState<number | null>(null);
  const [alreadySpun, setAlreadySpun] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);

  const rotation = useSharedValue(0);
  const cardScale = useSharedValue(0);
  const spunRef = useRef(false);

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
  }, []);

  const onSpin = useCallback(async () => {
    if (spinning || alreadySpun) {
      return;
    }

    setSpinning(true);
    setMessage(null);
    play('tap');

    try {
      const store = await openLocalStore();
      const result = await store.spinDailyWheel(localDayKey(new Date()));

      if (!result.ok) {
        setMessage(result.message);
        setSpinning(false);
        return;
      }

      // The spin is already saved (the prize counts once, even if the app is
      // killed mid-spin), but nothing is shown until the wheel stops.
      const won = result.reward;
      const wonWallet = result.wallet;
      const index = Math.max(0, spinSegmentIndex(won));
      const target = spinTargetRotation(index, 5, Math.random() * 2 - 1);

      const finish = () => {
        setWallet(wonWallet);
        setReward(won);
        setWonToday(won);
        setSpinning(false);
        setAlreadySpun(true);
        setBurst((current) => current + 1);
        cardScale.value = withSequence(
          withTiming(1.12, { duration: 160, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 11, stiffness: 170 }),
        );
        playSfx('coin');
        play('spinWin');
        play('coin');
        if (won >= SPIN_JACKPOT) {
          hapticImpact('heavy');
        }
        hapticSuccess();
      };

      // One deceleration straight onto the target: no overshoot, no spring,
      // so the segment the wheel stops on is the segment that pays.
      rotation.value = rotation.value % 360;
      rotation.value = withTiming(
        target,
        // A long, slow tail: near an edge the last tick creeps up to the line.
        { duration: SPIN_DURATION_MS + 400, easing: Easing.bezier(0.1, 0.75, 0.12, 1) },
        (finished) => {
          if (finished) {
            runOnJS(finish)();
          }
        },
      );
    } catch {
      setMessage('The wheel could not be spun.');
      setSpinning(false);
    }
  }, [spinning, alreadySpun, rotation, cardScale]);

  // The demo of the web build spins the wheel right away.
  useEffect(() => {
    if (params.demo !== 'spin' || spunRef.current) {
      return;
    }
    spunRef.current = true;
    const timer = setTimeout(() => {
      void onSpin();
    }, 700);
    return () => {
      clearTimeout(timer);
    };
  }, [onSpin, params.demo]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: reward === null ? 0 : 1,
    transform: [{ scale: cardScale.value }],
  }));

  const jackpot = reward !== null && reward >= SPIN_JACKPOT;
  const winningIndex = useMemo(
    () => (reward === null ? null : Math.max(0, spinSegmentIndex(reward))),
    [reward],
  );

  return (
    <GameBackground variant="spin">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="DAILY SPIN"
            subtitle="One spin a day. The tokens are a bonus, not a grind."
            right={
              <GlassCard borderRadius={radius.chip} elevated={false} contentStyle={styles.headerChip}>
                <TokenCounter value={wallet?.balance ?? 0} size={18} />
              </GlassCard>
            }
          />

          <View style={styles.wheelBox}>
            <SpinWheel
              rotation={rotation}
              dimmed={alreadySpun && !spinning}
              winningIndex={winningIndex}
              ticking={spinning}
            />
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

          {alreadySpun ? <MidnightCountdown /> : null}

          <GlassCard contentStyle={styles.legend}>
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
            {jackpot ? (
              <LightRays color={colors.gold} count={20} size={820} opacity={0.42} style={styles.rays} />
            ) : null}

            <Animated.View style={[styles.rewardCard, cardStyle]}>
              {jackpot ? (
                <View style={styles.jackpot}>
                  <Text style={styles.jackpotText}>JACKPOT!</Text>
                </View>
              ) : (
                <Text style={styles.rewardTitle}>YOU WON</Text>
              )}

              <TokenCounter
                value={reward}
                startAt={0}
                size={64}
                duration={1100}
                accessibilityLabel={`${reward} tokens`}
              />
              <Text style={styles.rewardLabel}>tokens</Text>
              <Text style={styles.rewardHint}>Come back tomorrow for another spin.</Text>
              <GameButton
                label="NICE!"
                variant="wheel"
                size="lg"
                onPress={() => {
                  setReward(null);
                }}
              />
            </Animated.View>

            <Particles
              trigger={burst}
              count={jackpot ? 90 : 46}
              colors={
                jackpot
                  ? [colors.gold, '#fff7d6', '#fbbf24', '#ffffff', '#f472b6']
                  : [colors.wheel, '#ffffff', '#f472b6', '#7b61ff']
              }
              size={jackpot ? 18 : 13}
              distance={jackpot ? 320 : 240}
              gravity={jackpot ? 340 : 280}
            />
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

/** The countdown to the next local midnight (the next spin). */
function MidnightCountdown() {
  const [left, setLeft] = useState(() => msUntilMidnight());

  useEffect(() => {
    const timer = setInterval(() => {
      setLeft(msUntilMidnight());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const total = Math.max(0, Math.floor(left / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return (
    <View style={styles.countdown}>
      <Text style={styles.countdownLabel}>NEXT SPIN IN</Text>
      <Text style={styles.countdownValue}>
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:
        {String(seconds).padStart(2, '0')}
      </Text>
    </View>
  );
}

/** The milliseconds until the next local midnight. */
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
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
    fontFamily: fonts.titleSemi,
    fontSize: 14,
    textAlign: 'center',
  },
  countdown: {
    alignItems: 'center',
    borderRadius: radius.tile,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    gap: 2,
  },
  countdownLabel: {
    color: colors.textDim,
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 2,
  },
  countdownValue: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 26,
    letterSpacing: 1,
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
    backgroundColor: 'rgba(6, 7, 11, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  rays: {
    top: '50%',
    left: '50%',
    marginTop: -410,
    marginLeft: -410,
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
  jackpot: {
    borderRadius: radius.chip,
    paddingHorizontal: 18,
    paddingVertical: 6,
    backgroundColor: colors.gold,
    transform: [{ rotate: '-3deg' }],
  },
  jackpotText: {
    color: '#4a2a00',
    fontSize: 20,
    fontFamily: fonts.title,
    letterSpacing: 2,
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
    textAlign: 'center',
  },
});
