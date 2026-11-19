import {
  daysUntil,
  examDeckIds,
  examHeadline,
  examPace,
  localDay,
  type ExamPlan,
  type Readiness,
} from '@study-app/core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { openLocalStore } from '@/db/local';
import type { LocalClass, LocalSet } from '@/db/types';
import { colors, fonts, radius, spacing } from '@/theme';

import { clearExam, newExamId, readExamReadiness, readExams, saveExam } from './exams';

/** An exam with what the card shows about it. */
interface ExamRow {
  plan: ExamPlan;
  name: string;
  className: string | null;
  deckIds: string[];
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
 * An exam is its own thing: a name, a day and the decks that actually matter
 * for it. It can sit in a class (a class can have several exams). The card
 * shows how ready the player is for those decks only, and one button studies
 * exactly them, so the decks never have to be picked again.
 */
export function ExamPanel({ onStudy }: { onStudy?: (deckIds: string[], name: string) => void }) {
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [classes, setClasses] = useState<LocalClass[]>([]);
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [editing, setEditing] = useState(false);
  const [examId, setExamId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [classId, setClassId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [day, setDay] = useState(() => addDays(localDay(new Date()), 14));

  const load = useCallback(async () => {
    try {
      const store = await openLocalStore();
      const [knownClasses, knownSets] = await Promise.all([store.listClasses(), store.listSets()]);
      const today = localDay(new Date());
      const next: ExamRow[] = [];
      for (const saved of await readExams()) {
        const cls = knownClasses.find((entry) => entry.id === saved.classId);
        // An exam saved the old way (one date per class) covers its whole class.
        const plan: ExamPlan =
          saved.deckIds.length > 0
            ? saved
            : {
                ...saved,
                name: saved.name === '' ? (cls?.name ?? 'Exam') : saved.name,
                deckIds: knownSets.filter((set) => set.classId === saved.classId).map((set) => set.id),
              };
        const decks = examDeckIds(plan, knownSets.map((set) => set.id));
        if (decks.length === 0) continue;
        next.push({
          plan,
          name: plan.name,
          className: cls?.name ?? null,
          deckIds: decks,
          daysLeft: daysUntil(plan.date, today),
          readiness: await readExamReadiness(plan),
        });
      }
      next.sort((a, b) => a.plan.date.localeCompare(b.plan.date));
      setClasses(knownClasses);
      setSets(knownSets);
      setRows(next);
    } catch {
      // The planner is an extra: the home screen works without it.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [showAll, setShowAll] = useState(false);
  const today = localDay(new Date());
  const upcoming = rows.filter((row) => row.daysLeft >= 0);
  const past = rows.filter((row) => row.daysLeft < 0);

  const startEditing = (row?: ExamRow) => {
    setEditing(true);
    setExamId(row?.plan.id ?? null);
    setName(row?.plan.name ?? '');
    setClassId(row?.plan.classId ?? null);
    setPicked(row?.deckIds ?? []);
    setFilter('');
    setDay(row?.plan.date ?? addDays(localDay(new Date()), 14));
  };

  const toggleDeck = (id: string) => {
    setPicked((current) => (current.includes(id) ? current.filter((d) => d !== id) : [...current, id]));
  };

  const visibleSets = sets
    .filter((set) => classId === null || set.classId === classId)
    .filter((set) => set.title.toLowerCase().includes(filter.trim().toLowerCase()));
  const canSave = name.trim() !== '' && picked.length > 0;

  const save = () => {
    if (!canSave) {
      return;
    }
    void saveExam({
      id: examId ?? newExamId(),
      name: name.trim(),
      classId,
      date: day,
      deckIds: picked,
    }).then(() => {
      setEditing(false);
      return load();
    });
  };

  const remove = (id: string) => {
    void clearExam(id).then(load);
  };

  if (sets.length === 0 && rows.length === 0) {
    return null;
  }

  return (
    <View style={styles.card} testID="exam-panel">
      <View style={styles.head}>
        <Text style={styles.title}>EXAMS</Text>
        {editing ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add an exam"
            onPress={() => {
              startEditing();
            }}
            style={styles.addChip}
          >
            <Text style={styles.addText}>+ ADD EXAM</Text>
          </Pressable>
        )}
      </View>

      {upcoming.length === 0 && !editing ? (
        <Text style={styles.empty}>
          Add an exam, pick the decks it covers, and study just those with one tap.
        </Text>
      ) : null}

      {(showAll ? upcoming : upcoming.slice(0, 1)).map((row) => {
        const pace = examPace(row.readiness, row.daysLeft);
        return (
          <View key={row.plan.id} style={styles.exam}>
            <View style={styles.examTop}>
              <Text style={styles.examName} numberOfLines={1}>
                {row.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${row.name}`}
                onPress={() => {
                  startEditing(row);
                }}
                hitSlop={10}
              >
                <Text style={styles.remove}>EDIT</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${row.name}`}
                onPress={() => {
                  remove(row.plan.id);
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
              {prettyDay(row.plan.date)}
              {row.className === null ? '' : ` · ${row.className}`} · {row.deckIds.length} deck
              {row.deckIds.length === 1 ? '' : 's'} · {pace.label}
            </Text>
            {onStudy === undefined ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Study for ${row.name}`}
                onPress={() => {
                  onStudy(row.deckIds, row.name);
                }}
                style={[styles.button, styles.buttonPrimary, styles.studyButton]}
              >
                <Text style={styles.buttonText}>STUDY FOR THIS EXAM</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {upcoming.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setShowAll((value) => !value);
          }}
          style={styles.moreRow}
        >
          <Text style={styles.addText}>
            {showAll ? 'SHOW ONLY THE NEXT EXAM' : `${upcoming.length - 1} MORE EXAM${upcoming.length === 2 ? '' : 'S'}`}
          </Text>
        </Pressable>
      ) : null}

      {past.map((row) => (
        <View key={row.plan.id} style={styles.pastRow}>
          <Text style={styles.sub} numberOfLines={1}>
            {row.name} was {prettyDay(row.plan.date)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              remove(row.plan.id);
            }}
            hitSlop={10}
          >
            <Text style={styles.remove}>CLEAR</Text>
          </Pressable>
        </View>
      ))}

      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.label}>Exam name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Midterm 2, Quiz 4..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            maxLength={60}
          />

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

          {classes.length > 0 ? (
            <>
              <Text style={styles.label}>Class (optional, narrows the deck list)</Text>
              <View style={styles.chips}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: classId === null }}
                  onPress={() => {
                    setClassId(null);
                  }}
                  style={[styles.chip, classId === null ? styles.chipOn : null]}
                >
                  <Text style={styles.chipText}>Any</Text>
                </Pressable>
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
            </>
          ) : null}

          <Text style={styles.label}>Decks on this exam · {picked.length} picked</Text>
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search decks"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <View style={styles.pickActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPicked((current) => [...new Set([...current, ...visibleSets.map((set) => set.id)])]);
              }}
            >
              <Text style={styles.addText}>PICK SHOWN</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPicked([]);
              }}
            >
              <Text style={styles.addText}>CLEAR</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.deckList} nestedScrollEnabled>
            {visibleSets.map((set) => {
              const on = picked.includes(set.id);
              return (
                <Pressable
                  key={set.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    toggleDeck(set.id);
                  }}
                  style={styles.deckRow}
                >
                  <View style={[styles.box, on ? styles.boxOn : null]}>
                    <Text style={styles.tick}>{on ? '✓' : ''}</Text>
                  </View>
                  <Text style={styles.deckName} numberOfLines={1}>
                    {set.title}
                  </Text>
                </Pressable>
              );
            })}
            {visibleSets.length === 0 ? <Text style={styles.sub}>No decks match.</Text> : null}
          </ScrollView>

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
              disabled={!canSave}
              style={[styles.button, styles.buttonPrimary, canSave ? null : styles.disabled]}
            >
              <Text style={styles.buttonText}>SAVE EXAM</Text>
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
  moreRow: { alignItems: 'center', paddingVertical: 4 },
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
  examTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  input: {
    borderRadius: radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pickActions: { flexDirection: 'row', gap: 16 },
  deckList: { maxHeight: 220 },
  deckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: '#7b61ff', borderColor: '#7b61ff' },
  tick: { color: '#ffffff', fontFamily: fonts.title, fontSize: 14 },
  deckName: { flex: 1, color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  button: { borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 10 },
  buttonGhost: { backgroundColor: 'rgba(255,255,255,0.08)' },
  buttonPrimary: { backgroundColor: '#7b61ff' },
  studyButton: { alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontFamily: fonts.title, fontSize: 12, letterSpacing: 1 },
});
