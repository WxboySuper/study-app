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
import { colors, fonts, gradients, radius, shadow, spacing } from '@/theme';
import { GlassCard } from '@/ui';

import type { DeckCard } from './decks';

/**
 * The deck picker of the home screen.
 *
 * The study scope is not a list of radio buttons anymore: it is a shelf of
 * chunky deck cards. "All" is the wide card in front of the shelf, every
 * topic and every set is a card of its own, in the gradient of its topic,
 * with the number of cards it holds and a badge for the ones that are due.
 *
 * The selected deck glows, grows a little and shows a check mark; a press
 * dips the card down with a spring and buzzes the phone.
 */

/** The props of the picker. */
export interface DeckPickerProps {
  /** The decks of the player (the topics and the sets). */
  decks: readonly DeckCard[];
  /** The id of the selected deck (`null` means "All decks"). */
  selectedId: string | null;
  /** How many cards every deck holds, together. */
  totalCards: number;
  /** How many of them are due. */
  totalDue: number;
  /** Called when the player picks a deck (`null` means "All decks"). */
  onSelect: (id: string | null) => void;
  /** Called when the player wants to import a new deck. */
  onImport: () => void;
  /** Called when the player wants to delete a deck. */
  onDelete: (deck: DeckCard) => void;
}

/** The critter that waves at the player when there is no deck yet. */
const EMPTY_CRITTER_ID = 'mnemo_the_memory_jelly';

export function DeckPicker({
  decks,
  selectedId,
  totalCards,
  totalDue,
  onSelect,
  onImport,
  onDelete,
}: DeckPickerProps) {
  return (
    <View style={styles.root} testID="deck-picker">
      <View style={styles.header}>
        <Text style={styles.title}>STUDY DECKS</Text>
        <Text style={styles.hint}>Pick a deck to study</Text>
      </View>

      <AllDecks
        selected={selectedId === null}
        cards={totalCards}
        due={totalDue}
        onPress={() => {
          onSelect(null);
        }}
      />

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
              key={`${deck.kind}-${deck.id}`}
              deck={deck}
              selected={selectedId === deck.id}
              onPress={() => {
                onSelect(deck.id);
              }}
              onDelete={() => {
                onDelete(deck);
              }}
            />
          ))}

          <ImportTile onPress={onImport} />
        </ScrollView>
      )}
    </View>
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
          <Text style={styles.importHint}>Paste TSV, JSON or "front :: back" lines</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** The wide card of "All decks". */
function AllDecks({
  selected,
  cards,
  due,
  onPress,
}: {
  selected: boolean;
  cards: number;
  due: number;
  onPress: () => void;
}) {
  const press = useSharedValue(0);
  const selectedValue = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedValue.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected, selectedValue]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + selectedValue.value * 0.015 - press.value * 0.02 },
    ],
  }));

  return (
    <Animated.View style={[styles.allWrap, selected ? styles.selectedWrap : null, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel="All decks. Every card of the game"
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
      >
        <GlassCard
          style={styles.allCard}
          contentStyle={styles.allContent}
          face={gradients.primary}
          tint={colors.primaryLight}
          elevated={false}
        >
          <Text style={styles.allEmoji}>🗺️</Text>

          <View style={styles.allText}>
            <Text style={styles.allKicker}>EVERYTHING</Text>
            <Text style={styles.allTitle}>All decks</Text>
            <Text style={styles.allMeta}>
              {cards} card{cards === 1 ? '' : 's'}
              {due > 0 ? ` · ${due} due` : ''}
            </Text>
          </View>

          {selected ? <Check /> : null}
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

/** One deck of the shelf. */
function DeckTile({
  deck,
  selected,
  onPress,
  onDelete,
}: {
  deck: DeckCard;
  selected: boolean;
  onPress: () => void;
  onDelete: () => void;
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
        accessibilityLabel={`${deck.title}. ${deck.cards} cards, ${deck.due} due`}
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
          <Text style={styles.deckEyebrow}>{deck.kind === 'topic' ? 'TOPIC' : 'SET'}</Text>
          <Text style={styles.deckTitle} numberOfLines={2}>
            {deck.title}
          </Text>

          <View style={styles.deckMeta}>
            <Text style={styles.deckCards}>
              {deck.cards} card{deck.cards === 1 ? '' : 's'}
            </Text>
            {deck.due > 0 ? (
              <View style={styles.dueBadge}>
                <Text style={styles.dueText}>{deck.due} DUE</Text>
              </View>
            ) : null}
          </View>

          {selected ? <Check /> : null}
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

/** The check mark of the selected deck. */
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
          Import a set to fill your decks — then every card you study lives here.
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
  allWrap: {
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedWrap: {
    borderColor: colors.primaryLight,
    ...shadow.glow,
  },
  allCard: {
    borderRadius: radius.card,
  },
  allContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  allEmoji: {
    fontSize: 34,
  },
  allText: {
    flex: 1,
    gap: 1,
  },
  allKicker: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.title,
    fontSize: 10,
    letterSpacing: 2,
  },
  allTitle: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 21,
  },
  allMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bodySemi,
    fontSize: 12,
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
  deckCards: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  dueBadge: {
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: colors.gold,
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
  },  emptyContent: {
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
