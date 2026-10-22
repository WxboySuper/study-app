import { ADMIN_TOKEN_GRANT } from '@study-app/core';
import { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { openLocalStore } from '@/db/local';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, spacing } from '@/theme';
import { GameButton, GlassCard } from '@/ui';

/**
 * The hidden admin panel of the game.
 *
 * A long press on the little version label of the home screen opens it. It is
 * for the developer of the app: it clears the collection, resets the tokens
 * and the daily wheel. Every destructive action asks again before it runs.
 */

/** What an action of the panel does. */
type AdminAction = 'clearCollection' | 'resetTokens' | 'grantTokens' | 'resetSpin';

/** The props of the panel. */
export interface AdminPanelProps {
  /** `true` while the panel is open. */
  visible: boolean;
  /** Closes the panel. */
  onClose: () => void;
  /** Called after an action changed the store. */
  onChanged: () => void;
}

interface ActionDef {
  id: AdminAction;
  label: string;
  hint: string;
  variant: 'danger' | 'collection' | 'secondary' | 'ghost';
  /** The question of the confirmation sheet (`null` runs right away). */
  confirm: string | null;
}

/** The actions of the panel, in the order of the buttons. */
const ACTIONS: readonly ActionDef[] = [
  {
    id: 'clearCollection',
    label: 'CLEAR ALL CRITTERS',
    hint: 'Removes every critter from the collection.',
    variant: 'danger',
    confirm: 'Clear every critter? The collection starts over.',
  },
  {
    id: 'resetTokens',
    label: 'RESET TOKENS TO 0',
    hint: 'The token balance goes back to zero.',
    variant: 'secondary',
    confirm: 'Set the token balance to zero?',
  },
  {
    id: 'grantTokens',
    label: `ADD ${ADMIN_TOKEN_GRANT} TOKENS`,
    hint: 'A gift from the developer.',
    variant: 'collection',
    confirm: null,
  },
  {
    id: 'resetSpin',
    label: 'RESET SPIN COOLDOWN',
    hint: 'The daily wheel can be spun again.',
    variant: 'ghost',
    confirm: 'Forget the spins, so the wheel is ready again?',
  },
];

export function AdminPanel({ visible, onClose, onChanged }: AdminPanelProps) {
  /** The action that is waiting for a confirmation. */
  const [pending, setPending] = useState<ActionDef | null>(null);
  /** `true` while an action is running. */
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    (action: ActionDef) => {
      setPending(null);
      setBusy(true);

      void (async () => {
        try {
          const store = await openLocalStore();

          switch (action.id) {
            case 'clearCollection':
              await store.clearCollection();
              break;
            case 'resetTokens':
              await store.resetTokens();
              break;
            case 'grantTokens':
              await store.addTokens(ADMIN_TOKEN_GRANT);
              break;
            case 'resetSpin':
              await store.resetSpinCooldown();
              break;
          }

          onChanged();
        } catch {
          // The store is not there: the panel stays open, nothing changed.
        } finally {
          setBusy(false);
        }
      })();
    },
    [onChanged],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <GlassCard style={styles.card} contentStyle={styles.content} tint={colors.danger}>
          <Text style={styles.title}>HIDDEN ADMIN</Text>
          <Text style={styles.subtitle}>Developer tools. Handle with care.</Text>

          {pending === null ? (
            <View style={styles.actions}>
              {ACTIONS.map((action) => (
                <View key={action.id} style={styles.action}>
                  <GameButton
                    label={action.label}
                    variant={action.variant}
                    size="md"
                    disabled={busy}
                    onPress={() => {
                      play('tap');
                      if (action.confirm === null) {
                        run(action);
                      } else {
                        setPending(action);
                      }
                    }}
                  />
                  <Text style={styles.hint}>{action.hint}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>{pending.confirm}</Text>
              <View style={styles.confirmRow}>
                <View style={styles.confirmButton}>
                  <GameButton
                    label="CANCEL"
                    variant="ghost"
                    size="md"
                    onPress={() => {
                      setPending(null);
                    }}
                  />
                </View>
                <View style={styles.confirmButton}>
                  <GameButton
                    label="DO IT"
                    variant="danger"
                    size="md"
                    disabled={busy}
                    onPress={() => {
                      run(pending);
                    }}
                  />
                </View>
              </View>
            </View>
          )}

          <GameButton label="CLOSE" variant="ghost" size="md" onPress={onClose} />
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 5, 8, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
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
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  actions: {
    gap: spacing.md,
  },
  action: {
    gap: 4,
  },
  hint: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    textAlign: 'center',
  },
  confirm: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  confirmText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  confirmButton: {
    flex: 1,
  },
});
