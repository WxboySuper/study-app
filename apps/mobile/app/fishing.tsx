import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FishingScreen, type FishingDemo } from '@/modes/fishing/FishingScreen';
import type { ScopeChoice } from '@/settings';

/** The demos the route understands. */
const FishingDemos = [
  'scene',
  'cast',
  'question',
  'reveal',
  'payout',
  'layout',
  'seq-highlight',
  'seq-dip',
  'seq-tug',
  'seq-breach',
  'seq-reveal',
  'ff2-cast',
  'ff2-hooked',
  'ff2-question',
  'ff2-correct',
  'ff2-wrong',
  'ff2-reveal',
] as const;

/**
 * The route of the fishing mode.
 *
 * The scope comes from the query (`?kind=all`, `?kind=set&id=...`), so the
 * "Play again" button of the payout screen can start the same session again
 * with one tap. The web build can also jump to a state of the mode with
 * `?demo=cast`, `?demo=question`, `?demo=reveal` or `?demo=payout`, and to
 * a frame of the catch with `?demo=seq-highlight`, `?demo=seq-dip`,
 * `?demo=seq-tug`, `?demo=seq-breach` or `?demo=seq-reveal`. The `ff2-*`
 * demos play the pass-2 flow from the cast to the claim card.
 */
export default function FishingRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    kind?: string;
    id?: string;
    title?: string;
    demo?: string;
    mastery?: string;
  }>();
  const [session, setSession] = useState(0);

  const demo: FishingDemo | null = (FishingDemos as readonly string[]).includes(params.demo ?? '')
    ? (params.demo as FishingDemo)
    : null;

  // The mastery mode of the session (the home screen remembers it).
  const mastery = params.mastery === '1' || params.mastery === 'true';

  const scope: ScopeChoice = (() => {
    if (params.kind === 'set' && typeof params.id === 'string') {
      return { kind: 'set', id: params.id, title: params.title ?? 'Deck' };
    }
    if (params.kind === 'class') {
      const id = typeof params.id === 'string' && params.id !== '' ? params.id : null;
      return { kind: 'class', id, title: params.title ?? 'Class' };
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
        mastery={mastery}
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
