import { buildQueue, localDayKey } from '@study-app/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listLocalCardStates, listLocalCards, listLocalSets, listLocalTopics, openLocalDatabase, type LocalSet, type LocalTopic } from '@/db/local';
import { readCollection, readWallet } from '@/db/wallet';
import { scopeTitle, useSettings } from '@/settings';
import { colors, font, radius } from '@/theme';

/**
 * The home screen (SPEC "Session flow").
 *
 * One tap: pick a mode, pick what to study (all, a topic or a set) and go.
 * The last choice is remembered, so "Play again" from a mode is a single tap.
 */
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

  // The wallet is re-read whenever Home comes back into focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const db = await openLocalDatabase();
          const wallet = await readWallet(db, localDayKey(new Date()));
          const collection = await readCollection(db);
          if (!cancelled) {
            setBalance(wallet.balance);
            setPackTickets(wallet.packTickets);
            setCritterCount(collection.size);
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
        const db = await openLocalDatabase();
        const cards = await listLocalCards(db);
        const states = await listLocalCardStates(db);
        const localSets = await listLocalSets(db);
        const localTopics = await listLocalTopics(db);
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Blookless</Text>
        <Text style={styles.subtitle}>
          Endless, untimed study. The scheduler picks the cards, the game picks the vibe.
        </Text>

        <View style={styles.wallet} accessibilityLabel={`${balance ?? 0} tokens`}>
          <View>
            <Text style={styles.walletTokens}>🪙 {balance ?? '…'}</Text>
            <Text style={styles.walletLabel}>tokens</Text>
          </View>
          <Text style={styles.walletExtra}>
            🎟️ {packTickets} · 🐾 {critterCount} critters
          </Text>
        </View>

        <View style={styles.hub}>
          <HubButton
            emoji="🎁"
            label="PACKS"
            hint="Buy a pack"
            color={colors.shop}
            dark={colors.shopDark}
            onPress={() => {
              router.push('/packs');
            }}
          />
          <HubButton
            emoji="📖"
            label="COLLECTION"
            hint="Sell dupes"
            color={colors.collection}
            dark={colors.collectionDark}
            onPress={() => {
              router.push('/collection');
            }}
          />
          <HubButton
            emoji="🎡"
            label="DAILY SPIN"
            hint="Free tokens"
            color={colors.wheel}
            dark={colors.wheelDark}
            onPress={() => {
              router.push('/spin');
            }}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mode</Text>
          <View style={styles.modes}>
            <View style={[styles.mode, styles.modeActive]}>
              <Text style={styles.modeEmoji}>🎣</Text>
              <Text style={styles.modeLabel}>Fishing</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Study</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setScope({ kind: 'all' });
            }}
            style={[styles.choice, scope.kind === 'all' ? styles.choiceActive : null]}
          >
            <Text style={styles.choiceLabel}>All</Text>
          </Pressable>

          {topics.map((topic) => (
            <Pressable
              key={topic.id}
              accessibilityRole="button"
              onPress={() => {
                setScope({ kind: 'topic', id: topic.id, title: topic.name });
              }}
              style={[
                styles.choice,
                scope.kind === 'topic' && scope.id === topic.id ? styles.choiceActive : null,
              ]}
            >
              <Text style={styles.choiceLabel}>Topic: {topic.name}</Text>
            </Pressable>
          ))}

          {sets.map((set) => (
            <Pressable
              key={set.id}
              accessibilityRole="button"
              onPress={() => {
                setScope({ kind: 'set', id: set.id, title: set.title });
              }}
              style={[
                styles.choice,
                scope.kind === 'set' && scope.id === set.id ? styles.choiceActive : null,
              ]}
            >
              <Text style={styles.choiceLabel}>Set: {set.title}</Text>
            </Pressable>
          ))}

          {sets.length === 0 && topics.length === 0 ? (
            <Text style={styles.hint}>
              Only “All” is available until a set is imported. The last choice is remembered.
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={go}
          style={({ pressed }) => [styles.goButton, pressed && styles.goPressed]}
        >
          <Text style={styles.goLabel}>Go · {scopeTitle(scope)}</Text>
        </Pressable>

        <Text style={styles.status}>{status}</Text>

        <View style={styles.card}>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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

/** One of the big buttons of the hub (the shop, the book, the wheel). */
function HubButton({
  emoji,
  label,
  hint,
  color,
  dark,
  onPress,
}: {
  emoji: string;
  label: string;
  hint: string;
  color: string;
  dark: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hubButton,
        { backgroundColor: color, borderBottomColor: dark },
        pressed && styles.hubButtonPressed,
      ]}
    >
      <Text style={styles.hubEmoji}>{emoji}</Text>
      <Text style={styles.hubLabel}>{label}</Text>
      <Text style={styles.hubHint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 14,
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 16,
    lineHeight: 22,
  },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  walletTokens: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: font.heavy,
  },
  walletLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: font.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  walletExtra: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: font.bold,
  },
  hub: {
    flexDirection: 'row',
    gap: 10,
  },
  hubButton: {
    flex: 1,
    borderRadius: radius.button,
    borderBottomWidth: 7,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  hubButtonPressed: {
    opacity: 0.85,
    transform: [{ translateY: 3 }],
  },
  hubEmoji: {
    fontSize: 28,
  },
  hubLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: font.heavy,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  hubHint: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: font.bold,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modes: {
    flexDirection: 'row',
    gap: 10,
  },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
  },
  modeActive: {
    borderColor: '#208aef',
    backgroundColor: '#1d3557',
  },
  modeEmoji: {
    fontSize: 20,
  },
  modeLabel: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  choice: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1f2937',
    paddingHorizontal: 14,
  },
  choiceActive: {
    borderColor: '#208aef',
    backgroundColor: '#1d3557',
  },
  choiceLabel: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  goButton: {
    backgroundColor: '#208aef',
    borderRadius: 16,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goPressed: {
    opacity: 0.85,
  },
  goLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  status: {
    color: '#cbd5f5',
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  toggleLabel: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  toggle: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: '#2f9e44',
  },
  toggleOff: {
    backgroundColor: '#1f2937',
  },
  toggleText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
});
