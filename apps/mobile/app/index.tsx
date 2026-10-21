import { buildQueue } from '@study-app/core';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listLocalCardStates, listLocalCards, openLocalDatabase } from '@/db/local';

/**
 * Placeholder home screen (Phase 0).
 *
 * The "Study All" button already goes through the real pipeline: it reads the
 * local SQLite store and hands the cards to the FSRS queue builder of
 * `@study-app/core`. The actual game screen lands in Phase 1.
 */
export default function HomeScreen() {
  const [status, setStatus] = useState('Nothing studied yet today.');
  const [busy, setBusy] = useState(false);

  const onStudyAll = useCallback(async () => {
    setBusy(true);
    try {
      const db = await openLocalDatabase();
      const cards = await listLocalCards(db);
      const states = await listLocalCardStates(db);
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
      setStatus(error instanceof Error ? error.message : 'Could not read the local database.');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>study-app</Text>
        <Text style={styles.subtitle}>
          Endless, untimed study. The scheduler picks the cards, the game picks the vibe.
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void onStudyAll();
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonLabel}>Study All</Text>
          )}
        </Pressable>

        <Text style={styles.status}>{status}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
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
  button: {
    alignItems: 'center',
    backgroundColor: '#208aef',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 24,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  status: {
    color: '#cbd5f5',
    fontSize: 14,
  },
});
