import {
  BUILT_IN_PRESETS,
  isHidden,
  localDayKey,
  presetForDeck,
  setBuried,
  setPreset,
  setSuspended,
  type StudyCard,
  type StudyOptions,
} from "@study-app/core";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { openLocalStore } from "@/db/local";
import type { LocalClass, LocalSet } from "@/db/types";
import { readStudyOptions, writeStudyOptions } from "@/study/studyOptions";
import { colors, fonts, spacing } from "@/theme";
import { GameBackground, GameButton, GlassCard, ScreenHeader } from "@/ui";

/**
 * Study options (docs/design/sync.md §6.1): the option preset of every
 * class and deck (daily limits, leech threshold), and the suspended and
 * buried cards. A deck without its own preset uses its class's.
 */

const MAX_ROWS = 60;

function nextPresetId(
  current: string | undefined,
  allowInherit: boolean,
): string | null {
  const ids: (string | null)[] = [
    ...(allowInherit ? [null] : []),
    ...BUILT_IN_PRESETS.map((p) => p.id),
  ];
  const index = ids.indexOf(current ?? (allowInherit ? null : "default"));
  return ids[(index + 1) % ids.length] ?? null;
}

function presetSummary(id: string | undefined): string {
  const preset =
    BUILT_IN_PRESETS.find((p) => p.id === id) ?? BUILT_IN_PRESETS[0]!;
  return `${preset.name} · ${preset.newPerDay} new / ${preset.reviewsPerDay} reviews a day`;
}

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

export default function StudyOptionsRoute() {
  const router = useRouter();
  const [options, setOptions] = useState<StudyOptions | null>(null);
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [classes, setClasses] = useState<LocalClass[]>([]);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [query, setQuery] = useState("");
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const today = localDayKey(new Date());

  useEffect(() => {
    void (async () => {
      const store = await openLocalStore();
      const [o, s, c, k] = await Promise.all([
        readStudyOptions(store),
        store.listSets(),
        store.listClasses(),
        store.listCards(),
      ]);
      setOptions(o);
      setSets(s);
      setClasses(c);
      setCards(k);
    })();
  }, []);

  const update = (next: StudyOptions) => {
    setOptions(next);
    void openLocalStore().then((store) => writeStudyOptions(store, next));
  };

  const rows = useMemo(() => {
    if (options === null) return [];
    const q = query.trim().toLowerCase();
    return cards
      .filter((card) => !hiddenOnly || isHidden(options, card.id, today))
      .filter(
        (card) =>
          q === "" ||
          card.front.toLowerCase().includes(q) ||
          card.back.toLowerCase().includes(q),
      )
      .slice(0, MAX_ROWS);
  }, [cards, hiddenOnly, options, query, today]);

  const tomorrow = localDayKey(new Date(Date.now() + 86_400_000));

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScreenHeader
          title="STUDY OPTIONS"
          subtitle="Daily limits, suspend and bury"
        />
        <ScrollView contentContainerStyle={styles.body}>
          {options === null ? <Text style={styles.muted}>Loading…</Text> : null}
          {options !== null ? (
            <>
              <Text style={styles.section}>CLASS PRESETS</Text>
              {classes.length === 0 ? (
                <Text style={styles.muted}>No classes yet.</Text>
              ) : null}
              {classes.map((cls) => (
                <GlassCard key={cls.id} style={styles.card} elevated={false}>
                  <Text style={styles.title}>{cls.name}</Text>
                  <Chip
                    testID={`preset-class-${cls.id}`}
                    label={presetSummary(options.classPresets[cls.id])}
                    active={options.classPresets[cls.id] !== undefined}
                    onPress={() =>
                      update(
                        setPreset(
                          options,
                          { classId: cls.id },
                          nextPresetId(options.classPresets[cls.id], false),
                        ),
                      )
                    }
                  />
                </GlassCard>
              ))}

              <Text style={styles.section}>DECK PRESETS</Text>
              {sets.map((set) => {
                const own = options.deckPresets[set.id];
                const effective = presetForDeck(options, set.id, set.classId);
                return (
                  <GlassCard key={set.id} style={styles.card} elevated={false}>
                    <Text style={styles.title}>{set.title}</Text>
                    <Chip
                      testID={`preset-deck-${set.id}`}
                      label={
                        own === undefined
                          ? `Uses class/default: ${presetSummary(effective.id)}`
                          : presetSummary(own)
                      }
                      active={own !== undefined}
                      onPress={() =>
                        update(
                          setPreset(
                            options,
                            { deckId: set.id },
                            nextPresetId(own, true),
                          ),
                        )
                      }
                    />
                  </GlassCard>
                );
              })}

              <Text style={styles.section}>SUSPEND / BURY</Text>
              <TextInput
                testID="options-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Search cards"
                placeholderTextColor={colors.textMuted}
                style={styles.search}
              />
              <Chip
                testID="options-hidden-only"
                label={
                  hiddenOnly
                    ? "Showing suspended & buried"
                    : "Show only suspended & buried"
                }
                active={hiddenOnly}
                onPress={() => setHiddenOnly(!hiddenOnly)}
              />
              {rows.map((card) => {
                const suspended = options.suspended.includes(card.id);
                const buried =
                  options.buried[card.id] !== undefined &&
                  options.buried[card.id]! >= today;
                return (
                  <GlassCard key={card.id} style={styles.card} elevated={false}>
                    <Text style={styles.front} numberOfLines={2}>
                      {card.front}
                    </Text>
                    <View style={styles.actions}>
                      <Chip
                        testID={`suspend-${card.id}`}
                        label={suspended ? "⏸ SUSPENDED" : "SUSPEND"}
                        active={suspended}
                        onPress={() =>
                          update(setSuspended(options, card.id, !suspended))
                        }
                      />
                      <Chip
                        testID={`bury-${card.id}`}
                        label={buried ? "🪦 BURIED TODAY" : "BURY TODAY"}
                        active={buried}
                        onPress={() =>
                          update(
                            setBuried(
                              options,
                              card.id,
                              buried ? null : today,
                              today,
                            ),
                          )
                        }
                      />
                    </View>
                  </GlassCard>
                );
              })}
              {rows.length === MAX_ROWS ? (
                <Text style={styles.muted}>Search to see more cards.</Text>
              ) : null}
              <Text style={styles.muted}>
                Buried cards come back on {tomorrow}.
              </Text>
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
  body: { padding: spacing.lg, gap: spacing.sm },
  section: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 14,
    marginTop: spacing.md,
  },
  card: { padding: spacing.md, gap: spacing.sm },
  title: { color: colors.text, fontFamily: fonts.title, fontSize: 16 },
  front: { color: colors.text, fontSize: 14 },
  muted: { color: colors.textMuted, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: "rgba(250,204,21,0.25)",
    borderColor: colors.gold,
  },
  chipText: { color: colors.text, fontSize: 12, fontFamily: fonts.title },
  search: {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
