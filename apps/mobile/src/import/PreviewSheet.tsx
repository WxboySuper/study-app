import type { ParsedDeck } from '@study-app/core';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { LocalClass } from '@/db/local';
import { colors, fonts, radius, spacing } from '@/theme';
import { GameButton, GlassCard } from '@/ui';

/**
 * The preview of a deck, before it is imported.
 *
 * The screen parses the deck the moment it is pasted or opened, and shows it
 * here: the name of the deck, how many questions it holds, how many of them
 * are multiple choice and how many are self-graded, the first questions with
 * their choices, and everything that could not be read.
 *
 * The deck also lands in a class: the player picks one of the classes of
 * the game (or creates a new one), so the deck shows up in the right pile
 * of the home screen.
 *
 * Nothing is written in the game until the player taps **IMPORT**.
 */

/** How many questions of the deck are shown in the preview. */
const PREVIEW_CARDS = 3;

/** How many problems of the deck are shown in the preview. */
const PREVIEW_ERRORS = 4;

/** The props of the preview sheet. */
export interface PreviewSheetProps {
  /** The deck that was parsed. */
  deck: ParsedDeck;
  /** The name of the deck (the player can change it). */
  name: string;
  /** Called when the player renames the deck. */
  onChangeName: (name: string) => void;
  /** The classes of the player. */
  classes: readonly LocalClass[];
  /** The class the deck lands in (`null` when it has none). */
  classId: string | null;
  /** Called when the player picks the class of the deck. */
  onChangeClass: (classId: string | null) => void;
  /** Called when the player wants a new class. */
  onCreateClass: (name: string) => void;
  /** Called when the player closes the sheet. */
  onCancel: () => void;
  /** Called when the player confirms the import. */
  onConfirm: () => void;
  /** `true` while the deck is being imported. */
  busy: boolean;
}

/** The preview of a deck, before it is imported. */
export function PreviewSheet({
  deck,
  name,
  onChangeName,
  classes,
  classId,
  onChangeClass,
  onCreateClass,
  onCancel,
  onConfirm,
  busy,
}: PreviewSheetProps) {
  const { total, multipleChoice, selfGrade } = deck.counts;
  const shown = deck.cards.slice(0, PREVIEW_CARDS);
  const title = name.trim() === '' ? deck.name : name.trim();
  const [newClassOpen, setNewClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <GlassCard style={styles.card} contentStyle={styles.content} tint={colors.ticket}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>

          <Text style={styles.counts}>
            {total} question{total === 1 ? '' : 's'} · {multipleChoice} multiple choice ·{' '}
            {selfGrade} self-graded
          </Text>

          {selfGrade > 0 ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                ⚠ {selfGrade} question{selfGrade === 1 ? '' : 's'} will be self-graded
              </Text>
            </View>
          ) : null}

          <Text style={styles.label}>CLASS</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.classRow}
          >
            <ClassChip
              name="Unsorted"
              color={null}
              selected={classId === null}
              onPress={() => {
                onChangeClass(null);
              }}
            />

            {classes.map((entry) => (
              <ClassChip
                key={entry.id}
                name={entry.name}
                color={entry.color}
                selected={entry.id === classId}
                onPress={() => {
                  onChangeClass(entry.id);
                }}
              />
            ))}

            <ClassChip
              name="+ New class…"
              color={null}
              selected={false}
              onPress={() => {
                setNewClassOpen((open) => !open);
              }}
            />
          </ScrollView>

          {newClassOpen ? (
            <View style={styles.newClass}>
              <TextInput
                value={newClassName}
                onChangeText={setNewClassName}
                placeholder="The name of the new class"
                placeholderTextColor={colors.textDim}
                style={styles.rename}
                autoCapitalize="sentences"
                autoCorrect={false}
                accessibilityLabel="The name of the new class"
                returnKeyType="done"
              />
              <GameButton
                label="CREATE"
                variant="secondary"
                size="sm"
                disabled={newClassName.trim() === ''}
                onPress={() => {
                  onCreateClass(newClassName.trim());
                  setNewClassName('');
                  setNewClassOpen(false);
                }}
              />
            </View>
          ) : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {shown.map((card, index) => (
              <View key={`${card.front}-${index}`} style={styles.previewCard}>
                <Text style={styles.previewFront} numberOfLines={2}>
                  {card.front}
                </Text>
                <Text style={styles.previewBack} numberOfLines={2}>
                  ✓ {card.back}
                </Text>
                {card.wrong.map((wrong, wrongIndex) => (
                  <Text key={`${wrong}-${wrongIndex}`} style={styles.previewWrong} numberOfLines={2}>
                    ✗ {wrong}
                  </Text>
                ))}
              </View>
            ))}

            {total > PREVIEW_CARDS ? (
              <Text style={styles.more}>+ {total - PREVIEW_CARDS} more questions</Text>
            ) : null}

            {deck.errors.slice(0, PREVIEW_ERRORS).map((error, index) => (
              <Text key={`${error}-${index}`} style={styles.error}>
                {error}
              </Text>
            ))}
            {deck.errors.length > PREVIEW_ERRORS ? (
              <Text style={styles.more}>+ {deck.errors.length - PREVIEW_ERRORS} more problems</Text>
            ) : null}
          </ScrollView>

          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder={`Rename (${deck.name})`}
            placeholderTextColor={colors.textDim}
            style={styles.rename}
            autoCapitalize="sentences"
            autoCorrect={false}
            accessibilityLabel="Rename the deck"
            returnKeyType="done"
          />

          <GameButton
            label={busy ? 'IMPORTING…' : 'IMPORT'}
            variant="primary"
            size="lg"
            disabled={busy}
            onPress={onConfirm}
          />
          <GameButton label="CANCEL" variant="ghost" size="md" onPress={onCancel} />
        </GlassCard>
      </View>
    </Modal>
  );
}

/** One chip of the class picker of the preview. */
function ClassChip({
  name,
  color,
  selected,
  onPress,
}: {
  name: string;
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.classChip,
        color === null ? null : { borderColor: color },
        selected ? styles.classChipSelected : null,
        pressed ? styles.classChipPressed : null,
      ]}
    >
      {color === null ? null : <View style={[styles.classDot, { backgroundColor: color }]} />}
      <Text style={styles.classChipText}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 5, 8, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: radius.card,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
    textAlign: 'center',
  },
  counts: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    textAlign: 'center',
  },
  chip: {
    alignSelf: 'center',
    borderRadius: radius.chip,
    backgroundColor: 'rgba(250, 204, 21, 0.16)',
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  classRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg,
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  classChipSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: 'rgba(123, 97, 255, 0.22)',
  },
  classChipPressed: {
    opacity: 0.75,
  },
  classChipText: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  classDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  newClass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chipText: {
    color: colors.warning,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    lineHeight: 15,
  },
  scroll: {
    maxHeight: 260,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  previewCard: {
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  previewFront: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  previewBack: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  previewWrong: {
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  more: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
  },
  rename: {
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
  },
});
