import {
  computeStudyStats,
  historySeries,
  lastDays,
  retentionTrend,
  type HistoryPoint,
  type StudyStats,
} from "@study-app/core";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { openLocalStore } from "@/db/local";
import { readHistory } from "@/study/reviewHistory";
import { colors, fonts, spacing } from "@/theme";
import { GameBackground, GameButton, GlassCard, ScreenHeader } from "@/ui";

/** The stats screen: question buckets, the review history, today, the 7-day forecast, per deck. */

interface DeckStats {
  id: string;
  title: string;
  stats: StudyStats;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function Tile({
  label,
  value,
  tint,
}: {
  label: string;
  value: string | number;
  tint?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text
        style={[styles.tileValue, tint === undefined ? null : { color: tint }]}
      >
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const HISTORY_DAYS = 28;

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StatsRoute() {
  const router = useRouter();
  const [all, setAll] = useState<StudyStats | null>(null);
  const [decks, setDecks] = useState<DeckStats[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    void (async () => {
      const store = await openLocalStore();
      const [cards, states, sets, saved] = await Promise.all([
        store.listCards(),
        store.listCardStates(),
        store.listSets(),
        readHistory(store),
      ]);
      setHistory(historySeries(saved, lastDays(new Date(), HISTORY_DAYS)));
      const now = Date.now();
      const start = startOfToday();
      setAll(computeStudyStats(cards, states, now, start));
      setDecks(
        sets.map((set) => ({
          id: set.id,
          title: set.title,
          stats: computeStudyStats(
            cards.filter((card) => card.setId === set.id),
            states,
            now,
            start,
          ),
        })),
      );
    })();
  }, []);

  const peak = all === null ? 1 : Math.max(1, ...all.forecast);
  const today = new Date().getDay();
  const recent = history.slice(-14);
  const historyPeak = Math.max(1, ...recent.map((point) => point.reviews));
  const trend = retentionTrend(history);
  const weeks = [0, 1, 2, 3].map((w) => {
    const slice = history.slice(w * 7, w * 7 + 7);
    const t = retentionTrend(slice, 7);
    return {
      label: w === 3 ? "This wk" : `${3 - w} wk ago`,
      retention: t.recent,
    };
  });

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScreenHeader title="STATS" subtitle="How your questions are doing" />
        <ScrollView contentContainerStyle={styles.body}>
          {all === null ? <Text style={styles.muted}>Loading…</Text> : null}
          {all !== null ? (
            <>
              <GlassCard style={styles.card} elevated={false}>
                <Text style={styles.section}>TODAY</Text>
                <View style={styles.row}>
                  <Tile label="Due" value={all.dueToday} tint={colors.gold} />
                  <Tile label="Reviewed" value={all.reviewedToday} />
                  <Tile
                    label="Retention"
                    value={
                      all.retention === null
                        ? "—"
                        : `${Math.round(all.retention * 100)}%`
                    }
                  />
                </View>
              </GlassCard>
              <GlassCard style={styles.card} elevated={false}>
                <Text style={styles.section}>QUESTIONS ({all.total})</Text>
                <View style={styles.row}>
                  <Tile label="New" value={all.new} tint="#60a5fa" />
                  <Tile label="Learning" value={all.learning} tint="#fb923c" />
                  <Tile label="Young" value={all.young} tint="#4ade80" />
                  <Tile
                    label="★ Mastered"
                    value={all.mature}
                    tint={colors.gold}
                  />
                  <Tile label="🐛 Leeches" value={all.leeches} tint="#fb7185" />
                </View>
              </GlassCard>
              <GlassCard style={styles.card} elevated={false}>
                <Text style={styles.section}>NEXT 7 DAYS</Text>
                <View style={styles.chart} testID="stats-forecast">
                  {all.forecast.map((count, i) => (
                    <View key={i} style={styles.barCol}>
                      <Text style={styles.barCount}>{count}</Text>
                      <View
                        style={[
                          styles.bar,
                          { height: 4 + (80 * count) / peak },
                        ]}
                      />
                      <Text style={styles.barLabel}>
                        {WEEKDAY[(today + i + 1) % 7]}
                      </Text>
                    </View>
                  ))}
                </View>
              </GlassCard>
              <GlassCard style={styles.card} elevated={false}>
                <Text style={styles.section}>LAST 14 DAYS</Text>
                <View style={styles.chart} testID="stats-history">
                  {recent.map((point) => (
                    <View key={point.day} style={styles.barCol}>
                      <Text style={styles.barCount}>
                        {point.reviews > 0 ? point.reviews : ""}
                      </Text>
                      <View
                        style={[
                          styles.bar,
                          styles.historyBar,
                          { height: 4 + (80 * point.reviews) / historyPeak },
                        ]}
                      />
                      <Text style={styles.barLabel}>{point.day.slice(8)}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.muted}>Questions answered per day</Text>
              </GlassCard>
              <GlassCard style={styles.card} elevated={false}>
                <Text style={styles.section}>RETENTION TREND</Text>
                <View style={styles.row}>
                  <Tile
                    label="Last 7 days"
                    value={percent(trend.recent)}
                    tint="#4ade80"
                  />
                  <Tile label="7 days before" value={percent(trend.previous)} />
                  <Tile
                    label="Change"
                    value={
                      trend.delta === null
                        ? "—"
                        : `${trend.delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(trend.delta * 100))}`
                    }
                    tint={
                      trend.delta === null
                        ? undefined
                        : trend.delta >= 0
                          ? "#4ade80"
                          : "#fb7185"
                    }
                  />
                </View>
                <View style={styles.chart} testID="stats-retention">
                  {weeks.map((week) => (
                    <View key={week.label} style={styles.barCol}>
                      <Text style={styles.barCount}>
                        {percent(week.retention)}
                      </Text>
                      <View
                        style={[
                          styles.bar,
                          styles.retentionBar,
                          { height: 4 + 80 * (week.retention ?? 0) },
                        ]}
                      />
                      <Text style={styles.barLabel}>{week.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.muted}>
                  Share of questions answered right, by week
                </Text>
              </GlassCard>
              <Text style={styles.section}>BY DECK</Text>
              {decks.map((deck) => (
                <GlassCard key={deck.id} style={styles.card} elevated={false}>
                  <Text style={styles.title}>{deck.title}</Text>
                  <Text style={styles.muted}>
                    {deck.stats.total} questions · {deck.stats.mature} ★ ·{" "}
                    {deck.stats.dueToday} due today · {deck.stats.new} new
                    {deck.stats.leeches > 0
                      ? ` · ${deck.stats.leeches} 🐛`
                      : ""}
                  </Text>
                </GlassCard>
              ))}
            </>
          ) : null}
          <GameButton
            label="HOME"
            variant="ghost"
            size="md"
            onPress={() => router.back()}
          />
        </ScrollView>
      </SafeAreaView>
    </GameBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  card: { padding: spacing.md, gap: spacing.sm },
  section: { color: colors.gold, fontFamily: fonts.title, fontSize: 14 },
  title: { color: colors.text, fontFamily: fonts.title, fontSize: 16 },
  muted: { color: colors.textMuted, fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: { minWidth: 72, alignItems: "center" },
  tileValue: { color: colors.text, fontFamily: fonts.title, fontSize: 24 },
  tileLabel: { color: colors.textMuted, fontSize: 12 },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 120,
  },
  barCol: { alignItems: "center", flex: 1, gap: 2 },
  bar: { width: 18, borderRadius: 4, backgroundColor: "#818cf8" },
  historyBar: { width: 12, backgroundColor: "#38bdf8" },
  retentionBar: { width: 28, backgroundColor: "#4ade80" },
  barCount: { color: colors.textMuted, fontSize: 11 },
  barLabel: { color: colors.textMuted, fontSize: 11 },
});
