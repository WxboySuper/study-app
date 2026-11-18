import { localDay, QUIZ_LIMITS, quizQuestionIds } from '@study-app/core';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { openLocalStore } from '@/db/local';
import type { LocalClass, LocalSet } from '@/db/types';
import { colors, fonts, radius, spacing } from '@/theme';

import { createLocalQuiz } from './quizzes';

/** How many decks the list shows at once (search narrows the rest). */
const MAX_DECKS = 40;

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

/**
 * The builder of a quiz: name it, choose what is on it (classes and decks), how
 * many questions and when it is due. A live count shows how many questions the
 * choice gives, so an empty quiz is never saved.
 */
export function QuizBuilder({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [classes, setClasses] = useState<LocalClass[]>([]);
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [cards, setCards] = useState<{ id: string; setId: string }[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [deckIds, setDeckIds] = useState<string[]>([]);
  const [limit, setLimit] = useState<number | null>(20);
  const [dueDay, setDueDay] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const store = await openLocalStore();
      const [loadedClasses, loadedSets, loadedCards] = await Promise.all([
        store.listClasses(),
        store.listSets(),
        store.listCards(),
      ]);
      if (live) {
        setClasses(loadedClasses);
        setSets(loadedSets);
        setCards(loadedCards.map((card) => ({ id: card.id, setId: card.setId })));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const today = localDay(new Date());
  const deckClasses = useMemo(
    () => new Map(sets.map((set) => [set.id, set.classId] as const)),
    [sets],
  );
  const available = useMemo(
    () => quizQuestionIds({ id: 'preview', deckIds, classIds, limit: null }, cards, deckClasses).length,
    [deckIds, classIds, cards, deckClasses],
  );
  const onQuiz = limit === null ? available : Math.min(limit, available);

  const needle = search.trim().toLowerCase();
  const shownDecks = sets
    .filter((set) => needle === '' || set.title.toLowerCase().includes(needle))
    .slice(0, MAX_DECKS);

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

  const save = () => {
    if (onQuiz === 0) {
      return;
    }
    void createLocalQuiz({ title, deckIds, classIds, limit, dueDay }).then(onDone);
  };

  return (
    <View style={styles.box} testID="quiz-builder">
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Quiz 3: thermal expansion"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel="Quiz name"
      />

      {classes.length > 0 ? (
        <>
          <Text style={styles.label}>Whole classes on the quiz</Text>
          <View style={styles.chips}>
            {classes.map((entry) => (
              <Chip
                key={entry.id}
                label={entry.name}
                on={classIds.includes(entry.id)}
                onPress={() => {
                  setClassIds((list) => toggle(list, entry.id));
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>Decks on the quiz</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search decks"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel="Search decks"
      />
      <View style={styles.chips}>
        {shownDecks.map((set) => (
          <Chip
            key={set.id}
            label={set.title}
            on={deckIds.includes(set.id)}
            onPress={() => {
              setDeckIds((list) => toggle(list, set.id));
            }}
          />
        ))}
      </View>
      {sets.length > MAX_DECKS && needle === '' ? (
        <Text style={styles.hint}>Showing {MAX_DECKS} of {sets.length} decks. Search to find the rest.</Text>
      ) : null}

      <Text style={styles.label}>Number of questions</Text>
      <View style={styles.chips}>
        {QUIZ_LIMITS.map((value) => (
          <Chip
            key={String(value)}
            label={value === null ? 'All' : String(value)}
            on={limit === value}
            onPress={() => {
              setLimit(value);
            }}
          />
        ))}
      </View>

      <Text style={styles.label}>Due date</Text>
      <View style={styles.row}>
        {dueDay === null ? (
          <Chip
            label="Set a date"
            on={false}
            onPress={() => {
              setDueDay(addDays(today, 7));
            }}
          />
        ) : (
          <>
            <Chip label="-1 week" on={false} onPress={() => { setDueDay((d) => laterOf(addDays(d ?? today, -7), today)); }} />
            <Chip label="-1 day" on={false} onPress={() => { setDueDay((d) => laterOf(addDays(d ?? today, -1), today)); }} />
            <Text style={styles.day}>{prettyDay(dueDay)}</Text>
            <Chip label="+1 day" on={false} onPress={() => { setDueDay((d) => addDays(d ?? today, 1)); }} />
            <Chip label="+1 week" on={false} onPress={() => { setDueDay((d) => addDays(d ?? today, 7)); }} />
            <Chip label="No date" on={false} onPress={() => { setDueDay(null); }} />
          </>
        )}
      </View>

      <Text style={styles.count}>
        {onQuiz === 0
          ? 'Pick at least one deck or class'
          : `${onQuiz} question${onQuiz === 1 ? '' : 's'} on this quiz`}
      </Text>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.button, styles.ghost]}>
          <Text style={styles.buttonText}>CANCEL</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={save}
          disabled={onQuiz === 0}
          style={[styles.button, styles.primary, onQuiz === 0 ? styles.disabled : null]}
          testID="quiz-create"
        >
          <Text style={styles.buttonText}>CREATE QUIZ</Text>
        </Pressable>
      </View>
    </View>
  );
}

function laterOf(a: string, b: string): string {
  return a < b ? b : a;
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on ? styles.chipOn : null]}
    >
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  label: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14, marginTop: spacing.xs },
  input: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: {
    maxWidth: 240,
    borderRadius: radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: { backgroundColor: 'rgba(123, 97, 255, 0.6)' },
  chipText: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 13 },
  hint: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12 },
  day: { color: colors.text, fontFamily: fonts.title, fontSize: 14, paddingHorizontal: 4 },
  count: { color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 14, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: spacing.xs },
  button: { borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 12 },
  ghost: { backgroundColor: 'rgba(255,255,255,0.08)' },
  primary: { backgroundColor: '#7b61ff' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontFamily: fonts.title, fontSize: 12, letterSpacing: 1 },
});
