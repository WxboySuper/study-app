import {
  buildQuestionRows,
  buildQueue,
  countQuestionFilters,
  formatDueIn,
  matchesQuestionFilter,
  parseQuestionFilter,
  type QuestionFilter,
  type QuestionRow,
} from '@study-app/core';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalStore } from '@/db/local';
import { hapticImpact } from '@/haptics';
import { MathText } from '@/math/MathText';
import { useSettings } from '@/settings';
import { play } from '@/sound/sfx';
import { readMasteryCounts } from '@/study/masteryCounts';
import { colors, fonts, radius, spacing } from '@/theme';
import { CritterLoader, GameBackground, GameButton, GlassCard, ScreenHeader } from '@/ui';

/**
 * The deck detail screen (`/deck?id=<setId>&filter=due`).
 *
 * Lists every question of a deck with its answer (math renders), its review
 * status (New / Learning / Due / Due in X) and its Mastery progress (n/3).
 * The counters at the top are filters: tap Due or Queued to see just those.
 */

/** The look of every status pill. */
const STATUS_LOOK: Record<QuestionRow['status'], { label: string; color: string; glyph: string }> = {
  new: { label: 'NEW', color: '#38bdf8', glyph: '✨' },
  learning: { label: 'LEARNING', color: '#a78bff', glyph: '🌱' },
  due: { label: 'DUE', color: '#fb7185', glyph: '⏰' },
  scheduled: { label: 'DUE IN', color: '#34d399', glyph: '📅' },
};

/** The counters of the header, in order. */
const FILTER_LOOK: { filter: QuestionFilter; label: string; color: string }[] = [
  { filter: 'all', label: 'ALL', color: '#ffffff' },
  { filter: 'due', label: 'DUE', color: '#fb7185' },
  { filter: 'queued', label: 'QUEUED', color: '#ffd166' },
  { filter: 'new', label: 'NEW', color: '#38bdf8' },
  { filter: 'learning', label: 'LEARNING', color: '#a78bff' },
  { filter: 'scheduled', label: 'LATER', color: '#34d399' },
  { filter: 'mastered', label: 'MASTERED', color: '#ffd166' },
];

/** How many new questions a session takes (the home screen uses the same). */
const NEW_CAP = 20;

export default function DeckDetailRoute() {
  const router = useRouter();
  const { mastery } = useSettings();
  const params = useLocalSearchParams<{ id?: string; filter?: string }>();
  const setId = typeof params.id === 'string' ? params.id : '';
  const [filter, setFilter] = useState<QuestionFilter>(parseQuestionFilter(params.filter));
  const [title, setTitle] = useState('Deck');
  const [rows, setRows] = useState<QuestionRow[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const store = await openLocalStore();
      const [cards, states, sets, counts] = await Promise.all([
        store.listCards(),
        store.listCardStates(),
        store.listSets(),
        readMasteryCounts(store),
      ]);
      const at = Date.now();
      const deckCards = cards.filter((card) => card.setId === setId);
      const queue = buildQueue(cards, states, at, {
        newCap: NEW_CAP,
        scope: { kind: 'set', setId },
      });
      setTitle(sets.find((set) => set.id === setId)?.title ?? 'Deck');
      setNow(at);
      setRows(
        buildQuestionRows(deckCards, states, counts, new Set(queue.filter((item) => !item.bonus).map((item) => item.cardId)), at),
      );
    } catch {
      setRows([]);
    }
  }, [setId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const counts = useMemo(() => countQuestionFilters(rows ?? []), [rows]);
  const shown = useMemo(
    () => (rows ?? []).filter((row) => matchesQuestionFilter(row, filter)),
    [filter, rows],
  );

  const onPlay = () => {
    play('tap');
    router.push({
      pathname: '/fishing',
      params: { kind: 'set', id: setId, title, mastery: mastery ? '1' : '0' },
    });
  };

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScreenHeader
          title={title.toUpperCase()}
          subtitle={`${counts.all} question${counts.all === 1 ? '' : 's'} · ${counts.mastered} mastered`}
        />

        <View style={styles.filters}>
          {FILTER_LOOK.map(({ filter: key, label, color }) => {
            const active = key === filter;
            return (
              <Pressable
                key={key}
                testID={`deck-filter-${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label}: ${counts[key]}`}
                onPress={() => {
                  hapticImpact('light');
                  play('tap');
                  setFilter(active && key !== 'all' ? 'all' : key);
                }}
                style={({ pressed }) => [
                  styles.counter,
                  { borderColor: active ? color : colors.border },
                  active && { backgroundColor: `${color}26` },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.counterValue, { color }]}>{counts[key]}</Text>
                <Text style={styles.counterLabel}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {rows === null ? (
          <CritterLoader emoji="🐟" label="Counting the questions…" />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(row) => row.card.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {counts.all === 0 ? 'This deck has no questions yet.' : 'Nothing here. Try another filter.'}
              </Text>
            }
            renderItem={({ item, index }) => (
              <Animated.View entering={index < 12 ? FadeInDown.delay(index * 30).duration(220) : undefined}>
                <QuestionTile row={item} index={rows.indexOf(item)} now={now} />
              </Animated.View>
            )}
            ListFooterComponent={<View style={styles.footerSpace} />}
          />
        )}

        <SafeAreaView edges={['bottom']} style={styles.playBar}>
          <GameButton
            label={counts.queued > 0 ? `PLAY ${counts.queued} QUEUED` : 'PLAY DECK'}
            variant="primary"
            size="lg"
            onPress={onPlay}
          />
        </SafeAreaView>
      </SafeAreaView>
    </GameBackground>
  );
}

/** One question of the deck: prompt, answer, status and mastery dots. */
function QuestionTile({ row, index, now }: { row: QuestionRow; index: number; now: number }) {
  const look = STATUS_LOOK[row.status];
  const statusText =
    row.status === 'scheduled' && row.dueAt !== null
      ? `DUE IN ${formatDueIn(row.dueAt, now).toUpperCase()}`
      : row.status === 'learning' && row.dueAt !== null
        ? `LEARNING · ${formatDueIn(row.dueAt, now)}`
        : look.label;

  return (
    <GlassCard
      style={[styles.tile, row.mastered && styles.tileMastered]}
      contentStyle={styles.tileContent}
      elevated={false}
      tint={row.mastered ? colors.gold : colors.border}
    >
      <View style={styles.tileTop}>
        <Text style={styles.number}>#{index + 1}</Text>
        <View style={[styles.pill, { backgroundColor: `${look.color}26`, borderColor: look.color }]}>
          <Text style={[styles.pillText, { color: look.color }]}>
            {look.glyph} {statusText}
          </Text>
        </View>
        {row.queued ? (
          <View style={[styles.pill, styles.queuedPill]}>
            <Text style={[styles.pillText, { color: colors.gold }]}>🎣 QUEUED</Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        <View
          style={styles.dots}
          accessibilityLabel={`Mastered ${row.mastery} of ${row.masteryRequired}`}
          testID={`mastery-${row.card.id}`}
        >
          {Array.from({ length: row.masteryRequired }, (_, dot) => (
            <View key={dot} style={[styles.dot, dot < row.mastery && styles.dotOn]} />
          ))}
          <Text style={[styles.dotsText, row.mastered && { color: colors.gold }]}>
            {row.mastered ? '★ ' : ''}
            {row.mastery}/{row.masteryRequired}
          </Text>
        </View>
      </View>

      <MathText text={row.card.front} style={styles.prompt} color={colors.text} fontSize={15} />
      <View style={styles.answerRow}>
        <Text style={styles.answerLabel}>ANSWER</Text>
        <View style={styles.answer}>
          <MathText text={row.card.back} style={styles.answerText} color={colors.collection} fontSize={14} />
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  counter: {
    minWidth: 72,
    alignItems: 'center',
    borderRadius: radius.tile,
    borderWidth: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  counterValue: { fontFamily: fonts.title, fontSize: 20 },
  counterLabel: { color: colors.textMuted, fontFamily: fonts.title, fontSize: 9, letterSpacing: 1 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
  footerSpace: { height: 96 },
  tile: { borderRadius: radius.tile },
  tileMastered: { borderColor: colors.gold },
  tileContent: { padding: spacing.md, gap: spacing.sm },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  number: { color: colors.textDim, fontFamily: fonts.title, fontSize: 12 },
  pill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  queuedPill: { borderColor: colors.gold, backgroundColor: 'rgba(255,209,102,0.14)' },
  pillText: { fontFamily: fonts.title, fontSize: 10, letterSpacing: 0.6 },
  spacer: { flex: 1 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dotOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  dotsText: { color: colors.textMuted, fontFamily: fonts.title, fontSize: 11, marginLeft: 3 },
  prompt: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  answerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  answerLabel: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 9,
    letterSpacing: 1,
    paddingTop: 3,
  },
  answer: { flex: 1 },
  answerText: { color: colors.collection, fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19 },
  playBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(10,11,14,0.92)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
