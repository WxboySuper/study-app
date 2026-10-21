import { buildQueue, canSpin, findCritter, isPackAvailable, localDayKey, PACKS } from '@study-app/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  openLocalStore,
  type LocalSet,
  type LocalTopic,
} from '@/db/local';
import { critterArt } from '@/packs/critterArt';
import { scopeTitle, useSettings } from '@/settings';
import { colors, fonts, gradientDirection, gradients, radius, shadow, spacing, type Gradient } from '@/theme';
import {
  GameBackground,
  GameButton,
  GlassCard,
  Glow,
  ProgressRing,
  TokenCounter,
  WheelGlyph,
  Wordmark,
} from '@/ui';

/**
 * The home screen (SPEC "Session flow").
 *
 * The game shows its face here: the logo, the wallet, the big play card of
 * the fishing mode and the three places of the game (the packs, the book
 * and the wheel). The last scope is remembered, so "Play again" is a single
 * tap.
 */

/** The critter that floats above the play card. */
const HERO_CRITTER_ID = 'mnemo_the_memory_jelly';

export default function HomeScreen() {
  const router = useRouter();
  const {
    scope,
    setScope,
    sound,
    setSound,
    haptics,
    setHaptics,
    autoReel,
    setAutoReel,
    reduceMotion,
    setReduceMotion,
    systemReduceMotion,
  } = useSettings();

  const [sets, setSets] = useState<LocalSet[]>([]);
  const [topics, setTopics] = useState<LocalTopic[]>([]);
  const [status, setStatus] = useState('Loading…');
  const [balance, setBalance] = useState<number | null>(null);
  const [packTickets, setPackTickets] = useState(0);
  const [critterCount, setCritterCount] = useState(0);
  const [spinReady, setSpinReady] = useState(false);

  const totalCritters = PACKS.reduce((sum, pack) => sum + pack.critters.length, 0);
  const cheapestPack = useMemo(() => {
    const onSale = PACKS.filter((pack) => isPackAvailable(pack, Date.now()));
    if (onSale.length === 0) {
      return 0;
    }
    return Math.min(...onSale.map((pack) => pack.priceTokens));
  }, []);

  // The wallet is re-read whenever Home comes back into focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const store = await openLocalStore();
          const today = localDayKey(new Date());
          const wallet = await store.readWallet(today);
          const collection = await store.readCollection();
          const lastSpin = await store.readLastSpin();
          if (!cancelled) {
            setBalance(wallet.balance);
            setPackTickets(wallet.packTickets);
            setCritterCount(collection.size);
            setSpinReady(canSpin(lastSpin?.localDate ?? null, today));
          }
        } catch {
          // The wallet stays hidden.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const store = await openLocalStore();
        const cards = await store.listCards();
        const states = await store.listCardStates();
        const localSets = await store.listSets();
        const localTopics = await store.listTopics();
        if (cancelled) {
          return;
        }

        setSets(localSets);
        setTopics(localTopics);

        const queue = buildQueue(cards, states, Date.now(), {
          newCap: 20,
          scope: { kind: 'all' },
        });

        setStatus(
          queue.length === 0
            ? 'No cards yet. Import a set to start studying.'
            : `${queue.length} card${queue.length === 1 ? '' : 's'} queued.`,
        );
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Could not read the local database.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const go = useCallback(() => {
    setScope(scope);
    router.push({
      pathname: '/fishing',
      params:
        scope.kind === 'all'
          ? { kind: 'all' }
          : { kind: scope.kind, id: scope.id, title: scope.title },
    });
  }, [router, scope, setScope]);

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.header}>
            <Wordmark size={44} />
            <Text style={styles.tagline}>
              Endless, untimed study. The scheduler picks the cards, the game picks the vibe.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.springify().damping(16).delay(80)}
            style={styles.walletRow}
          >
            <GlassCard style={styles.walletCard} contentStyle={styles.walletCardContent} tint={colors.gold}>
              <TokenCounter value={balance ?? 0} size={26} accessibilityLabel={`${balance ?? 0} tokens`} />
              <Text style={styles.walletLabel}>tokens</Text>
            </GlassCard>

            <GlassCard
              style={styles.walletCard}
              contentStyle={styles.walletCardContent}
              tint={colors.ticket}
              accessibilityLabel={`${packTickets} pack tickets`}
            >
              <Text style={styles.ticketEmoji}>🎟️</Text>
              <Text style={styles.ticketCount}>{packTickets}</Text>
              <Text style={styles.walletLabel}>tickets</Text>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.springify().damping(16).delay(160)}>
            <PlayCard
              onPress={go}
              scopeTitle={scopeTitle(scope)}
              status={status}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.springify().damping(16).delay(240)} style={styles.tiles}>
            <ModeTile
              title="PACKS"
              hint="Open a pack"
              gradient={gradients.shop}
              glow={colors.shop}
              onPress={() => {
                router.push('/packs');
              }}
              badge={`FROM ${cheapestPack} 🪙`}
              art={<PacksArt />}
            />

            <ModeTile
              title="COLLECTION"
              hint="Sell duplicates"
              gradient={gradients.collection}
              glow={colors.collection}
              onPress={() => {
                router.push('/collection');
              }}
              badge={`${critterCount}/${totalCritters}`}
              art={
                <ProgressRing progress={totalCritters === 0 ? 0 : critterCount / totalCritters} size={58} color={colors.collection}>
                  <Text style={styles.ringText}>{critterCount}</Text>
                </ProgressRing>
              }
            />

            <ModeTile
              title="DAILY SPIN"
              hint="Free tokens"
              gradient={gradients.wheel}
              glow={colors.wheel}
              onPress={() => {
                router.push('/spin');
              }}
              badge={spinReady ? 'SPIN READY!' : 'COME BACK TOMORROW'}
              badgePulse={spinReady}
              art={<WheelGlyph size={54} />}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.springify().damping(16).delay(320)} style={styles.section}>
            <Text style={styles.sectionTitle}>Study</Text>

            <View style={styles.choices}>
              <Choice
                label="All"
                active={scope.kind === 'all'}
                onPress={() => {
                  setScope({ kind: 'all' });
                }}
              />

              {topics.map((topic) => (
                <Choice
                  key={topic.id}
                  label={`Topic: ${topic.name}`}
                  active={scope.kind === 'topic' && scope.id === topic.id}
                  onPress={() => {
                    setScope({ kind: 'topic', id: topic.id, title: topic.name });
                  }}
                />
              ))}

              {sets.map((set) => (
                <Choice
                  key={set.id}
                  label={`Set: ${set.title}`}
                  active={scope.kind === 'set' && scope.id === set.id}
                  onPress={() => {
                    setScope({ kind: 'set', id: set.id, title: set.title });
                  }}
                />
              ))}
            </View>

            {sets.length === 0 && topics.length === 0 ? (
              <Text style={styles.hint}>
                Only “All” is available until a set is imported. The last choice is remembered.
              </Text>
            ) : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.springify().damping(16).delay(380)} style={styles.section}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <Toggle label="Sound" value={sound} onChange={setSound} />
            <Toggle label="Haptics" value={haptics} onChange={setHaptics} />
            <Toggle label="Auto reel" value={autoReel} onChange={setAutoReel} />
            <Toggle
              label="Reduce motion"
              value={reduceMotion ?? systemReduceMotion}
              onChange={(value) => {
                setReduceMotion(value);
              }}
            />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </GameBackground>
  );
}

/** The big play card of the fishing mode. */
function PlayCard({
  onPress,
  scopeTitle: currentScope,
  status,
}: {
  onPress: () => void;
  scopeTitle: string;
  status: string;
}) {
  const bob = useSharedValue(0);
  const critter = findCritter(HERO_CRITTER_ID);
  const art = critter === undefined ? null : critterArt(critter);

  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(bob);
    };
  }, [bob]);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -10 + bob.value * 20 }, { rotate: `${(bob.value - 0.5) * 5}deg` }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play Fish Frenzy. ${currentScope}`}
      accessibilityHint="Starts a study session"
      onPress={onPress}
      style={({ pressed }) => [styles.playPressable, pressed && styles.playPressed]}
    >
      <View style={styles.playWrap}>
        <Glow color={colors.primary} size={300} opacity={0.55} style={styles.playGlow} />

        <GlassCard contentStyle={styles.playCard} tint="#7b61ff">
          <View style={styles.playTop}>
            <View style={styles.playText}>
              <Text style={styles.playKicker}>PLAY</Text>
              <Text style={styles.playTitle}>Fish Frenzy</Text>
              <Text style={styles.playScope}>{currentScope}</Text>
            </View>

            <Animated.View style={[styles.playArt, bobStyle]}>
              {art === null ? (
                <Text style={styles.playEmoji}>{critter?.emoji ?? '🐟'}</Text>
              ) : (
                <Image source={art} style={styles.playImage} resizeMode="contain" />
              )}
            </Animated.View>
          </View>

          <GameButton label="START" variant="primary" size="lg" onPress={onPress} pulse />

          <Text style={styles.playStatus}>{status}</Text>
        </GlassCard>
      </View>
    </Pressable>
  );
}

/** The art of the packs tile: the critters of the starter pack. */
function PacksArt() {
  const critter = findCritter('gigabrain_golem');
  const art = critter === undefined ? null : critterArt(critter);

  if (art === null) {
    return <Text style={styles.playEmoji}>🎁</Text>;
  }

  return <Image source={art} style={styles.tileImage} resizeMode="contain" />;
}

/** One of the three tiles of the game. */
function ModeTile({
  title,
  hint,
  gradient,
  glow,
  onPress,
  badge,
  badgePulse = false,
  art,
}: {
  title: string;
  hint: string;
  gradient: Gradient;
  glow: string;
  onPress: () => void;
  badge: string;
  badgePulse?: boolean;
  art: ReactNode;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!badgePulse) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return undefined;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [badgePulse, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tilePressable, pressed && styles.tilePressed]}
    >
      <View style={styles.tile}>
        <LinearGradientFace colors={gradient} />
        <Glow color={glow} size={150} opacity={0.45} style={styles.tileGlow} />

        <View style={styles.tileArt}>{art}</View>

        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileHint}>{hint}</Text>

        <Animated.View style={[styles.badge, pulseStyle]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** The gradient face of a tile. */
function LinearGradientFace({ colors }: { colors: Gradient }) {
  return (
    <LinearGradient
      colors={colors}
      start={gradientDirection.start}
      end={gradientDirection.end}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** One of the choices of the scope (All, a topic or a set). */
function Choice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active ? styles.choiceActive : null,
        pressed ? styles.choicePressed : null,
      ]}
    >
      <Text style={[styles.choiceLabel, active ? styles.choiceLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

/** One of the switches of the settings. */
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        onChange(!value);
      }}
      style={styles.toggleRow}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}>
        <Text style={styles.toggleText}>{value ? 'on' : 'off'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.sm,
  },
  tagline: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  walletRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  walletCard: {
    flex: 1,
  },
  walletCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  walletLabel: {
    color: colors.textDim,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketEmoji: {
    fontSize: 20,
  },
  ticketCount: {
    color: colors.ticket,
    fontFamily: fonts.title,
    fontSize: 24,
  },
  playPressable: {
    borderRadius: radius.card,
  },
  playPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  playWrap: {
    position: 'relative',
  },
  playCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  playGlow: {
    position: 'absolute',
    top: -80,
    right: -60,
  },
  playTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  playText: {
    flex: 1,
    gap: 2,
  },
  playKicker: {
    color: colors.primaryLight,
    fontFamily: fonts.title,
    fontSize: 13,
    letterSpacing: 3,
  },
  playTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 30,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  playScope: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  playArt: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playImage: {
    width: 96,
    height: 96,
  },
  playEmoji: {
    fontSize: 56,
  },
  playStatus: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    textAlign: 'center',
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tilePressable: {
    flex: 1,
  },
  tilePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  tile: {
    flex: 1,
    minHeight: 168,
    borderRadius: radius.tile,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
    overflow: 'hidden',
    ...shadow.soft,
  },
  tileGlow: {
    position: 'absolute',
    top: -40,
    left: -30,
  },
  tileArt: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImage: {
    width: 64,
    height: 64,
  },
  tileTitle: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 13,
    letterSpacing: 0.8,
    marginTop: spacing.xs,
  },
  tileHint: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  badge: {
    marginTop: spacing.sm,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  badgeText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  ringText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 16,
  },
  section: {
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  choices: {
    gap: spacing.sm,
  },
  choice: {
    minHeight: 46,
    justifyContent: 'center',
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: spacing.md,
  },
  choiceActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(123,97,255,0.22)',
  },
  choicePressed: {
    opacity: 0.75,
  },
  choiceLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  choiceLabelActive: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
  },
  hint: {
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  toggleLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  toggle: {
    borderRadius: radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 5,
    minWidth: 56,
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: colors.collection,
  },
  toggleOff: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  toggleText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 12,
  },
});
