import { parseDeck } from '@study-app/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalStore } from '@/db/local';
import { useSettings } from '@/settings';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, spacing } from '@/theme';
import { GameBackground, GameButton, GlassCard, ScreenHeader } from '@/ui';

/**
 * The import screen.
 *
 * The player pastes a deck (a TSV paste, a list of `front :: back` lines or a
 * JSON file), the screen reads it live and shows what it found, and one tap
 * puts the cards in the game: a new deck in the picker, ready to study.
 *
 * The rules of the formats live in `docs/DECK-FORMAT.md` (and in
 * `parseDeck` of `@study-app/core`).
 */

/** The fewest cards a deck needs for the multiple choice questions. */
const MIN_CARDS_FOR_MULTIPLE_CHOICE = 4;

/** How long the success toast stays on the screen. */
const TOAST_MS = 1100;

export default function ImportScreen() {
  const router = useRouter();
  const { setScope } = useSettings();

  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // The live preview: the deck as it would be imported, right now.
  const preview = useMemo(
    () => parseDeck(text, name.trim() === '' ? 'Imported deck' : name.trim()),
    [name, text],
  );

  const cardCount = preview.cards.length;
  const canImport = cardCount > 0 && !busy;
  const tooSmall = cardCount > 0 && cardCount < MIN_CARDS_FOR_MULTIPLE_CHOICE;

  const onImport = () => {
    if (!canImport) {
      return;
    }

    setBusy(true);
    play('tap');

    void (async () => {
      try {
        const store = await openLocalStore();
        const result = await store.importDeck(preview.name, preview.cards);

        if (!result.ok || result.setId === null) {
          setBusy(false);
          setToast(result.message ?? 'The deck could not be imported.');
          return;
        }

        // The new deck is the one the player studies next.
        setScope({ kind: 'set', id: result.setId, title: preview.name });
        play('correct');
        setToast(`${result.cards} cards imported`);

        setTimeout(() => {
          router.replace('/');
        }, TOAST_MS);
      } catch {
        setBusy(false);
        setToast('The deck could not be imported.');
      }
    })();
  };

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Import deck" subtitle="Paste your cards" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <GlassCard style={styles.card} contentStyle={styles.cardContent}>
              <Text style={styles.label}>DECK NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="My deck"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                accessibilityLabel="The name of the deck"
                returnKeyType="next"
              />

              <Text style={styles.label}>CARDS</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={'front\tback\nfront :: back\nfront | back'}
                placeholderTextColor={colors.textDim}
                style={[styles.input, styles.paste]}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="The cards of the deck"
              />
              <Text style={styles.hint}>
                One card per line. A TAB, " :: " or " | " splits the front from the back. Lines
                that start with # are comments.
              </Text>
            </GlassCard>

            <GlassCard style={styles.card} contentStyle={styles.cardContent} tint={colors.ticket}>
              <View style={styles.previewHead}>
                <Text style={styles.label}>PREVIEW</Text>
                <Text style={styles.count}>
                  {cardCount} card{cardCount === 1 ? '' : 's'} detected
                  {cardCount > 0 ? ` · ${preview.format.toUpperCase()}` : ''}
                </Text>
              </View>

              {preview.cards.slice(0, 3).map((card, index) => (
                <View key={`${card.front}-${index}`} style={styles.previewCard}>
                  <Text style={styles.previewFront} numberOfLines={2}>
                    {card.front}
                  </Text>
                  <Text style={styles.previewBack} numberOfLines={2}>
                    {card.back}
                  </Text>
                </View>
              ))}

              {cardCount > 3 ? (
                <Text style={styles.more}>+ {cardCount - 3} more cards</Text>
              ) : null}

              {tooSmall ? (
                <Text style={styles.warning}>
                  ⚠ Multiple choice needs at least {MIN_CARDS_FOR_MULTIPLE_CHOICE} cards: the
                  distractors come from the other cards of the deck.
                </Text>
              ) : null}

              {preview.errors.slice(0, 4).map((error, index) => (
                <Text key={`${error}-${index}`} style={styles.error}>
                  {error}
                </Text>
              ))}
              {preview.errors.length > 4 ? (
                <Text style={styles.more}>+ {preview.errors.length - 4} more problems</Text>
              ) : null}
            </GlassCard>

            <GameButton
              label={busy ? 'IMPORTING…' : 'IMPORT DECK'}
              variant="primary"
              size="lg"
              disabled={!canImport}
              onPress={onImport}
            />
          </ScrollView>
        </KeyboardAvoidingView>

        {toast === null ? null : (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        )}
      </SafeAreaView>
    </GameBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
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
    minHeight: 160,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  count: {
    color: colors.ticket,
    fontFamily: fonts.title,
    fontSize: 11,
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
  more: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  warning: {
    color: colors.warning,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    lineHeight: 15,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
  },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: radius.button,
    backgroundColor: 'rgba(18, 20, 26, 0.96)',
    borderWidth: 1,
    borderColor: colors.success,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 14,
  },
});
