import { computeStudyStats, type StudyStats } from "@study-app/core";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { openLocalStore } from "@/db/local";
import { colors, fonts, spacing } from "@/theme";
import { GameBackground, GameButton, GlassCard, ScreenHeader } from "@/ui";

/** The stats screen: card buckets, today, the 7-day forecast, per deck. */

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

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StatsRoute() {
  const router = useRouter();
  const [all, setAll] = useState<StudyStats | null>(null);
  const [decks, setDecks] = useState<DeckStats[]>([]);

  useEffect(() => {
    void (async () => {
      const store = await openLocalStore();
      const [cards, states, sets] = await Promise.all([
        store.listCards(),
        store.listCardStates(),
        store.listSets(),
      ]);
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

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScreenHeader title="STATS" subtitle="How your cards are doing" />
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
                <Text style={styles.section}>CARDS ({all.total})</Text>
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
              <Text style={styles.section}>BY DECK</Text>
              {decks.map((deck) => (
                <GlassCard key={deck.id} style={styles.card} elevated={false}>
                  <Text style={styles.title}>{deck.title}</Text>
                  <Text style={styles.muted}>
                    {deck.stats.total} cards · {deck.stats.mature} ★ ·{" "}
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
  barCount: { color: colors.textMuted, fontSize: 11 },
  barLabel: { color: colors.textMuted, fontSize: 11 },
});
