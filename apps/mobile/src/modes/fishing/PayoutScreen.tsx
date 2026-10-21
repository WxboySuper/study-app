import type { FishingSessionResult } from '@study-app/core';
import { CATCH_TIERS } from '@study-app/core';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { tierColor } from './assets';
import { playSfxSequence } from './sfx';
import { Sprite } from './Sprite';

/**
 * The payout screen of the fishing mode (docs/design/fishing.md §10).
 *
 * It shows the tokens, the haul, the catches per tier, the critters and the
 * pack tickets. The server pays the session out, so the tokens that are shown
 * here are the estimate of `computePayout` until the API answers.
 */

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface PayoutScreenProps {
  /** The result of the session. */
  result: FishingSessionResult;
  /** The tokens of the session. */
  tokens: number;
  /** Starts the same mode and scope again. */
  onPlayAgain: () => void;
  /** Goes back to the home screen. */
  onHome: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
  /** The critters that were new to the collection. */
  newCritterIds?: ReadonlySet<string>;
}

export function PayoutScreen({ result, tokens, onPlayAgain, onHome, reduceMotion, newCritterIds }: PayoutScreenProps) {
  const counter = useSharedValue(0);
  const cardScale = useSharedValue(0.9);

  useEffect(() => {
    if (reduceMotion) {
      counter.value = tokens;
      cardScale.value = 1;
      return;
    }

    counter.value = withTiming(tokens, { duration: 900 });
    cardScale.value = withSpring(1, { damping: 14, stiffness: 120 });
    playSfxSequence('coin', Math.max(1, Math.min(8, Math.round(tokens / 4))));
  }, [tokens, reduceMotion, counter, cardScale]);

  const tokenProps = useAnimatedProps(() => ({
    text: `${Math.round(counter.value)}`,
    defaultValue: `${Math.round(counter.value)}`,
  }));

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const biggest = result.biggest;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Pack up!</Text>

        <Animated.View style={[styles.tokenCard, cardStyle]}>
          <Text style={styles.tokenLabel}>Tokens</Text>
          <AnimatedTextInput
            editable={false}
            animatedProps={tokenProps}
            underlineColorAndroid="transparent"
            style={styles.tokenValue}
            accessibilityLabel={`${tokens} tokens`}
          />
          <Text style={styles.tokenHint}>the server pays the session out</Text>
        </Animated.View>

        <View style={styles.statRow}>
          <Stat label="Haul" value={`${result.haulLbs.toLocaleString('en-US')} lbs`} />
          <Stat label="Catches" value={`${result.catches}`} />
          <Stat label="Correct" value={`${result.correct}/${result.answered}`} />
        </View>

        {biggest === null ? null : (
          <View style={styles.biggest}>
            <Text style={styles.sectionTitle}>Biggest catch</Text>
            <View style={styles.biggestRow}>
              <Sprite assetId={biggest.assetId} size={72} />
              <View style={styles.biggestText}>
                <Text style={styles.biggestName}>{biggest.name}</Text>
                <Text style={[styles.biggestWeight, { color: tierColor(biggest.tier) }]}>
                  {biggest.lbs.toLocaleString('en-US')} lbs
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Catches by tier</Text>
          {CATCH_TIERS.map((tier) => (
            <View key={tier.id} style={styles.tierRow}>
              <View style={[styles.tierDot, { backgroundColor: tier.color }]} />
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={styles.tierCount}>{result.byTier[tier.id] ?? 0}</Text>
            </View>
          ))}
        </View>

        {result.critters.length === 0 ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Critters</Text>
            {result.critters.map((critter) => (
              <View key={`${critter.critterId}-${critter.lbs}`} style={styles.critterRow}>
                <Text style={styles.critterEmoji}>{critter.emoji}</Text>
                <Text style={styles.critterName}>{critter.name}</Text>
                <Text style={styles.critterRarity}>
                  {newCritterIds?.has(critter.critterId) === true ? 'NEW · ' : ''}
                  {critter.rarity}
                </Text>
              </View>
            ))}
          </View>
        )}

        {result.packTickets === 0 ? null : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pack tickets</Text>
            <Text style={styles.ticketText}>🎟️ {result.packTickets} free Brain Buddies pack</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onPlayAgain}
          style={({ pressed }) => [styles.playAgain, pressed && styles.pressed]}
        >
          <Text style={styles.playAgainText}>Play again</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onHome}
          style={({ pressed }) => [styles.home, pressed && styles.pressed]}
        >
          <Text style={styles.homeText}>Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  content: {
    padding: 18,
    paddingBottom: 120,
    gap: 14,
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  tokenCard: {
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 18,
    paddingVertical: 16,
  },
  tokenLabel: {
    color: '#94a3b8',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tokenValue: {
    color: '#ffd166',
    fontSize: 48,
    fontWeight: '900',
    padding: 0,
    textAlign: 'center',
  },
  tokenHint: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tierName: {
    flex: 1,
    color: '#cbd5f5',
    fontSize: 14,
  },
  tierCount: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  biggest: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 14,
  },
  biggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  biggestText: {
    flex: 1,
  },
  biggestName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  biggestWeight: {
    fontSize: 15,
    fontWeight: '800',
  },
  critterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  critterEmoji: {
    fontSize: 20,
  },
  critterName: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  critterRarity: {
    color: '#94a3b8',
    fontSize: 12,
  },
  ticketText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: 'rgba(11, 16, 32, 0.95)',
  },
  playAgain: {
    flex: 1,
    backgroundColor: '#208aef',
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  home: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  playAgainText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  homeText: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
  },
});
