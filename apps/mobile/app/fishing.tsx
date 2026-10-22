import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FishingScreen, type FishingDemo } from '@/modes/fishing/FishingScreen';
import type { ScopeChoice } from '@/settings';

/**
 * The route of the fishing mode.
 *
 * The scope comes from the query (`?kind=all`, `?kind=set&id=...`), so the
 * "Play again" button of the payout screen can start the same session again
 * with one tap. The web build can also jump to a state of the mode with
 * `?demo=question`, `?demo=reveal` or `?demo=payout`.
 */
export default function FishingRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    kind?: string;
    id?: string;
    title?: string;
    demo?: string;
  }>();
  const [session, setSession] = useState(0);

  const demo: FishingDemo | null =
    params.demo === 'question' || params.demo === 'reveal' || params.demo === 'payout'
      ? params.demo
      : null;

  const scope: ScopeChoice = (() => {
    if (params.kind === 'set' && typeof params.id === 'string') {
      return { kind: 'set', id: params.id, title: params.title ?? 'Set' };
    }
    if (params.kind === 'topic' && typeof params.id === 'string') {
      return { kind: 'topic', id: params.id, title: params.title ?? 'Topic' };
    }
    return { kind: 'all' };
  })();

  return (
    <View style={styles.container}>
      <FishingScreen
        key={session}
        scope={scope}
        demo={demo}
        onHome={() => {
          router.replace('/');
        }}
        onPlayAgain={() => {
          setSession((current) => current + 1);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
});
