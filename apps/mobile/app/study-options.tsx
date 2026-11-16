import {
  isHidden,
  localDayKey,
  presetForDeck,
  presetsOfTrack,
  setBuried,
  setPreset,
  setSuspended,
  trackOf,
  type QuestionTrack,
  type StudyCard,
  type StudyOptions,
  type StudyPreset,
} from "@study-app/core";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { colors, fonts, radius, spacing } from "@/theme";
import { GameBackground, GameButton, GlassCard, ScreenHeader } from "@/ui";

/**
 * Study options (docs/design/sync.md §6.1): the daily limits of every class
 * and deck, and the questions the player hides (suspend and bury).
 *
 * The screen is built to be read at a glance:
 *  - every setting is a row with a plain name and its current value in words;
 *  - tapping a row opens the few choices it has (no more tapping a pill to
 *    cycle through values nobody can see);
 *  - the classes are always there, the rarely used parts (one deck that needs
 *    other limits, the math decks, hiding questions) are collapsed.
 */

/** How many decks or questions a list shows before it asks for a search. */
const MAX_ROWS = 40;

/** "20 new cards · 200 reviews a day". */
function limitsText(preset: StudyPreset): string {
  const reviews =
    preset.reviewsPerDay >= 9999 ? "no review limit" : `${preset.reviewsPerDay} reviews`;
  return `${preset.newPerDay} new cards · ${reviews} a day`;
}

/** What a row shows as its value: "Default · 20 new cards · 200 reviews a day". */
function presetLine(preset: StudyPreset): string {
  return `${preset.name} · ${limitsText(preset)}`;
}

/** The preset of an id (the first one is the default of the track). */
function presetOf(id: string | undefined, track: QuestionTrack): StudyPreset {
  const presets = presetsOfTrack(track);
  return presets.find((preset) => preset.id === id) ?? presets[0]!;
}

/** A group of rows with a title. It can fold away. */
function Section({
  title,
  subtitle,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  /** `undefined`: the section is always open. */
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const folded = open === false;
  const head = (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle === undefined ? null : <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      {badge === undefined ? null : (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      {onToggle === undefined ? null : (
        <Text style={styles.chevron}>{folded ? "▾" : "▴"}</Text>
      )}
    </View>
  );

  return (
    <GlassCard style={styles.section} contentStyle={styles.sectionBody} elevated={false}>
      {onToggle === undefined ? (
        head
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: !folded }}
          onPress={onToggle}
        >
          {head}
        </Pressable>
      )}
      {folded ? null : children}
    </GlassCard>
  );
}

/** One setting: its name, its value in words, and the choices when it is open. */
function SettingRow({
  testID,
  title,
  value,
  custom,
  open,
  onPress,
  children,
}: {
  testID: string;
  title: string;
  value: string;
  /** `true` when the player changed it (it is tinted gold). */
  custom: boolean;
  open: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${value}`}
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        style={({ pressed }) => [styles.rowHead, pressed && styles.rowPressed]}
      >
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.rowValue, custom && styles.rowValueCustom]}>{value}</Text>
        </View>
        <Text style={styles.chevron}>{open ? "▴" : "▾"}</Text>
      </Pressable>
      {open ? <View style={styles.choices}>{children}</View> : null}
    </View>
  );
}

/** One choice of a setting. */
function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceLabel}>{label}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/** A button that is on or off ("Suspend" / "Suspended"). */
function Toggle({
  testID,
  label,
  on,
  onPress,
}: {
  testID: string;
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && styles.rowPressed]}
    >
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{label}</Text>
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
  const [deckQuery, setDeckQuery] = useState("");
  const [hiddenOnly, setHiddenOnly] = useState(false);
  /** The setting whose choices are open (one at a time). */
  const [openRow, setOpenRow] = useState<string | null>(null);
  /** The sections that are unfolded. */
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});
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

  const toggleSection = (key: string) => {
    setUnfolded((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleRow = (key: string) => {
    setOpenRow((current) => (current === key ? null : key));
  };

  // The decks that hold math questions (the math decks have their own limits).
  const mathSets = useMemo(() => {
    const ids = new Set(
      cards.filter((card) => trackOf(card) === "math").map((card) => card.setId),
    );
    return sets.filter((set) => ids.has(set.id));
  }, [cards, sets]);

  const cardRows = useMemo(() => {
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

  /** The decks of a list, the ones with their own limits first, filtered by the search. */
  const deckRows = (list: LocalSet[], own: Record<string, string>) => {
    const q = deckQuery.trim().toLowerCase();
    return [...list]
      .filter((set) => q === "" || set.title.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(own[b.id] !== undefined) - Number(own[a.id] !== undefined) ||
          a.title.localeCompare(b.title),
      );
  };

  const tomorrow = localDayKey(new Date(Date.now() + 86_400_000));

  /** The choices of a deck setting: "same as class" and every preset. */
  const deckChoices = (
    set: LocalSet,
    own: string | undefined,
    inherited: StudyPreset,
    track: QuestionTrack,
    inheritLabel: string,
  ) => (
    <>
      <Choice
        label={inheritLabel}
        detail={presetLine(inherited)}
        selected={own === undefined}
        onPress={() => {
          if (options === null) return;
          update(setPreset(options, { deckId: set.id }, null, track));
          setOpenRow(null);
        }}
      />
      {presetsOfTrack(track).map((preset) => (
        <Choice
          key={preset.id}
          label={preset.name}
          detail={limitsText(preset)}
          selected={own === preset.id}
          onPress={() => {
            if (options === null) return;
            update(setPreset(options, { deckId: set.id }, preset.id, track));
            setOpenRow(null);
          }}
        />
      ))}
    </>
  );

  const customDecks =
    options === null ? 0 : sets.filter((set) => options.deckPresets[set.id] !== undefined).length;
  const customMathDecks =
    options === null
      ? 0
      : mathSets.filter((set) => options.mathDeckPresets[set.id] !== undefined).length;

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScreenHeader title="STUDY OPTIONS" subtitle="How much you study each day" />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {options === null ? <Text style={styles.muted}>Loading…</Text> : null}
          {options !== null ? (
            <>
              <Text style={styles.intro}>
                Pick how many new cards and reviews you get each day. A class setting
                applies to every deck in that class.
              </Text>

              <Section title="Your classes" subtitle="Daily limits for each class">
                {classes.length === 0 ? (
                  <Text style={styles.empty}>No classes yet.</Text>
                ) : null}
                {classes.map((cls) => {
                  const current = options.classPresets[cls.id];
                  const key = `class-${cls.id}`;
                  return (
                    <SettingRow
                      key={cls.id}
                      testID={`preset-class-${cls.id}`}
                      title={cls.name}
                      value={presetLine(presetOf(current, "mc"))}
                      custom={current !== undefined}
                      open={openRow === key}
                      onPress={() => toggleRow(key)}
                    >
                      {presetsOfTrack("mc").map((preset) => (
                        <Choice
                          key={preset.id}
                          label={preset.name}
                          detail={limitsText(preset)}
                          selected={presetOf(current, "mc").id === preset.id}
                          onPress={() => {
                            update(setPreset(options, { classId: cls.id }, preset.id));
                            setOpenRow(null);
                          }}
                        />
                      ))}
                    </SettingRow>
                  );
                })}
              </Section>

              <Section
                title="One deck needs different limits?"
                subtitle="Change a single deck. Every other deck keeps its class setting."
                badge={customDecks === 0 ? undefined : `${customDecks} changed`}
                open={unfolded.decks === true}
                onToggle={() => toggleSection("decks")}
              >
                <TextInput
                  testID="deck-search"
                  value={deckQuery}
                  onChangeText={setDeckQuery}
                  placeholder="Find a deck"
                  placeholderTextColor={colors.textDim}
                  style={styles.search}
                />
                {deckRows(sets, options.deckPresets)
                  .slice(0, MAX_ROWS)
                  .map((set) => {
                    const own = options.deckPresets[set.id];
                    const inherited = presetForDeck(
                      { ...options, deckPresets: {} },
                      set.id,
                      set.classId,
                    );
                    const key = `deck-${set.id}`;
                    return (
                      <SettingRow
                        key={set.id}
                        testID={`preset-deck-${set.id}`}
                        title={set.title}
                        value={
                          own === undefined
                            ? `Same as class · ${inherited.name}`
                            : presetLine(presetOf(own, "mc"))
                        }
                        custom={own !== undefined}
                        open={openRow === key}
                        onPress={() => toggleRow(key)}
                      >
                        {deckChoices(set, own, inherited, "mc", "Same as class")}
                      </SettingRow>
                    );
                  })}
                {sets.length > MAX_ROWS && deckQuery.trim() === "" ? (
                  <Text style={styles.empty}>Search to find any of your {sets.length} decks.</Text>
                ) : null}
              </Section>

              {mathSets.length === 0 ? null : (
                <Section
                  title="Math decks"
                  subtitle="Math questions take longer, so they have smaller daily limits of their own."
                  badge={customMathDecks === 0 ? undefined : `${customMathDecks} changed`}
                  open={unfolded.math === true}
                  onToggle={() => toggleSection("math")}
                >
                  {deckRows(mathSets, options.mathDeckPresets)
                    .slice(0, MAX_ROWS)
                    .map((set) => {
                      const own = options.mathDeckPresets[set.id];
                      const inherited = presetForDeck(
                        { ...options, mathDeckPresets: {} },
                        set.id,
                        set.classId,
                        "math",
                      );
                      const key = `math-${set.id}`;
                      return (
                        <SettingRow
                          key={set.id}
                          testID={`preset-math-deck-${set.id}`}
                          title={set.title}
                          value={
                            own === undefined
                              ? `Standard · ${inherited.name}`
                              : presetLine(presetOf(own, "math"))
                          }
                          custom={own !== undefined}
                          open={openRow === key}
                          onPress={() => toggleRow(key)}
                        >
                          {deckChoices(set, own, inherited, "math", "Standard math limits")}
                        </SettingRow>
                      );
                    })}
                </Section>
              )}

              <Section
                title="Hide questions"
                subtitle="Suspend a question until you turn it back on. Bury it to skip it until tomorrow."
                badge={
                  options.suspended.length === 0 ? undefined : `${options.suspended.length} suspended`
                }
                open={unfolded.hide === true}
                onToggle={() => toggleSection("hide")}
              >
                <TextInput
                  testID="options-search"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search questions"
                  placeholderTextColor={colors.textDim}
                  style={styles.search}
                />
                <Toggle
                  testID="options-hidden-only"
                  label={hiddenOnly ? "Showing only hidden questions" : "Show only hidden questions"}
                  on={hiddenOnly}
                  onPress={() => setHiddenOnly(!hiddenOnly)}
                />
                {cardRows.map((card) => {
                  const suspended = options.suspended.includes(card.id);
                  const buried =
                    options.buried[card.id] !== undefined && options.buried[card.id]! >= today;
                  return (
                    <View key={card.id} style={styles.row}>
                      <Text style={styles.question} numberOfLines={3}>
                        {card.front}
                      </Text>
                      <View style={styles.actions}>
                        <Toggle
                          testID={`suspend-${card.id}`}
                          label={suspended ? "Suspended" : "Suspend"}
                          on={suspended}
                          onPress={() => update(setSuspended(options, card.id, !suspended))}
                        />
                        <Toggle
                          testID={`bury-${card.id}`}
                          label={buried ? "Buried until tomorrow" : "Bury today"}
                          on={buried}
                          onPress={() =>
                            update(setBuried(options, card.id, buried ? null : today, today))
                          }
                        />
                      </View>
                    </View>
                  );
                })}
                {cardRows.length === 0 ? (
                  <Text style={styles.empty}>
                    {hiddenOnly ? "Nothing is hidden right now." : "No questions match."}
                  </Text>
                ) : null}
                {cardRows.length === MAX_ROWS ? (
                  <Text style={styles.empty}>Search to see more questions.</Text>
                ) : null}
                <Text style={styles.empty}>Buried questions come back on {tomorrow}.</Text>
              </Section>
            </>
          ) : null}
          <GameButton label="BACK" variant="ghost" size="md" onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    </GameBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  intro: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 },
  section: {},
  sectionBody: { padding: 0 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  sectionHeadText: { flex: 1, gap: 2 },
  sectionTitle: { color: colors.text, fontFamily: fonts.titleSemi, fontSize: 18 },
  sectionSub: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    borderRadius: radius.pill,
    backgroundColor: "rgba(250,204,21,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: colors.gold, fontFamily: fonts.bodyBold, fontSize: 12 },
  chevron: { color: colors.textMuted, fontSize: 16, width: 18, textAlign: "center" },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  rowValue: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  rowValueCustom: { color: colors.gold },
  choices: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    borderRadius: radius.tile,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceSelected: { backgroundColor: "rgba(123,97,255,0.2)" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textDim,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.primaryLight },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryLight },
  choiceText: { flex: 1, gap: 1 },
  choiceLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  choiceDetail: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  search: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    minHeight: 46,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.tile,
    paddingHorizontal: spacing.md,
  },
  question: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  toggle: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  toggleOn: { backgroundColor: "rgba(250,204,21,0.2)", borderColor: colors.gold },
  toggleText: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14 },
  toggleTextOn: { color: colors.gold, fontFamily: fonts.bodyBold },
});
