import {
  CRITTERS,
  DAILY_GOAL_QUESTIONS,
  localDay,
  settleMissedDays,
  weeklyGoal,
  type StreakState,
} from '@study-app/core';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { refreshReminderContent } from '@/notifications';
import { critterArt } from '@/packs/critterArt';
import { colors, fonts, radius, spacing } from '@/theme';

import { readCompanion, subscribeCompanion } from './companion';
import { readGoalDays, readStreak, subscribeStreak } from './streak';

/**
 * The daily streak card of the home screen.
 *
 * A big number (the days in a row), a bar for today's goal and the shields
 * that cover a missed day. It also keeps the scheduled reminders in step with
 * the streak (the evening nudge is skipped once today's goal is done).
 */
export function StreakCard() {
  const [state, setState] = useState<StreakState | null>(null);
  const [goalDays, setGoalDays] = useState<string[]>([]);
  const [companionId, setCompanionId] = useState<string | null>(null);

  useEffect(() => {
    void readCompanion().then(setCompanionId);
    return subscribeCompanion(setCompanionId);
  }, []);

  useEffect(() => {
    let live = true;
    void readStreak().then((loaded) => {
      if (live) {
        setState(loaded);
      }
    });
    void readGoalDays().then((days) => {
      if (live) {
        setGoalDays(days);
      }
    });
    const stop = subscribeStreak((next) => {
      if (live) {
        setState(next);
        void readGoalDays().then((days) => {
          if (live) {
            setGoalDays(days);
          }
        });
      }
    });
    return () => {
      live = false;
      stop();
    };
  }, []);

  const view = state === null ? null : settleMissedDays(state, localDay(new Date()));

  useEffect(() => {
    if (view === null) {
      return;
    }
    void refreshReminderContent({
      streak: view.current,
      goalDoneToday: view.goalDone,
      remaining: view.remaining,
    });
  }, [view?.current, view?.goalDone, view?.remaining]);

  if (view === null) {
    return null;
  }

  const companion = CRITTERS.find((critter) => critter.id === companionId) ?? null;
  const companionArt = companion === null ? null : critterArt(companion);
  const week = weeklyGoal(goalDays, localDay(new Date()));
  const done = DAILY_GOAL_QUESTIONS - view.remaining;
  const ratio = Math.min(1, done / DAILY_GOAL_QUESTIONS);

  const headline = view.goalDone
    ? 'Goal done for today'
    : view.current > 0
      ? `${view.remaining} more keeps day ${view.current + 1}`
      : `Answer ${view.remaining} to start a streak`;

  return (
    <View
      style={[styles.card, view.goalDone ? styles.cardDone : null]}
      accessible
      accessibilityLabel={`${view.current} day streak. ${done} of ${DAILY_GOAL_QUESTIONS} questions today. ${view.freezes} shields.`}
      testID="streak-card"
    >
      <View style={styles.count}>
        <Text style={[styles.number, view.current === 0 ? styles.numberIdle : null]}>
          {view.current}
        </Text>
        <Text style={styles.unit}>{view.current === 1 ? 'DAY' : 'DAYS'}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.headline} numberOfLines={1}>
          {headline}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
        <Text style={styles.sub}>
          {done}/{DAILY_GOAL_QUESTIONS} questions today
          {state !== null && state.best > view.current ? ` · best ${state.best}` : ''}
        </Text>
        <Text style={styles.sub}>
          This week {week.done}/{week.target}
          {week.chestReady ? ' · chest earned' : ' · 5 days earns 2 tickets'}
        </Text>
      </View>

      {companionArt === null ? null : (
        <Image
          source={companionArt}
          style={styles.companion}
          resizeMode="contain"
          accessibilityLabel={`${companion?.name ?? 'Companion'}, your companion`}
        />
      )}

      <View style={styles.shields} accessibilityLabel={`${view.freezes} of 2 shields`}>
        {[0, 1].map((index) => (
          <View
            key={index}
            style={[styles.shield, index < view.freezes ? styles.shieldOn : styles.shieldOff]}
          />
        ))}
        <Text style={styles.shieldLabel}>SHIELDS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(14, 16, 24, 0.9)',
  },
  cardDone: {
    borderColor: 'rgba(251, 191, 36, 0.55)',
  },
  count: {
    alignItems: 'center',
    minWidth: 56,
  },
  number: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 38,
    lineHeight: 42,
  },
  numberIdle: {
    color: colors.textMuted,
  },
  unit: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  middle: {
    flex: 1,
    gap: 6,
  },
  headline: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 250, 252, 0.14)',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.gold,
  },
  sub: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  companion: {
    width: 52,
    height: 52,
  },
  shields: {
    alignItems: 'center',
    gap: 4,
  },
  shield: {
    width: 16,
    height: 18,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
  },
  shieldOn: {
    backgroundColor: '#38bdf8',
  },
  shieldOff: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  shieldLabel: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 8,
    letterSpacing: 1.2,
  },
});
