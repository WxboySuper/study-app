import { parseDeck, type ParsedDeck } from '@study-app/core';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalStore } from '@/db/local';
import { FALLBACK_DECK_NAME } from '@/import/deck';
import { PreviewSheet } from '@/import/PreviewSheet';
import { pickDeckFile, readClipboardText } from '@/import/sources';
import { useSettings } from '@/settings';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, spacing } from '@/theme';
import { GameBackground, GameButton, GlassCard, ScreenHeader } from '@/ui';

/**
 * The import screen.
 *
 * Importing a deck is one tap: the player copies their deck (or opens the
 * file they got), taps **PASTE FROM CLIPBOARD** (or **OPEN FILE**) and the
 * app reads it, parses it and shows what it found. One more tap and the
 * cards are in the game: a new deck in the picker, ready to study.
 *
 * The rules of the formats live in `docs/DECK-FORMAT.md` (and in
 * `parseDeck` of `@study-app/core`).
 */

/** How long the success toast stays on the screen. */
const TOAST_MS = 1100;

/** How long an error toast stays on the screen. */
const ERROR_TOAST_MS = 3200;

/** The toast that tells the player what happened. */
interface Toast {
  /** What the toast says. */
  text: string;
  /** `true` when the toast reports a problem. */
  error: boolean;
}

export default function ImportScreen() {
  const router = useRouter();
  const { setScope } = useSettings();

  /** The deck that is waiting to be confirmed in the preview sheet. */
  const [deck, setDeck] = useState<ParsedDeck | null>(null);
  /** The name the player can give to the deck in the preview sheet. */
  const [name, setName] = useState('');
  /** `true` while the deck is being imported. */
  const [busy, setBusy] = useState(false);
  /** The toast of the screen. */
  const [toast, setToast] = useState<Toast | null>(null);
  /** `true` when the manual paste box is open (the fallback of the fallback). */
  const [manualOpen, setManualOpen] = useState(false);
  /** The text of the manual paste box. */
  const [manual, setManual] = useState('');

  // The toast goes away by itself, so it never hides the screen.
  useEffect(() => {
    if (toast === null) {
      return undefined;
    }

    const timer = setTimeout(
      () => {
        setToast(null);
      },
      toast.error ? ERROR_TOAST_MS : TOAST_MS,
    );

    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  /** Shows a toast on the screen. */
  const say = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);

  /**
   * Opens the preview of a deck, or explains why it cannot be read.
   *
   * The name of the deck is the one of the JSON deck, or the one of the file
   * without its extension, or the fallback.
   */
  const preview = useCallback(
    (text: string, fallbackName: string) => {
      if (text.trim() === '') {
        say('That deck is empty. Copy a deck first, then try again.');
        return;
      }

      const parsed = parseDeck(text, fallbackName);

      if (parsed.cards.length === 0) {
        say(parsed.errors[0] ?? 'No question could be read in that deck.');
        return;
      }

      setDeck(parsed);
      setName('');
    },
    [say],
  );

  /** Reads the clipboard and shows the preview of the deck it holds. */
  const onPaste = useCallback(() => {
    play('tap');

    void (async () => {
      let text = '';

      try {
        text = await readClipboardText();
      } catch {
        say('The clipboard could not be read. Copy your deck, then tap again.');
        return;
      }

      if (text.trim() === '') {
        say('The clipboard is empty. Copy a deck first, then tap again.');
        return;
      }

      preview(text, FALLBACK_DECK_NAME);
    })();
  }, [preview, say]);

  /** Opens a deck file and shows the preview of it. */
  const onOpenFile = useCallback(() => {
    play('tap');

    void (async () => {
      let picked = null;

      try {
        picked = await pickDeckFile();
      } catch {
        say('That file could not be opened. Pick another one.');
        return;
      }

      if (picked === null) {
        say('No file was picked. Open a deck file, or paste it instead.');
        return;
      }

      preview(picked.text, picked.name === '' ? FALLBACK_DECK_NAME : picked.name);
    })();
  }, [preview, say]);

  /** Opens the preview of the deck that was typed in the manual box. */
  const onPreviewManual = useCallback(() => {
    preview(manual, FALLBACK_DECK_NAME);
  }, [manual, preview]);

  /** Puts the cards of the deck in the game. */
  const onConfirm = useCallback(() => {
    if (deck === null || busy) {
      return;
    }

    setBusy(true);
    play('tap');

    void (async () => {
      try {
        const store = await openLocalStore();
        const title = name.trim() === '' ? deck.name : name.trim();
        const result = await store.importDeck(title, deck.cards);

        if (!result.ok || result.setId === null) {
          setBusy(false);
          say(result.message ?? 'The deck could not be imported.');
          return;
        }

        // The new deck is the one the player studies next.
        setScope({ kind: 'set', id: result.setId, title });
        play('correct');
        setDeck(null);
        say(`${result.cards} cards imported`);

        setTimeout(() => {
          router.replace('/');
        }, TOAST_MS);
      } catch {
        setBusy(false);
        say('The deck could not be imported.');
      }
    })();
  }, [busy, deck, name, router, say, setScope]);

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Import deck" subtitle="Paste a deck or open a file" />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <GlassCard style={styles.card} contentStyle={styles.cardContent}>
            <Text style={styles.label}>ADD A DECK</Text>
            <Text style={styles.hint}>
              Copy your deck first: a JSON deck, or one question per line with a TAB, " :: " or " | "
              between the question and its answers. The first answer is the right one, the next ones
              are the wrong ones (up to three).
            </Text>
          </GlassCard>

          <GameButton
            label="PASTE FROM CLIPBOARD"
            variant="primary"
            size="lg"
            onPress={onPaste}
            accessibilityHint="Reads the deck you copied and shows it before the import"
          />

          <GameButton
            label="OPEN FILE"
            variant="secondary"
            size="md"
            onPress={onOpenFile}
            accessibilityHint="Opens a deck file (JSON or text) and shows it before the import"
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Paste manually"
            accessibilityHint="Opens a text box to type or paste a deck"
            onPress={() => {
              play('tap');
              setManualOpen(!manualOpen);
            }}
            style={({ pressed }) => [styles.manualToggle, pressed && styles.manualTogglePressed]}
          >
            <Text style={styles.manualToggleText}>
              {manualOpen ? '▾ Paste manually' : '▸ Paste manually'}
            </Text>
          </Pressable>

          {manualOpen ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={80}
            >
              <GlassCard style={styles.card} contentStyle={styles.cardContent}>
                <TextInput
                  value={manual}
                  onChangeText={setManual}
                  placeholder={'question :: correct :: wrong1 :: wrong2 :: wrong3\nquestion\tcorrect\twrong'}
                  placeholderTextColor={colors.textDim}
                  style={[styles.input, styles.paste]}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="The cards of the deck"
                />
                <GameButton
                  label="PREVIEW"
                  variant="ghost"
                  size="md"
                  disabled={manual.trim() === ''}
                  onPress={onPreviewManual}
                />
              </GlassCard>
            </KeyboardAvoidingView>
          ) : null}
        </ScrollView>

        {toast === null ? null : (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={[styles.toast, toast.error ? styles.toastError : styles.toastOk]}
          >
            <Text style={styles.toastText}>{toast.text}</Text>
          </Animated.View>
        )}
      </SafeAreaView>

      {deck === null ? null : (
        <PreviewSheet
          deck={deck}
          name={name}
          onChangeName={setName}
          onCancel={() => {
            setDeck(null);
            setName('');
          }}
          onConfirm={onConfirm}
          busy={busy}
        />
      )}
    </GameBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.card,
  },
  cardContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  label: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  hint: {
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
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
    minHeight: 46,
  },
  paste: {
    minHeight: 140,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  manualToggle: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  manualTogglePressed: {
    opacity: 0.6,
  },
  manualToggleText: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: radius.button,
    backgroundColor: 'rgba(18, 20, 26, 0.96)',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastOk: {
    borderColor: colors.success,
  },
  toastError: {
    borderColor: colors.danger,
  },
  toastText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 14,
    textAlign: 'center',
  },
});
