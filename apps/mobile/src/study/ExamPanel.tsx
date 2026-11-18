import {
  daysUntil,
  examHeadline,
  examPace,
  localDay,
  type ExamPlan,
  type Readiness,
} from '@study-app/core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openLocalStore } from '@/db/local';
import type { LocalClass } from '@/db/types';
import { colors, fonts, radius, spacing } from '@/theme';

import { clearExam, readClassReadiness, readExams, saveExam } from './exams';

/** A plan with what the card shows about it. */
interface ExamRow {
  plan: ExamPlan;
  name: string;
  daysLeft: number;
  readiness: Readiness;
}

/** "Fri, Dec 12" for a YYYY-MM-DD day. */
function prettyDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** The day `days` after `from` (YYYY-MM-DD). */
function addDays(from: string, days: number): string {
  const [year, month, date] = from.split('-').map(Number);
  return localDay(new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days));
}

/** The later of two YYYY-MM-DD days. */
function laterDay(a: string, b: string): string {
  return a < b ? b : a;
}

/**
 * The exam planner of the home screen.
 *
 * A class can have an exam date. The card then shows how ready the class is
 * (a mix of mastered cards and how well the rest is remembered), how many days
 * are left and how many new cards a day it takes to be ready.
 */
export function ExamPanel() {
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [classes, setClasses] = useState<LocalClass[]>([]);
  const [editing, setEditing] = useState(false);
  const [classId, setClassId] = useState<string | null>(null);
  const [day, setDay] = useState(() => addDays(localDay(new Date()), 14));

  const load = useCallback(async () => {
    try {
      const store = await openLocalStore();
      const known = await store.listClasses();
      const plans = (await readExams()).filter((plan) =>
        known.some((entry) => entry.id === plan.classId),
      );
      const today = localDay(new Date());
      const next: ExamRow[] = [];
      for (const plan of plans) {
        next.push({
          plan,
          name: known.find((entry) => entry.id === plan.classId)?.name ?? 'Class',
          daysLeft: daysUntil(plan.date, today),
          readiness: await readClassReadiness(plan.classId),
        });
      }
      next.sort((a, b) => a.plan.date.localeCompare(b.plan.date));
      setClasses(known);
      setRows(next);
    } catch {
      // The planner is an extra: the home screen works without it.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = localDay(new Date());
  const upcoming = rows.filter((row) => row.daysLeft >= 0);
  const past = rows.filter((row) => row.daysLeft < 0);

  const save = () => {
    if (classId === null) {
      return;
    }
    void saveExam(classId, day).then(() => {
      setEditing(false);
      setClassId(null);
      return load();
    });
  };

  const remove = (id: string) => {
    void clearExam(id).then(load);
  };

  if (classes.length === 0 && rows.length === 0) {
    return null;
  }

  return (
    <View style={styles.card} testID="exam-panel">
      <View style={styles.head}>
        <Text style={styles.title}>EXAMS</Text>
        {editing ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add an exam date"
            onPress={() => {
              setEditing(true);
              setClassId(classId ?? classes[0]?.id ?? null);
            }}
            style={styles.addChip}
          >
            <Text style={styles.addText}>+ ADD EXAM</Text>
          </Pressable>
        )}
      </View>

      {upcoming.length === 0 && !editing ? (
        <Text style={styles.empty}>Add a test date to track how ready you are.</Text>
      ) : null}

      {upcoming.map((row) => {
        const pace = examPace(row.readiness, row.daysLeft);
        return (
          <View key={row.plan.classId} style={styles.exam}>
            <View style={styles.examTop}>
              <Text style={styles.examName} numberOfLines={1}>
                {row.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove the exam of ${row.name}`}
                onPress={() => {
                  remove(row.plan.classId);
                }}
                hitSlop={10}
              >
                <Text style={styles.remove}>REMOVE</Text>
              </Pressable>
            </View>
            <Text style={styles.headline}>{examHeadline(row.readiness.percent, row.daysLeft)}</Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${row.readiness.percent}%` },
                  row.readiness.percent >= 80 ? styles.fillGood : null,
                ]}
              />
            </View>
            <Text style={styles.sub}>
              {prettyDay(row.plan.date)} · {pace.label}
            </Text>
          </View>
        );
      })}

      {past.map((row) => (
        <View key={row.plan.classId} style={styles.pastRow}>
          <Text style={styles.sub} numberOfLines={1}>
            {row.name} exam was {prettyDay(row.plan.date)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              remove(row.plan.classId);
            }}
            hitSlop={10}
          >
            <Text style={styles.remove}>CLEAR</Text>
          </Pressable>
        </View>
      ))}

      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.label}>Class</Text>
          <View style={styles.chips}>
            {classes.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityState={{ selected: classId === entry.id }}
                onPress={() => {
                  setClassId(entry.id);
                }}
                style={[styles.chip, classId === entry.id ? styles.chipOn : null]}
              >
                <Text style={styles.chipText} numberOfLines={1}>
                  {entry.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Exam date</Text>
          <View style={styles.stepper}>
            <Step
              label="-1 week"
              onPress={() => {
                setDay((d) => laterDay(addDays(d, -7), today));
              }}
            />
            <Step
              label="-1 day"
              onPress={() => {
                setDay((d) => laterDay(addDays(d, -1), today));
              }}
            />
            <Text style={styles.dayValue}>{prettyDay(day)}</Text>
            <Step
              label="+1 day"
              onPress={() => {
                setDay((d) => addDays(d, 1));
              }}
            />
            <Step
              label="+1 week"
              onPress={() => {
                setDay((d) => addDays(d, 7));
              }}
            />
          </View>
          <Text style={styles.sub}>In {daysUntil(day, today)} days</Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditing(false);
              }}
              style={[styles.button, styles.buttonGhost]}
            >
              <Text style={styles.buttonText}>CANCEL</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={save}
              disabled={classId === null}
              style={[styles.button, styles.buttonPrimary]}
            >
              <Text style={styles.buttonText}>SAVE</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.step}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(14, 16, 24, 0.9)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 12,
    letterSpacing: 2,
  },
  addChip: {
    borderRadius: radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(123, 97, 255, 0.28)',
  },
  addText: { color: colors.text, fontFamily: fonts.title, fontSize: 11, letterSpacing: 1 },
  empty: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18 },
  exam: {
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  examTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  examName: { flex: 1, color: colors.text, fontFamily: fonts.title, fontSize: 16 },
  remove: { color: colors.textMuted, fontFamily: fonts.titleSemi, fontSize: 10, letterSpacing: 1.2 },
  headline: { color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 14 },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(248,250,252,0.14)',
  },
  fill: { height: '100%', borderRadius: 4, backgroundColor: '#fb923c' },
  fillGood: { backgroundColor: '#4ade80' },
  sub: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12 },
  pastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editor: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  label: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    maxWidth: 200,
    borderRadius: radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: { backgroundColor: 'rgba(123, 97, 255, 0.55)' },
  chipText: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: {
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stepText: { color: colors.text, fontFamily: fonts.titleSemi, fontSize: 11 },
  dayValue: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 14,
  },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  button: { borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10 },
  buttonGhost: { backgroundColor: 'rgba(255,255,255,0.08)' },
  buttonPrimary: { backgroundColor: '#7b61ff' },
  buttonText: { color: '#ffffff', fontFamily: fonts.title, fontSize: 12, letterSpacing: 1 },
});
