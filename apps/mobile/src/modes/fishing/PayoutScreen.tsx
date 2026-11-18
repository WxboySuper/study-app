import type { FishingSessionResult } from '@study-app/core';
import { CATCH_TIERS, DEFAULT_PAYOUT_RULES, formatLbs } from '@study-app/core';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, radius } from '@/theme';
import { GameBackground, GameButton, GlassCard, Glow, LightRays, Particles, TokenCounter } from '@/ui';

import { tierColor } from './assets';
import { playSfxSequence } from './sfx';
import { Sprite } from './Sprite';

/**
 * The payout screen of the fishing mode (docs/design/fishing.md §10).
 *
 * It shows the tokens, the haul, the catches per tier, the critters that
 * were caught and the pack tickets. The server pays the session out, so the
 * tokens that are shown here are the estimate of `computePayout` until the API
 * answers.
 *
 * The critters are listed because they were caught (they count for the haul),
 * not because they were collected: a catch never grants a critter, only a
 * pack does.
 */

/** The tokens a heavy catch pays at the end of the session. */
const HEAVY_BONUS_TOKENS = DEFAULT_PAYOUT_RULES.tokensPerHeavyCatch;

export interface PayoutScreenProps {
  /** The result of the session. */
  result: FishingSessionResult;
  /** The tokens of the session. */
  tokens: number;
  /** Starts the same mode and scope again. */
  onPlayAgain: () => void;
  /** How many questions were missed in the session. */
  missedCount?: number;
  /** Starts a calm retry of the missed questions (hidden when there is none). */
  onRetryMissed?: () => void;
  /** Goes back to the home screen. */
  onHome: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function PayoutScreen({
  result,
  tokens,
  onPlayAgain,
  missedCount = 0,
  onRetryMissed,
  onHome,
  reduceMotion,
}: PayoutScreenProps) {
  const cardScale = useSharedValue(0.9);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      cardScale.value = 1;
      return;
    }

    cardScale.value = withSpring(1, { damping: 14, stiffness: 120 });
    playSfxSequence('coin', Math.max(1, Math.min(8, Math.round(tokens / 4))));
    const timer = setTimeout(() => {
      setBurst((current) => current + 1);
    }, 320);
    return () => {
      clearTimeout(timer);
    };
  }, [tokens, reduceMotion, cardScale]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const biggest = result.biggest;

  const insets = useSafeAreaInsets();

  return (
    <GameBackground variant="ocean">
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <LightRays color={colors.gold} count={16} size={760} opacity={0.22} style={styles.rays} />

          <Animated.View entering={undefined} style={[styles.titleWrap, cardStyle]}>
            <Text style={styles.title}>PACK UP!</Text>
            <Text style={styles.subtitle}>The haul of the session</Text>
          </Animated.View>

          <Animated.View style={[styles.tokenCard, cardStyle]}>
            <Glow color={colors.gold} size={260} opacity={0.45} style={styles.tokenGlow} />
            <Text style={styles.tokenLabel}>TOKENS EARNED</Text>
            <TokenCounter
              value={tokens}
              startAt={0}
              size={54}
              duration={1100}
              accessibilityLabel={`${tokens} tokens`}
            />
            <Text style={styles.tokenHint}>the server pays the session out</Text>
          </Animated.View>

          <View style={styles.statRow}>
            <Stat label="Haul" value={formatLbs(result.haulLbs)} />
            <Stat label="Catches" value={`${result.catches}`} />
            <Stat label="Correct" value={`${result.correct}/${result.answered}`} />
          </View>

          {biggest === null ? null : (
            <GlassCard contentStyle={styles.biggest} tint={tierColor(biggest.tier)}>
              <Text style={styles.sectionTitle}>BIGGEST CATCH</Text>
              <View style={styles.biggestRow}>
                <Sprite assetId={biggest.assetId} size={72} />
                <View style={styles.biggestText}>
                  <Text style={styles.biggestName}>{biggest.name}</Text>
                  <Text style={[styles.biggestWeight, { color: tierColor(biggest.tier) }]}>
                    {formatLbs(biggest.lbs)}
                  </Text>
                </View>
              </View>
            </GlassCard>
          )}

          {result.critters.length === 0 ? null : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>CRITTERS CAUGHT</Text>
              <View style={styles.critterGrid}>
                {result.critters.map((critter, index) => (
                  <View
                    key={`${critter.critterId}-${index}`}
                    style={[
                      styles.critterChip,
                      { borderColor: tierColor(critter.tier) },
                    ]}
                  >
                    <Sprite assetId={critter.assetId} size={22} />
                    <View style={styles.critterText}>
                      <Text style={styles.critterName} numberOfLines={1}>
                        {critter.name}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {result.heavyCatches === 0 ? null : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>HEAVY CATCHES</Text>
              <Text style={styles.ticketText}>
                🪸 {result.heavyCatches} × {HEAVY_BONUS_TOKENS} tokens
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CATCHES BY TIER</Text>
            {CATCH_TIERS.map((tier) => (
              <View key={tier.id} style={styles.tierRow}>
                <View style={[styles.tierDot, { backgroundColor: tier.color }]} />
                <Text style={styles.tierName}>{tier.name}</Text>
                <Text style={styles.tierCount}>{result.byTier[tier.id] ?? 0}</Text>
              </View>
            ))}
          </View>

          {result.packTickets === 0 ? null : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PACK TICKETS</Text>
              <Text style={styles.ticketText}>🎟️ {result.packTickets} free Brain Buddies pack</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.actions}>
          {onRetryMissed === undefined ? null : (
            <GameButton
              label={`RETRY ${missedCount} MISSED`}
              variant="primary"
              size="lg"
              onPress={onRetryMissed}
            />
          )}
          <GameButton
            label="PLAY AGAIN"
            variant={onRetryMissed === undefined ? 'primary' : 'ghost'}
            size="lg"
            onPress={onPlayAgain}
          />
          <GameButton label="HOME" variant="ghost" size="lg" onPress={onHome} />
        </View>

        <Particles
          trigger={burst}
          count={40}
          colors={[colors.gold, '#fff7d6', '#38bdf8', '#ffffff']}
          size={13}
          distance={280}
          gravity={300}
          duration={1400}
          style={styles.confetti}
        />
      </View>
    </GameBackground>
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
  },
  content: {
    padding: 18,
    paddingBottom: 150,
    gap: 14,
  },
  rays: {
    top: 0,
    left: '50%',
    marginLeft: -380,
  },
  titleWrap: {
    alignItems: 'center',
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontFamily: fonts.title,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  tokenCard: {
    alignItems: 'center',
    borderRadius: radius.card,
    paddingVertical: 18,
    backgroundColor: 'rgba(12, 18, 38, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.35)',
    overflow: 'hidden',
  },
  tokenGlow: {
    position: 'absolute',
    top: -60,
  },
  tokenLabel: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 16,
    fontFamily: fonts.titleSemi,
    letterSpacing: 2.4,
  },
  tokenHint: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    borderRadius: radius.tile,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(12, 18, 38, 0.66)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: fonts.titleSemi,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.title,
    marginTop: 2,
  },
  section: {
    borderRadius: radius.tile,
    padding: 14,
    gap: 6,
    backgroundColor: 'rgba(12, 18, 38, 0.66)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 16,
    fontFamily: fonts.titleSemi,
    letterSpacing: 2,
    marginBottom: 4,
  },
  biggest: {
    gap: 8,
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
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.title,
  },
  biggestWeight: {
    fontSize: 15,
    fontFamily: fonts.titleSemi,
  },
  critterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  critterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    maxWidth: '48%',
  },
  critterText: {
    flexShrink: 1,
  },
  critterName: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.titleSemi,
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
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
  },
  tierCount: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.title,
  },
  ticketText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.titleSemi,
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: 'rgba(6, 10, 24, 0.92)',
  },
  confetti: {
    top: '10%',
    bottom: '60%',
  },
});
