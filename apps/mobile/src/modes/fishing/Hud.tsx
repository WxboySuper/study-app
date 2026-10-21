import type { CatchTier, FishingSession } from '@study-app/core';
import { CATCH_TIERS, POWERUPS } from '@study-app/core';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';

import { tierColor } from './assets';

/**
 * The HUD of the fishing mode (docs/design/fishing.md §9).
 *
 * Top left: the haul in lbs (with a roll-up). Top right: the End button.
 * Top centre: the cards answered, the streak, the cards that are left, the
 * lure rank pips and the powerup that is held. Below it: the log of the
 * last five catches.
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
  /** Called when the player wants to end the session. */
  onEnd: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function Hud({ session, remaining, biggestTier, onEnd, reduceMotion }: HudProps) {
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

  const log = session.log.slice(-5);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.haulBox}>
          <Text style={styles.haulLabel}>Haul</Text>
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

        <View style={styles.stats} pointerEvents="none">
          <Text style={styles.stat}>{session.answered} answered</Text>
          <Text style={styles.stat}>{session.streak > 0 ? `🔥 ${session.streak}` : '—'}</Text>
          <Text style={styles.stat}>{remaining} left</Text>
          <View style={styles.pips} accessibilityLabel={`Lure rank ${session.roll.lureRank}`}>
            {[1, 2, 3, 4, 5].map((rank) => (
              <View
                key={rank}
                style={[
                  styles.pip,
                  rank <= session.roll.lureRank ? styles.pipOn : styles.pipOff,
                ]}
              />
            ))}
          </View>
          {powerup === null ? null : (
            <Text style={styles.powerup}>
              {powerup.emoji} {powerup.name}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onEnd}
          style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
        >
          <Text style={styles.endLabel}>End</Text>
        </Pressable>
      </View>

      {log.length === 0 ? null : (
        <View style={styles.log} pointerEvents="none">
          {log.map((entry, index) => (
            <View
              key={`${entry.id}-${index}`}
              style={[styles.logItem, { borderColor: tierColor(entry.tier) }]}
            >
              <Text style={styles.logEmoji}>{entry.emoji}</Text>
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
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  haulBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  haulLabel: {
    color: '#94a3b8',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  haulValue: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    padding: 0,
    minWidth: 120,
  },
  stats: {
    alignItems: 'center',
    gap: 2,
  },
  stat: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(15, 23, 42, 0.8)',
    textShadowRadius: 4,
  },
  pips: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  pip: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pipOn: {
    backgroundColor: '#ffd166',
  },
  pipOff: {
    backgroundColor: 'rgba(248, 250, 252, 0.3)',
  },
  powerup: {
    color: '#ffd166',
    fontSize: 11,
    fontWeight: '700',
  },
  endButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  endButtonPressed: {
    opacity: 0.7,
  },
  endLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  log: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  logEmoji: {
    fontSize: 14,
  },
  logWeight: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
  },
});
