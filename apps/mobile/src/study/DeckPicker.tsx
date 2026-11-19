import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticImpact } from '@/haptics';
import { STAGE_COLORS } from '@/modes/fishing/stage';
import { play } from '@/sound/sfx';
import { colors, fonts, spacing } from '@/theme';

import { chipKey, type ClassChip, type DeckCard } from './decks';

/**
 * The scope picker of the home screen.
 *
 * Plain, flat rows instead of tiles: the classes are a list (name on the
 * left, today's New / Learning / Due on the right) and the decks of the
 * selected class sit below it. Every number on the rows comes from the same
 * queue as the big card at the top, so the totals always add up.
 */

/** The props of the picker. */
export interface DeckPickerProps {
  /** The rows of the class list (All, the classes of the player, Unsorted). */
  chips: readonly ClassChip[];
  /** The decks of the selected class. */
  decks: readonly DeckCard[];
  /** The key of the selected chip. */
  selectedChip: string;
  /** The id of the selected deck (`null` when no deck is selected). */
  selectedDeckId: string | null;
  /** Called when the player picks a class. */
  onSelectChip: (chip: ClassChip) => void;
  /** Called when the player picks a deck. */
  onSelectDeck: (deck: DeckCard) => void;
  /** Called when the player wants to create a class. */
  onCreateClass: () => void;
  /** Called when the player wants to rename or delete a class. */
  onEditClass: (chip: ClassChip) => void;
  /** Called when the player wants to move a deck to another class. */
  onMoveDeck: (deck: DeckCard) => void;
  /** Called when the player wants to import a new deck. */
  onImport: () => void;
  /** Called when the player wants to delete a deck. */
  onDelete: (deck: DeckCard) => void;
  /** Called when the player opens the question list of a deck. */
  onOpenDeck: (deck: DeckCard, filter: 'all' | 'due') => void;
}

/** How many decks the list shows before "Show all". */
const DECKS_SHOWN = 6;

export function DeckPicker({
  chips,
  decks,
  selectedChip,
  selectedDeckId,
  onSelectChip,
  onSelectDeck,
  onCreateClass,
  onEditClass,
  onMoveDeck,
  onImport,
  onDelete,
  onOpenDeck,
}: DeckPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const [menuDeck, setMenuDeck] = useState<string | null>(null);
  const shown = showAll ? decks : decks.slice(0, DECKS_SHOWN);
  const current = chips.find((chip) => chipKey(chip) === selectedChip);

  return (
    <View style={styles.root} testID="deck-picker">
      <View style={styles.header}>
        <Text style={styles.title}>CLASSES</Text>
        <Text style={styles.hint}>Tap one to study it</Text>
      </View>

      <View style={styles.list}>
        {chips.map((chip) => (
          <Row
            key={chipKey(chip)}
            title={chip.name}
            subtitle={`${chip.questions} question${chip.questions === 1 ? '' : 's'}`}
            accent={chip.color}
            selected={selectedChip === chipKey(chip)}
            today={chip.today}
            due={chip.due}
            onPress={() => {
              hapticImpact('light');
              play('tap');
              onSelectChip(chip);
            }}
            onLongPress={
              chip.kind === 'class'
                ? () => {
                    hapticImpact('medium');
                    onEditClass(chip);
                  }
                : undefined
            }
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={onCreateClass}
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>+ New class</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {current === undefined || current.kind === 'all' ? 'ALL DECKS' : `DECKS · ${current.name.toUpperCase()}`}
        </Text>
        <Text style={styles.hint}>Tap a deck to study only it</Text>
      </View>

      {decks.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={onImport} style={styles.empty}>
          <Text style={styles.emptyTitle}>No decks yet</Text>
          <Text style={styles.emptyHint}>Tap to import your first deck.</Text>
        </Pressable>
      ) : (
        <View style={styles.list}>
          {shown.map((deck) => (
            <View key={deck.id}>
              <Row
                title={deck.title}
                subtitle={`${deck.questions} question${deck.questions === 1 ? '' : 's'}${
                  deck.className === null ? '' : ` · ${deck.className}`
                }`}
                accent={null}
                selected={selectedDeckId === deck.id}
                today={deck.today}
                due={deck.due}
                testID={`deck-today-${deck.id}`}
                onPress={() => {
                  hapticImpact('light');
                  play('tap');
                  onSelectDeck(deck);
                }}
                onLongPress={() => {
                  setMenuDeck((open) => (open === deck.id ? null : deck.id));
                }}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Options for ${deck.title}`}
                    hitSlop={8}
                    onPress={() => {
                      setMenuDeck((open) => (open === deck.id ? null : deck.id));
                    }}
                    style={styles.more}
                  >
                    <Text style={styles.moreGlyph}>⋯</Text>
                  </Pressable>
                }
              />
              {menuDeck === deck.id ? (
                <View style={styles.menu}>
                  <MenuButton
                    label="Questions"
                    testID={`deck-open-${deck.id}`}
                    onPress={() => {
                      onOpenDeck(deck, 'all');
                    }}
                  />
                  <MenuButton
                    label="Move"
                    onPress={() => {
                      setMenuDeck(null);
                      onMoveDeck(deck);
                    }}
                  />
                  <MenuButton
                    label="Delete"
                    danger
                    onPress={() => {
                      setMenuDeck(null);
                      onDelete(deck);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))}
          {decks.length > DECKS_SHOWN ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setShowAll((value) => !value);
              }}
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>
                {showAll ? 'Show fewer' : `Show all ${decks.length} decks`}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onImport}
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>+ Import a deck</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** One row: a name, what it holds, and today's counts. */
function Row({
  title,
  subtitle,
  accent,
  selected,
  today,
  due,
  testID,
  trailing,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle: string;
  accent: string | null;
  selected: boolean;
  today: { new: number; learning: number; due: number } | undefined;
  due: number;
  testID?: string;
  trailing?: ReactNode;
  onPress: () => void;
  onLongPress?: (() => void) | undefined;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.bar,
          { backgroundColor: accent ?? (selected ? colors.primaryLight : 'rgba(255,255,255,0.18)') },
        ]}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {today !== undefined ? (
        <View style={styles.counts}>
          <Count value={today.new} label="new" color={STAGE_COLORS.new} />
          <Count value={today.learning} label="learn" color={STAGE_COLORS.learning} />
          <Count value={today.due} label="due" color={STAGE_COLORS.review} />
        </View>
      ) : (
        <View style={styles.counts}>
          <Count value={due} label="due" color={STAGE_COLORS.review} />
        </View>
      )}
      {trailing}
    </Pressable>
  );
}

function Count({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, { color: value === 0 ? 'rgba(255,255,255,0.35)' : color }]}>
        {value}
      </Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function MenuButton({
  label,
  danger = false,
  testID,
  onPress,
}: {
  label: string;
  danger?: boolean;
  testID?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
    >
      <Text style={[styles.menuText, danger ? { color: colors.danger } : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  title: { color: colors.text, fontFamily: fonts.title, fontSize: 13, letterSpacing: 1, flexShrink: 1 },
  hint: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12 },
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingRight: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#181a22',
    overflow: 'hidden',
  },
  rowSelected: { borderColor: '#7b61ff', backgroundColor: '#22214a' },
  pressed: { opacity: 0.8 },
  bar: { alignSelf: 'stretch', width: 4 },
  rowText: { flex: 1, paddingVertical: 10, gap: 2 },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSub: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12 },
  counts: { flexDirection: 'row', gap: 10 },
  count: { alignItems: 'center', minWidth: 30 },
  countValue: { fontFamily: fonts.title, fontSize: 16 },
  countLabel: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 10 },
  more: { paddingHorizontal: 6, paddingVertical: 4 },
  moreGlyph: { color: colors.textMuted, fontFamily: fonts.title, fontSize: 20 },
  menu: { flexDirection: 'row', gap: 6, paddingTop: 6 },
  menuButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  menuText: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  linkRow: { alignItems: 'center', paddingVertical: 10 },
  linkText: { color: colors.primaryLight, fontFamily: fonts.bodyBold, fontSize: 13 },
  empty: {
    gap: 2,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#181a22',
  },
  emptyTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  emptyHint: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13 },
});
