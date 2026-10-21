import {
  PACKS,
  findCritter,
  isPackAvailable,
  localDayKey,
  type CritterDef,
  type PackDef,
  type WalletSnapshot,
} from '@study-app/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalDatabase } from '@/db/local';
import { buyAndOpenPack } from '@/db/packs';
import { readCollection, readWallet } from '@/db/wallet';
import { colors, fonts, radius } from '@/theme';
import { GameBackground, GlassCard, ScreenHeader, TokenCounter } from '@/ui';

import { PackCard } from './PackCard';
import { PackOpening } from './PackOpening';

/**
 * The pack shop.
 *
 * Every pack is a big pouch in the gradient of its theme, with the critters
 * that peek out of it, the price as a pill of tokens and (for a seasonal
 * pack) a ribbon with the countdown. A tap buys the pack (with tokens or
 * with a pack ticket) and opens it right there.
 */

export function PacksScreen() {
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [owned, setOwned] = useState<Map<string, number>>(new Map());
  const [useTicket, setUseTicket] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState<{
    pack: PackDef;
    critter: CritterDef | null;
    duplicate: boolean;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const db = await openLocalDatabase();
      const today = localDayKey(new Date());
      const nextWallet = await readWallet(db, today);
      setWallet(nextWallet);
      setOwned(await readCollection(db));
    } catch {
      // The shop stays empty when the local store cannot be read.
    }
  }, []);

  // The wallet is re-read whenever the shop comes back into focus.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onOpen = useCallback(
    async (pack: PackDef, force = false) => {
      if (busy && !force) {
        return;
      }

      setBusy(true);
      setMessage(null);

      try {
        const db = await openLocalDatabase();
        const result = await buyAndOpenPack(db, pack.id, {
          useTicket: useTicket && (wallet?.packTickets ?? 0) > 0,
        });

        if (!result.ok) {
          setMessage(result.message);
          setBusy(false);
          return;
        }

        setWallet(result.wallet);
        setOpening({
          pack,
          critter: findCritter(result.critterId) ?? null,
          duplicate: result.duplicate,
        });
      } catch {
        setMessage('The pack could not be opened.');
        setBusy(false);
      }
    },
    [busy, useTicket, wallet],
  );

  const onClose = useCallback(() => {
    setOpening(null);
    setBusy(false);
    void refresh();
  }, [refresh]);

  const onOpenAnother = useCallback(() => {
    const pack = opening?.pack;
    if (pack === undefined) {
      return;
    }
    setOpening(null);
    setBusy(false);
    void onOpen(pack, true);
  }, [onOpen, opening?.pack]);

  const tickets = wallet?.packTickets ?? 0;
  const balance = wallet?.balance ?? 0;
  const ownedCount = useMemo(() => owned.size, [owned]);

  return (
    <GameBackground variant="packs">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="PACK SHOP"
            subtitle="Open a pack, find a critter"
            right={
              <GlassCard borderRadius={radius.chip} elevated={false} style={styles.headerChip}>
                <TokenCounter value={balance} size={18} />
              </GlassCard>
            }
          />

          <GlassCard style={styles.wallet} tint={colors.ticket}>
            <View style={styles.walletCell}>
              <TokenCounter value={balance} size={20} />
              <Text style={styles.walletLabel}>tokens</Text>
            </View>
            <View style={styles.walletDivider} />
            <View style={styles.walletCell}>
              <Text style={styles.walletValue}>🎟️ {tickets}</Text>
              <Text style={styles.walletLabel}>tickets</Text>
            </View>
            <View style={styles.walletDivider} />
            <View style={styles.walletCell}>
              <Text style={styles.walletValue}>🐾 {ownedCount}</Text>
              <Text style={styles.walletLabel}>critters</Text>
            </View>
          </GlassCard>

          {tickets > 0 ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: useTicket }}
              onPress={() => {
                setUseTicket((current) => !current);
              }}
              style={({ pressed }) => [
                styles.ticketToggle,
                useTicket ? styles.ticketToggleOn : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.ticketToggleText}>
                {useTicket ? '🎟️ Using a ticket (free)' : '🎟️ Use a ticket instead of tokens'}
              </Text>
            </Pressable>
          ) : null}

          {message === null ? null : (
            <View style={styles.message}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          )}

          {PACKS.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              owned={owned}
              available={isPackAvailable(pack, Date.now())}
              affordable={balance >= pack.priceTokens || tickets > 0}
              busy={busy}
              useTicket={useTicket}
              tickets={tickets}
              countdown={<PackCountdown until={pack.availableUntil} />}
              onOpen={() => {
                void onOpen(pack);
              }}
            />
          ))}
        </ScrollView>

        <PackOpening
          visible={opening !== null}
          pack={opening?.pack ?? PACKS[0]!}
          critter={opening?.critter ?? null}
          duplicate={opening?.duplicate ?? false}
          onContinue={onClose}
          onOpenAnother={onOpenAnother}
        />
      </SafeAreaView>
    </GameBackground>
  );
}

/** The countdown of the window of a seasonal pack. */
function PackCountdown({ until }: { until: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) {
      return undefined;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [until]);

  if (until === null) {
    return <Text style={styles.countdown}>Always on sale</Text>;
  }

  const left = until - now;
  if (left <= 0) {
    return <Text style={styles.closed}>Closed</Text>;
  }

  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);

  return (
    <Text style={styles.countdown}>
      ⏳ {days}d {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m{' '}
      {String(seconds).padStart(2, '0')}s
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 14,
  },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerChipText: {
    fontSize: 14,
  },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  walletCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  walletDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  walletValue: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  walletLabel: {
    color: colors.textDim,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketToggle: {
    borderRadius: radius.button,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  ticketToggleOn: {
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderColor: colors.ticket,
  },
  pressed: {
    opacity: 0.75,
  },
  ticketToggleText: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  message: {
    borderRadius: radius.button,
    backgroundColor: colors.danger,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  messageText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    textAlign: 'center',
  },
  countdown: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  closed: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
