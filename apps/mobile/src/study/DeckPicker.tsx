import { findCritter } from '@study-app/core';
import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { hapticImpact } from '@/haptics';
import { critterArt } from '@/packs/critterArt';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import { STAGE_COLORS } from '@/modes/fishing/stage';
import { GlassCard } from '@/ui';

import { chipKey, classGradient, type ClassChip, type DeckCard } from './decks';

/**
 * The deck picker of the home screen.
 *
 * The study scope is a row of chunky class chips (All, every class of the
 * player, Unsorted) and a shelf of deck cards below them. A class chip
 * studies every deck of the class, a deck card studies only that deck, and
 * a long press on a class chip opens the sheet that renames or deletes it.
 *
 * The selected chip glows, grows a little and shows a check mark; a press
 * dips the card down with a spring and buzzes the phone.
 */

/** The props of the picker. */
export interface DeckPickerProps {
  /** The chips of the class row (All, the classes of the player, Unsorted). */
  chips: readonly ClassChip[];
  /** The decks of the selected class. */
  decks: readonly DeckCard[];
  /** The key of the selected chip. */
  selectedChip: string;
  /** The id of the selected deck (`null` when no deck is selected). */
  selectedDeckId: string | null;
  /** Called when the player picks a class chip. */
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
  /** Called when the player opens the question list of a deck (`due` from the badge). */
  onOpenDeck: (deck: DeckCard, filter: 'all' | 'due') => void;
}

/** The critter that waves at the player when there is no deck yet. */
const EMPTY_CRITTER_ID = 'mnemo_the_memory_jelly';

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
  return (
    <View style={styles.root} testID="deck-picker">
      <View style={styles.header}>
        <Text style={styles.title}>STUDY CLASSES</Text>
        <Text style={styles.hint}>Pick a class to study it</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {chips.map((chip) => (
          <ClassTile
            key={chipKey(chip)}
            chip={chip}
            selected={selectedChip === chipKey(chip)}
            onPress={() => {
              onSelectChip(chip);
            }}
            onLongPress={
              chip.kind === 'class'
                ? () => {
                    onEditClass(chip);
                  }
                : undefined
            }
          />
        ))}

        <NewClassTile onPress={onCreateClass} />
      </ScrollView>

      <View style={styles.header}>
        <Text style={styles.title}>DECKS</Text>
        <Text style={styles.hint}>Tap a deck to study only it</Text>
      </View>

      {decks.length === 0 ? (
        <EmptyDecks onImport={onImport} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.shelf}
        >
          {decks.map((deck) => (
            <DeckTile
              key={deck.id}
              deck={deck}
              selected={selectedDeckId === deck.id}
              onPress={() => {
                onSelectDeck(deck);
              }}
              onMove={() => {
                onMoveDeck(deck);
              }}
              onDelete={() => {
                onDelete(deck);
              }}
              onOpen={(filter) => {
                onOpenDeck(deck, filter);
              }}
            />
          ))}

          <ImportTile onPress={onImport} />
        </ScrollView>
      )}
    </View>
  );
}

/** The chip that opens the sheet of a new class. */
function NewClassTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New class"
      accessibilityHint="Opens the sheet of a new class"
      onPress={() => {
        hapticImpact('light');
        play('tap');
        onPress();
      }}
      style={({ pressed }) => [styles.newClass, pressed && styles.pressed]}
    >
      <Text style={styles.newClassEmoji}>➕</Text>
      <Text style={styles.newClassTitle}>Class</Text>
    </Pressable>
  );
}

/** One chunky chip of the class row. */
function ClassTile({
  chip,
  selected,
  onPress,
  onLongPress,
}: {
  chip: ClassChip;
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const press = useSharedValue(0);
  const selectedValue = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedValue.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected, selectedValue]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + selectedValue.value * 0.04 - press.value * 0.05 }],
  }));

  const face = classGradient(chip.color, 0);

  return (
    <Animated.View style={[styles.chipWrap, selected ? styles.chipSelected : null, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${chip.name}. ${chip.questions} questions, ${chip.due} due`}
        accessibilityHint={
          chip.kind === 'class' ? 'Long press to rename or delete the class' : undefined
        }
        onPressIn={() => {
          press.value = withSpring(1, { damping: 18, stiffness: 320, mass: 0.6 });
        }}
        onPressOut={() => {
          press.value = withSpring(0, { damping: 14, stiffness: 240, mass: 0.5 });
        }}
        onPress={() => {
          hapticImpact('light');
          play('tap');
          onPress();
        }}
        onLongPress={
          onLongPress === undefined
            ? undefined
            : () => {
                hapticImpact('medium');
                onLongPress();
              }
        }
      >
        <GlassCard
          style={styles.chip}
          contentStyle={styles.chipContent}
          face={face}
          tint={colors.borderStrong}
          elevated={false}
        >
          <Text style={styles.chipEmoji}>{chip.emoji}</Text>
          <Text style={styles.chipTitle} numberOfLines={1}>
            {chip.name}
          </Text>
          <Text style={styles.chipMeta}>
            {chip.questions} question{chip.questions === 1 ? '' : 's'}
          </Text>
          {chip.due > 0 ? (
            <View style={styles.dueBadge}>
              <Text style={styles.dueText}>{chip.due} DUE</Text>
            </View>
          ) : null}
          {selected ? <Check /> : null}
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

/** The card that opens the import screen. */
function ImportTile({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.deckWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Import a deck"
        accessibilityHint="Opens the import screen"
        onPress={() => {
          hapticImpact('light');
          play('tap');
          onPress();
        }}
        style={({ pressed }) => [styles.importPressable, pressed && styles.importPressed]}
      >
        <View style={styles.importTile}>
          <Text style={styles.importEmoji}>➕</Text>
          <Text style={styles.importTitle}>Import deck</Text>
          <Text style={styles.importHint}>Paste TSV, JSON or "question :: correct :: wrong" lines</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** One deck of the shelf. */
function DeckTile({
  deck,
  selected,
  onPress,
  onMove,
  onDelete,
  onOpen,
}: {
  deck: DeckCard;
  selected: boolean;
  onPress: () => void;
  onMove: () => void;
  onDelete: () => void;
  onOpen: (filter: 'all' | 'due') => void;
}) {
  const press = useSharedValue(0);
  const selectedValue = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedValue.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected, selectedValue]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + selectedValue.value * 0.04 - press.value * 0.05 }],
  }));

  return (
    <Animated.View style={[styles.deckWrap, selected ? styles.selectedWrap : null, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${deck.title}. ${deck.questions} questions, ${deck.due} due`}
        accessibilityHint="Long press to delete the deck"
        onPressIn={() => {
          press.value = withSpring(1, { damping: 18, stiffness: 320, mass: 0.6 });
        }}
        onPressOut={() => {
          press.value = withSpring(0, { damping: 14, stiffness: 240, mass: 0.5 });
        }}
        onPress={() => {
          hapticImpact('light');
          play('tap');
          onPress();
        }}
        onLongPress={() => {
          hapticImpact('medium');
          onDelete();
        }}
      >
        <GlassCard
          style={styles.deck}
          contentStyle={styles.deckContent}
          face={deck.gradient}
          tint={colors.borderStrong}
          elevated={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move ${deck.title} to another class`}
            onPress={() => {
              onMove();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.move, pressed && styles.trashPressed]}
          >
            <Text style={styles.moveGlyph}>🗂️</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${deck.title}`}
            onPress={() => {
              onDelete();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.trash, pressed && styles.trashPressed]}
          >
            <Text style={styles.trashGlyph}>🗑</Text>
          </Pressable>

          <Text style={styles.deckEmoji}>{deck.emoji}</Text>
          <Text style={styles.deckEyebrow}>{deck.className ?? 'UNSORTED'}</Text>
          <Text style={styles.deckTitle} numberOfLines={2}>
            {deck.title}
          </Text>

          <View style={styles.deckMeta}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`See the ${deck.questions} questions of ${deck.title}`}
              testID={`deck-open-${deck.id}`}
              hitSlop={6}
              onPress={() => {
                hapticImpact('light');
                play('tap');
                onOpen('all');
              }}
              style={({ pressed }) => [styles.listChip, pressed && styles.trashPressed]}
            >
              <Text style={styles.deckQuestions}>
                {deck.questions} question{deck.questions === 1 ? '' : 's'} ›
              </Text>
            </Pressable>
            {deck.today !== undefined ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Today: ${deck.today.new} new, ${deck.today.learning} learning, ${deck.today.due} due`}
                testID={`deck-today-${deck.id}`}
                hitSlop={6}
                onPress={() => {
                  hapticImpact('light');
                  play('tap');
                  onOpen('due');
                }}
                style={({ pressed }) => [styles.todayBadge, pressed && styles.trashPressed]}
              >
                <Text style={[styles.todayNum, { color: STAGE_COLORS.new }]}>{deck.today.new}</Text>
                <Text style={[styles.todayNum, { color: STAGE_COLORS.learning }]}>{deck.today.learning}</Text>
                <Text style={[styles.todayNum, { color: STAGE_COLORS.review }]}>{deck.today.due}</Text>
              </Pressable>
            ) : deck.due > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`See the ${deck.due} due questions of ${deck.title}`}
                testID={`deck-due-${deck.id}`}
                hitSlop={6}
                onPress={() => {
                  hapticImpact('light');
                  play('tap');
                  onOpen('due');
                }}
                style={({ pressed }) => [styles.dueBadge, pressed && styles.trashPressed]}
              >
                <Text style={styles.dueText}>{deck.due} DUE ›</Text>
              </Pressable>
            ) : null}
          </View>

          {selected ? <Check /> : null}
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

/** The check mark of the selected chip or deck. */
function Check() {
  return (
    <View style={styles.check} pointerEvents="none">
      <Text style={styles.checkGlyph}>✓</Text>
    </View>
  );
}

/** The empty state: no deck yet, so a critter invites the player to import a set. */
function EmptyDecks({ onImport }: { onImport: () => void }) {
  const critter = findCritter(EMPTY_CRITTER_ID);
  const art = critter === undefined ? null : critterArt(critter);

  return (
    <GlassCard style={styles.empty} contentStyle={styles.emptyContent} elevated={false}>
      {art === null ? (
        <Text style={styles.emptyEmoji}>{critter?.emoji ?? '🐙'}</Text>
      ) : (
        <Image source={art} style={styles.emptyArt} resizeMode="contain" />
      )}

      <View style={styles.emptyText}>
        <Text style={styles.emptyTitle}>No decks yet</Text>
        <Text style={styles.emptyHint}>
          Import a set to fill your classes — then every question you study lives here.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Import a deck"
          accessibilityHint="Opens the import screen"
          onPress={() => {
            hapticImpact('light');
            play('tap');
            onImport();
          }}
          style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
        >
          <Text style={styles.emptyButtonText}>+ IMPORT DECK</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hint: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  chipRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
    paddingVertical: 4,
  },
  chipWrap: {
    width: 136,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: {
    borderColor: colors.primaryLight,
    ...shadow.glow,
  },
  chip: {
    borderRadius: radius.card,
    minHeight: 116,
  },
  chipContent: {
    padding: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 2,
    minHeight: 116,
  },
  chipEmoji: {
    fontSize: 26,
    marginBottom: spacing.xs,
  },
  chipTitle: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 15,
    lineHeight: 18,
  },
  chipMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  newClass: {
    width: 88,
    minHeight: 116,
    borderRadius: radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  newClassEmoji: {
    fontSize: 26,
  },
  newClassTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 13,
  },
  shelf: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
    paddingVertical: 4,
  },
  deckWrap: {
    width: 148,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedWrap: {
    borderColor: colors.primaryLight,
    ...shadow.glow,
  },
  deck: {
    borderRadius: radius.card,
    minHeight: 172,
  },
  deckContent: {
    padding: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 2,
    minHeight: 172,
  },
  deckEmoji: {
    fontSize: 34,
    marginBottom: spacing.xs,
  },
  deckEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.title,
    fontSize: 9,
    letterSpacing: 1.6,
  },
  deckTitle: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 16,
    lineHeight: 19,
  },
  deckMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  deckQuestions: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  listChip: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  dueBadge: {
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: colors.gold,
  },
  todayBadge: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 12, 28, 0.6)',
  },
  todayNum: {
    fontFamily: fonts.titleSemi,
    fontSize: 12,
  },
  dueText: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  checkGlyph: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 15,
    lineHeight: 18,
  },
  empty: {
    borderRadius: radius.card,
  },
  emptyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  emptyArt: {
    width: 64,
    height: 64,
  },
  emptyEmoji: {
    fontSize: 44,
  },
  emptyText: {
    flex: 1,
    gap: 2,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 17,
  },
  emptyHint: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
  },
  emptyButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: 'rgba(123, 97, 255, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  emptyButtonPressed: {
    opacity: 0.8,
  },
  emptyButtonText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 11,
    letterSpacing: 1,
  },
  move: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  trash: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  trashPressed: {
    opacity: 0.7,
  },
  moveGlyph: {
    fontSize: 13,
  },
  trashGlyph: {
    fontSize: 14,
  },
  importPressable: {
    borderRadius: radius.card,
  },
  importPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  importTile: {
    minHeight: 172,
    width: 148,
    borderRadius: radius.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  importEmoji: {
    fontSize: 30,
  },
  importTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 14,
  },
  importHint: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    textAlign: 'center',
  },
});
