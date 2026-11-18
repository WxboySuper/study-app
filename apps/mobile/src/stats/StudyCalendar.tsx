import type { HistoryPoint } from '@study-app/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

/** The colours of the five levels of a day (none, light ... heavy). */
const LEVELS = ['rgba(255,255,255,0.07)', '#4c3a9e', '#6d55d8', '#8f7bff', '#fbbf24'] as const;

/** 0 to 4 for the number of answers of a day. */
export function levelOf(reviews: number): number {
  if (reviews <= 0) return 0;
  if (reviews < 10) return 1;
  if (reviews < 25) return 2;
  if (reviews < 60) return 3;
  return 4;
}

/**
 * A calendar of the study days (the last weeks, one square per day).
 *
 * Columns are weeks, rows are Sunday to Saturday, the newest week is on the
 * right. A gold square is a heavy day. The goal of the streak is ten answers,
 * so any square from the second shade up is a day that counted.
 */
export function StudyCalendar({ points }: { points: readonly HistoryPoint[] }) {
  if (points.length === 0) {
    return null;
  }

  // Pad the front so the first column starts on a Sunday.
  const firstWeekday = new Date(`${points[0]!.day}T00:00:00`).getDay();
  const cells: (HistoryPoint | null)[] = [...Array<null>(firstWeekday).fill(null), ...points];
  const weeks: (HistoryPoint | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const activeDays = points.filter((point) => point.reviews > 0).length;
  const total = points.reduce((sum, point) => sum + point.reviews, 0);

  return (
    <View testID="stats-calendar" accessible accessibilityLabel={`${activeDays} study days, ${total} answers`}>
      <View style={styles.grid}>
        {weeks.map((week, index) => (
          <View key={index} style={styles.column}>
            {Array.from({ length: 7 }, (_, row) => {
              const point = week[row] ?? null;
              return (
                <View
                  key={row}
                  style={[
                    styles.cell,
                    point === null
                      ? styles.empty
                      : { backgroundColor: LEVELS[levelOf(point.reviews)] },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        {activeDays} study {activeDays === 1 ? 'day' : 'days'} · {total} answers
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
  },
  column: {
    gap: 4,
  },
  cell: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  empty: {
    backgroundColor: 'transparent',
  },
  caption: {
    marginTop: 10,
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    textAlign: 'center',
  },
});
