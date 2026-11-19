import type { CatchTier, FishingSession, SessionStage, SessionStageCounts } from '@study-app/core';
import { CATCH_TIERS, HEAT_STEP, LURE_RANKS, MAX_LURE_RANK, POWERUPS, formatLbs } from '@study-app/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme';
import { TokenCounter } from '@/ui';

import { tierColor } from './assets';
import { Sprite } from './Sprite';
import { STAGE_COLORS, STAGE_LABELS } from './stage';

/**
 * The HUD of the fishing mode (docs/design/fishing.md §9).
 *
 * The wallet and the lure sit at the top, the streak burns next to them and
 * the haul counts itself up under the top bar. The log of the last five
 * catches keeps the eyes on the water.
 *
 * In mastery mode the HUD shows *today's* queue the way Anki's study screen
 * does: New / Learning / Due counts (blue / red / green) with the bucket of
 * the current question underlined, and a bar of today's progress. The
 * whole-deck mastered count lives on the deck screen and in Stats.
 */

export interface HudProps {
  /** The session, for the counters. */
  session: FishingSession;
  /** How many cards are still to be asked. */
  remaining: number;
  /** `true` when the session plays in mastery mode. */
  mastery?: boolean;
  /** Today's queue of a mastery session, by stage. */
  today?: SessionStageCounts | null;
  /** The bucket the question on the screen came from. */
  currentStage?: SessionStage | null;
  /** The tier of the biggest catch, for the colour of the counter. */
  biggestTier: CatchTier | null;
  /** The tokens of the player. */
  tokens: number;
  /** Called when the player wants to end the session. */
  onEnd: () => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
  /** `true` while a question is on the screen: the plate gives its room to the note. */
  compact?: boolean;
  /** The daily limit of a mastery session, as a line of text. */
  limitNote?: string | null;
}

export function Hud({
  session,
  remaining: _remaining,
  mastery = false,
  today = null,
  currentStage = null,
  biggestTier,
  tokens,
  onEnd,
  compact = false,
  limitNote = null,
}: HudProps) {
  const powerup = session.roll.powerup === null
    ? null
    : POWERUPS.find((entry) => entry.id === session.roll.powerup) ?? null;

  // The lure of the session (the art of the rank, not an emoji).
  const lure = LURE_RANKS.find((entry) => entry.rank === session.roll.lureRank) ?? LURE_RANKS[0]!;

  const log = session.log.slice(-5);

  const todayRatio =
    today !== null && today.total > 0 ? Math.max(0, Math.min(1, today.done / today.total)) : 0;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.plate} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.walletChip}>
          <TokenCounter value={tokens} size={17} />
        </View>

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

            {session.streak > 0 || session.roll.heat === true ? (
              <View style={styles.streakChip}>
                <Text style={styles.flame}>🔥</Text>
                <Text style={styles.streakText}>{session.streak}</Text>
                {session.roll.heat === true && session.roll.lureRank < MAX_LURE_RANK ? (
                  <Text style={styles.heatText} testID="heat-meter">
                    {session.streak % HEAT_STEP}/{HEAT_STEP}
                  </Text>
                ) : null}
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
          hitSlop={{ top: 8, bottom: 12, left: 12, right: 8 }}
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

        <Text style={styles.stat}>{session.answered} answered</Text>
      </View>

      {mastery && today !== null ? (
        <View
          style={styles.todayBox}
          pointerEvents="none"
          testID="mastery-today"
          accessible
          accessibilityLabel={`Today: ${today.new} new, ${today.learning} learning, ${today.review} due left. ${today.done} of ${today.total} done.`}
        >
          <View style={styles.todayCounts}>
            <Text style={styles.todayTitle}>TODAY</Text>
            {(['new', 'learning', 'review'] as const).map((stage) => (
              <View key={stage} style={styles.todayCount} testID={`mastery-today-${stage}`}>
                <Text
                  style={[
                    styles.todayValue,
                    { color: STAGE_COLORS[stage] },
                    currentStage === stage ? [styles.todayCurrent, { borderBottomColor: STAGE_COLORS[stage] }] : null,
                  ]}
                >
                  {today[stage]}
                </Text>
                <Text style={styles.todayLabel}>{STAGE_LABELS[stage]}</Text>
              </View>
            ))}
          </View>
          <View style={styles.masteryBarRow}>
            <View style={styles.masteryTrack}>
              <View style={[styles.masteryFill, { width: `${Math.round(todayRatio * 100)}%` }]} />
            </View>
            <Text style={styles.masteryBarLabel}>
              {today.done}/{today.total} done today
            </Text>
          </View>
          {limitNote === null || compact ? null : <Text style={styles.limitNote}>{limitNote}</Text>}
        </View>
      ) : null}

      {log.length === 0 || compact ? null : (
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
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  plate: {
    gap: 8,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(14, 16, 24, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 8,
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
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.07)',
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
  heatText: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.titleSemi,
    fontSize: 10,
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
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  haulBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
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
    minWidth: 104,
  },
  stats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  stat: {
    color: 'rgba(255,255,255,0.86)',
    fontFamily: fonts.titleSemi,
    fontSize: 12,
  },
  todayBox: {
    alignSelf: 'stretch',
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  todayCounts: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  todayTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 0.8,
    alignSelf: 'center',
  },
  todayCount: {
    alignItems: 'center',
  },
  todayValue: {
    fontFamily: fonts.titleSemi,
    fontSize: 18,
    lineHeight: 22,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  todayCurrent: {
    borderBottomWidth: 2,
  },
  todayLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.titleSemi,
    fontSize: 9,
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
  limitNote: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.bodySemi,
    fontSize: 10,
  },
  logRow: {
    gap: 4,
  },
  logTitle: {
    color: 'rgba(255,255,255,0.66)',
    fontFamily: fonts.titleSemi,
    fontSize: 8,
    letterSpacing: 1.4,
  },
  log: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
