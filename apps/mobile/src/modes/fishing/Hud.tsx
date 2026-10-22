import type { CatchTier, FishingSession } from '@study-app/core';
import { CATCH_TIERS, LURE_RANKS, POWERUPS } from '@study-app/core';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, radius } from '@/theme';
import { GlassCard, TokenCounter } from '@/ui';

import { tierColor } from './assets';
import { Sprite } from './Sprite';

/**
 * The HUD of the fishing mode (docs/design/fishing.md §9).
 *
 * The wallet and the lure sit at the top, the streak burns next to them and
 * the haul counts itself up under the top bar. The log of the last five
 * catches keeps the eyes on the water.
 */

/** A text input that can be animated (the number roll-up). */
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface HudProps {
  /** The session, for the counters. */
  session: FishingSession;
  /** How many cards are still to be asked. */
  remaining: number;
  /** The tier of the biggest catch, for the colour of the counter. */
  biggestTier: CatchTier | null;
  /** The tokens of the player. */
  tokens: number;
  /** Called when the player wants to end the session. */
  onEnd: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function Hud({
  session,
  remaining,
  biggestTier,
  tokens,
  onEnd,
  reduceMotion,
}: HudProps) {
  const haul = useSharedValue(session.haulLbs);

  useEffect(() => {
    if (haul.value === session.haulLbs) {
      return;
    }
    haul.value = reduceMotion
      ? session.haulLbs
      : withSpring(session.haulLbs, { damping: 16, stiffness: 120, mass: 0.6 });
  }, [haul, session.haulLbs, reduceMotion]);

  const haulProps = useAnimatedProps(() => ({
    text: `${Math.round(haul.value).toLocaleString('en-US')} lbs`,
    defaultValue: `${Math.round(haul.value).toLocaleString('en-US')} lbs`,
  }));

  const powerup = session.roll.powerup === null
    ? null
    : POWERUPS.find((entry) => entry.id === session.roll.powerup) ?? null;

  // The lure of the session (the art of the rank, not an emoji).
  const lure = LURE_RANKS.find((entry) => entry.rank === session.roll.lureRank) ?? LURE_RANKS[0]!;

  const log = session.log.slice(-5);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        <GlassCard borderRadius={radius.chip} elevated={false} contentStyle={styles.walletChip}>
          <TokenCounter value={tokens} size={17} />
        </GlassCard>

        <View style={styles.center} pointerEvents="none">
          <View style={styles.chipRow}>
            <View style={styles.lureChip}>
              <Sprite assetId={lure.assetId} size={20} />
              <Text style={styles.lureLabel}>{lure.name.toUpperCase()}</Text>
              <View style={styles.pips} accessibilityLabel={`Lure rank ${session.roll.lureRank}`}>
                {[1, 2, 3, 4, 5].map((rank) => (
                  <View
                    key={rank}
                    style={[styles.pip, rank <= session.roll.lureRank ? styles.pipOn : styles.pipOff]}
                  />
                ))}
              </View>
            </View>

            {session.streak > 0 ? (
              <View style={styles.streakChip}>
                <Text style={styles.flame}>🔥</Text>
                <Text style={styles.streakText}>{session.streak}</Text>
              </View>
            ) : null}

            {powerup === null ? null : (
              <View style={styles.powerupChip}>
                <Sprite assetId={powerup.assetId} size={18} />
                <Text style={styles.powerupText}>{powerup.name}</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End the session"
          onPress={onEnd}
          style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
        >
          <Text style={styles.endLabel}>END</Text>
        </Pressable>
      </View>

      <View style={styles.bottomRow} pointerEvents="none">
        <View style={styles.haulBox}>
          <Text style={styles.haulLabel}>HAUL</Text>
          <AnimatedTextInput
            editable={false}
            animatedProps={haulProps}
            underlineColorAndroid="transparent"
            style={[
              styles.haulValue,
              biggestTier === null ? null : { color: tierColor(biggestTier) },
            ]}
            accessibilityLabel={`Haul: ${Math.round(session.haulLbs).toLocaleString('en-US')} lbs`}
          />
        </View>

        <View style={styles.stats}>
          <Text style={styles.stat}>{session.answered} answered</Text>
          <Text style={styles.stat}>{remaining} left</Text>
        </View>
      </View>

      {log.length === 0 ? null : (
        <View style={styles.log} pointerEvents="none">
          {log.map((entry, index) => (
            <View
              key={`${entry.id}-${index}`}
              style={[styles.logItem, { borderColor: tierColor(entry.tier) }]}
            >
              <Sprite assetId={entry.assetId} size={18} />
              <Text style={styles.logWeight}>{formatShort(entry.lbs)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** A short weight for the catch log ("12.3k"). */
function formatShort(lbs: number): string {
  if (lbs >= 1_000_000) {
    return `${(lbs / 1_000_000).toFixed(1)}M`;
  }
  if (lbs >= 1_000) {
    return `${(lbs / 1_000).toFixed(1)}k`;
  }
  return `${Math.round(lbs)}`;
}

/** The colour of the tiers, exported for the reveal card. */
export const TIER_COLORS = CATCH_TIERS.reduce<Record<string, string>>((colors, tier) => {
  colors[tier.id] = tier.color;
  return colors;
}, {});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  lureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(8, 16, 34, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  lureLabel: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  pips: {
    flexDirection: 'row',
    gap: 3,
  },
  pip: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pipOn: {
    backgroundColor: colors.gold,
  },
  pipOff: {
    backgroundColor: 'rgba(248, 250, 252, 0.28)',
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(239, 71, 111, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 128, 0.55)',
  },
  flame: {
    fontSize: 13,
  },
  streakText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 14,
  },
  powerupChip: {
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(8, 16, 34, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  powerupText: {
    color: colors.gold,
    fontFamily: fonts.titleSemi,
    fontSize: 11,
  },
  endButton: {
    backgroundColor: 'rgba(8, 16, 34, 0.72)',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  endButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  endLabel: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  haulBox: {
    alignSelf: 'flex-start',
    borderRadius: radius.tile,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(8, 16, 34, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  haulLabel: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 9,
    letterSpacing: 1.6,
  },
  haulValue: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
    padding: 0,
    width: 104,
  },
  stats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  stat: {
    color: 'rgba(255,255,255,0.86)',
    fontFamily: fonts.titleSemi,
    fontSize: 12,
    textShadowColor: 'rgba(6, 12, 28, 0.9)',
    textShadowRadius: 4,
  },
  log: {
    flexDirection: 'row',
    gap: 6,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(8, 16, 34, 0.6)',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  logWeight: {
    color: '#e2e8f0',
    fontFamily: fonts.titleSemi,
    fontSize: 11,
  },
});
