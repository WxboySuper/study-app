import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { LocalClass } from '@/db/local';
import { CLASS_COLORS } from '@/study/decks';
import { colors, fonts, radius, spacing } from '@/theme';
import { GameButton, GlassCard } from '@/ui';

/**
 * The sheets of the classes.
 *
 * Three small sheets live here: the one that creates a class, the one that
 * renames (or deletes) a class and the one that moves a deck to another
 * class. They all look like the rest of the game: a glassy card, chunky
 * buttons and a colored dot to pick the color of the class.
 */

/** The props of the sheet that creates a class. */
export interface CreateClassSheetProps {
  /** Called when the player closes the sheet. */
  onCancel: () => void;
  /** Called when the player creates the class (with its name and its color). */
  onCreate: (name: string, color: string) => void;
}

/** The sheet that creates a class. */
export function CreateClassSheet({ onCancel, onCreate }: CreateClassSheetProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(CLASS_COLORS[0] ?? '#7b61ff');
  const trimmed = name.trim();

  return (
    <Sheet onCancel={onCancel} title="NEW CLASS" tint={colors.primaryLight}>
      <Text style={styles.hint}>
        A class groups your decks: pick one subject, one exam or one week, and study all of it at
        once.
      </Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Class name"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="sentences"
        autoCorrect={false}
        accessibilityLabel="The name of the class"
        returnKeyType="done"
        onSubmitEditing={() => {
          if (trimmed !== '') {
            onCreate(trimmed, color);
          }
        }}
      />

      <Text style={styles.label}>COLOR</Text>
      <View style={styles.colors}>
        {CLASS_COLORS.map((entry) => (
          <Pressable
            key={entry}
            accessibilityRole="button"
            accessibilityLabel={`The color ${entry}`}
            accessibilityState={{ selected: entry === color }}
            onPress={() => {
              setColor(entry);
            }}
            style={({ pressed }) => [
              styles.color,
              { backgroundColor: entry },
              entry === color ? styles.colorSelected : null,
              pressed ? styles.colorPressed : null,
            ]}
          />
        ))}
      </View>

      <GameButton
        label="CREATE CLASS"
        variant="primary"
        size="lg"
        disabled={trimmed === ''}
        onPress={() => {
          onCreate(trimmed, color);
        }}
      />
      <GameButton label="CANCEL" variant="ghost" size="md" onPress={onCancel} />
    </Sheet>
  );
}

/** The props of the sheet that renames (or deletes) a class. */
export interface EditClassSheetProps {
  /** The class that is edited. */
  entry: LocalClass;
  /** Called when the player closes the sheet. */
  onCancel: () => void;
  /** Called when the player renames the class. */
  onRename: (name: string) => void;
  /** Called when the player deletes the class. */
  onDelete: () => void;
}

/** The sheet that renames (or deletes) a class. */
export function EditClassSheet({ entry, onCancel, onRename, onDelete }: EditClassSheetProps) {
  const [name, setName] = useState(entry.name);
  const [confirming, setConfirming] = useState(false);
  const trimmed = name.trim();

  useEffect(() => {
    setName(entry.name);
    setConfirming(false);
  }, [entry.id, entry.name]);

  return (
    <Sheet onCancel={onCancel} title="EDIT CLASS" tint={colors.ticket}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Class name"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="sentences"
        autoCorrect={false}
        accessibilityLabel="The name of the class"
        returnKeyType="done"
      />

      <GameButton
        label="SAVE NAME"
        variant="primary"
        size="lg"
        disabled={trimmed === '' || trimmed === entry.name}
        onPress={() => {
          onRename(trimmed);
        }}
      />

      {confirming ? (
        <>
          <Text style={styles.warning}>
            “{entry.name}” goes away. Its decks are kept: they go back to the Unsorted bucket.
          </Text>
          <GameButton
            label="KEEP IT"
            variant="ghost"
            size="md"
            onPress={() => {
              setConfirming(false);
            }}
          />
          <GameButton
            label="DELETE THE CLASS"
            variant="danger"
            size="md"
            onPress={onDelete}
          />
        </>
      ) : (
        <GameButton
          label="DELETE THE CLASS"
          variant="danger"
          size="md"
          onPress={() => {
            setConfirming(true);
          }}
        />
      )}

      <GameButton label="CANCEL" variant="ghost" size="md" onPress={onCancel} />
    </Sheet>
  );
}

/** The props of the sheet that moves a deck to another class. */
export interface MoveDeckSheetProps {
  /** The name of the deck that moves. */
  deckTitle: string;
  /** The classes of the player. */
  classes: readonly LocalClass[];
  /** The class of the deck right now (`null` when it has none). */
  currentClassId: string | null;
  /** Called when the player closes the sheet. */
  onCancel: () => void;
  /** Called when the player picks a class (`null` is the Unsorted bucket). */
  onPick: (classId: string | null) => void;
}

/** The sheet that moves a deck to another class. */
export function MoveDeckSheet({
  deckTitle,
  classes,
  currentClassId,
  onCancel,
  onPick,
}: MoveDeckSheetProps) {
  return (
    <Sheet onCancel={onCancel} title="MOVE THE DECK" tint={colors.collection}>
      <Text style={styles.hint}>“{deckTitle}” goes to the class you pick.</Text>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {classes.map((entry) => (
          <ClassRow
            key={entry.id}
            name={entry.name}
            color={entry.color}
            selected={entry.id === currentClassId}
            onPress={() => {
              onPick(entry.id);
            }}
          />
        ))}
        <ClassRow
          name="Unsorted"
          color={null}
          selected={currentClassId === null}
          onPress={() => {
            onPick(null);
          }}
        />
      </ScrollView>

      <GameButton label="CANCEL" variant="ghost" size="md" onPress={onCancel} />
    </Sheet>
  );
}

/** One class of the list of the "move the deck" sheet. */
function ClassRow({
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
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={[styles.dot, { backgroundColor: color ?? colors.textDim }]} />
      <Text style={styles.rowTitle}>{name}</Text>
      {selected ? <Text style={styles.rowCheck}>✓</Text> : null}
    </Pressable>
  );
}

/** The frame of the sheets of the game. */
function Sheet({
  title,
  tint,
  onCancel,
  children,
}: {
  title: string;
  tint: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <GlassCard style={styles.card} contentStyle={styles.content} tint={tint}>
          <Text style={styles.title}>{title}</Text>
          {children}
        </GlassCard>
      </View>
    </Modal>
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
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: colors.warning,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  input: {
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  color: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: '#ffffff',
  },
  colorPressed: {
    opacity: 0.75,
  },
  list: {
    maxHeight: 260,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    opacity: 0.8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  rowTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  rowCheck: {
    color: colors.collection,
    fontFamily: fonts.title,
    fontSize: 15,
  },
});
