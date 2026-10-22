import type { CatchTier, FishingSession, MasteryProgress } from '@study-app/core';
import { CATCH_TIERS, LURE_RANKS, POWERUPS, formatLbs } from '@study-app/core';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
 *
 * In mastery mode the bottom bar counts the mastered questions ("3/12
 * mastered") and the dots under it show how many right answers every
 * question of the deck has.
 */


/**
 * How many questions of the deck get their own dots in the HUD.
 *
 * A deck with more than twenty questions does not fit on the screen, so it
 * collapses into one compact bar with an "X/Y mastered" label instead.
 */
const MAX_MASTERY_DOTS = 20;

export interface HudProps {
  /** The session, for the counters. */
  session: FishingSession;
  /** How many cards are still to be asked. */
  remaining: number;
  /** `true` when the session plays in mastery mode. */
  mastery?: boolean;
  /** How many questions of the scope are mastered. */
  mastered?: number;
  /** How many questions the scope holds. */
  total?: number;
  /**
   * The progress of every question of the scope.
   *
   * The mastery view draws one dot per right answer of every question.
   */
  progress?: readonly MasteryProgress[];
  /** The question that is on the screen (its dots are the lit ones). */
  currentQuestionId?: string | null;
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
  mastery = false,
  mastered = 0,
  total = 0,
  progress = [],
  currentQuestionId = null,
  biggestTier,
  tokens,
  onEnd,
}: HudProps) {
  const powerup = session.roll.powerup === null
    ? null
    : POWERUPS.find((entry) => entry.id === session.roll.powerup) ?? null;

  // The lure of the session (the art of the rank, not an emoji).
  const lure = LURE_RANKS.find((entry) => entry.rank === session.roll.lureRank) ?? LURE_RANKS[0]!;

  const log = session.log.slice(-5);

  /**
   * The dots of the mastery view.
   *
   * Every question of the deck has its own dots (one per right answer it
   * needs), but a huge deck does not fit on the screen: the dots of the
   * question that is on the screen always show up.
   */
  const { dots, hidden } = useMemo(() => {
    const visible = progress.slice(0, MAX_MASTERY_DOTS);
    const current = progress.find((entry) => entry.id === currentQuestionId);

    if (current === undefined || visible.some((entry) => entry.id === current.id)) {
      return { dots: visible, hidden: progress.length - visible.length };
    }

    return {
      dots: [...visible.slice(0, MAX_MASTERY_DOTS - 1), current],
      hidden: progress.length - visible.length,
    };
  }, [progress, currentQuestionId]);

  const compactMastery = progress.length > MAX_MASTERY_DOTS;
  const masteryRatio = total > 0 ? Math.max(0, Math.min(1, mastered / total)) : 0;

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
          <Text
            style={[
              styles.haulValue,
              biggestTier === null ? null : { color: tierColor(biggestTier) },
            ]}
            accessibilityLabel={`Haul: ${formatLbs(session.haulLbs)}`}
          >
            {formatLbs(session.haulLbs)}
          </Text>
        </View>

        <View style={styles.stats}>
          <Text style={styles.stat}>{session.answered} answered</Text>
          {mastery ? (
            <Text style={styles.stat}>
              {mastered}/{total} mastered
            </Text>
          ) : (
            <Text style={styles.stat}>{remaining} left</Text>
          )}
        </View>
      </View>

      {mastery && progress.length > 0 ? (
        compactMastery ? (
          <View
            style={styles.masteryBarRow}
            pointerEvents="none"
            accessible
            accessibilityLabel={`${mastered} of ${total} questions mastered`}
          >
            <View style={styles.masteryTrack}>
              <View style={[styles.masteryFill, { width: `${Math.round(masteryRatio * 100)}%` }]} />
            </View>
            <Text style={styles.masteryBarLabel}>
              {mastered}/{total} mastered
            </Text>
          </View>
        ) : (
          <View style={styles.masteryRow} pointerEvents="none">
            {dots.map((entry) => (
              <View
                key={entry.id}
                style={styles.masteryDots}
                accessible
                accessibilityLabel={`${entry.correct} of ${entry.required} right answers`}
              >
                {Array.from({ length: entry.required }, (_, index) => (
                  <View
                    key={`${entry.id}-${index}`}
                    style={[
                      styles.masteryDot,
                      index < entry.correct ? styles.masteryDotOn : styles.masteryDotOff,
                      entry.id === currentQuestionId ? styles.masteryDotCurrent : null,
                    ]}
                  />
                ))}
              </View>
            ))}

            {hidden > 0 ? <Text style={styles.masteryMore}>+{hidden}</Text> : null}
          </View>
        )
      ) : null}

      {log.length === 0 ? null : (
        <View style={styles.logRow} pointerEvents="none">
          <Text style={styles.logTitle}>PREVIOUS CATCHES</Text>
          <View style={styles.log}>
            {log.map((entry, index) => (
              <View
                key={`${entry.id}-${index}`}
                style={[styles.logItem, { borderColor: tierColor(entry.tier) }]}
              >
                <Sprite assetId={entry.assetId} size={18} />
                <Text numberOfLines={1} style={styles.logName}>
                  {shortName(entry.name)}
                </Text>
                <Text style={styles.logWeight}>{formatLbs(entry.lbs)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** A short name for the tight row of previous catches. */
function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 12 ? `${first.slice(0, 11)}…` : first;
}

/** The colour of the tiers, exported for the reveal card. */
export const TIER_COLORS = CATCH_TIERS.reduce<Record<string, string>>((colors, tier) => {
  colors[tier.id] = tier.color;
  return colors;
}, {});

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
  masteryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    paddingTop: 2,
  },
  masteryBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 2,
  },
  masteryTrack: {
    flex: 1,
    maxWidth: 210,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 250, 252, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  masteryFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  masteryBarLabel: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  masteryDots: {
    flexDirection: 'row',
    gap: 3,
  },
  masteryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  masteryDotOn: {
    backgroundColor: colors.gold,
  },
  masteryDotOff: {
    backgroundColor: 'rgba(248, 250, 252, 0.28)',
  },
  masteryDotCurrent: {
    borderWidth: 1,
    borderColor: colors.text,
  },
  masteryMore: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    alignSelf: 'center',
  },
  logRow: {
    gap: 4,
  },
  logTitle: {
    color: 'rgba(255,255,255,0.66)',
    fontFamily: fonts.titleSemi,
    fontSize: 8,
    letterSpacing: 1.4,
    textAlign: 'right',
  },
  log: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
    maxWidth: 150,
  },
  logName: {
    flexShrink: 1,
    color: '#e2e8f0',
    fontFamily: fonts.bodySemi,
    fontSize: 10,
  },
  logWeight: {
    color: '#e2e8f0',
    fontFamily: fonts.titleSemi,
    fontSize: 11,
  },
});
