import {
  PACKS,
  canOpenPack,
  emptyWallet,
  findCritter,
  isPackAvailable,
  localDayKey,
  type CritterDef,
  type PackDef,
  type WalletSnapshot,
} from '@study-app/core';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalStore } from '@/db/local';
import { hapticError } from '@/haptics';
import { play } from '@/sound/sfx';
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

/** The opening of a pack that is on the screen. */
interface Opening {
  /** The pack that was opened. */
  pack: PackDef;
  /** The critter that came out of it. */
  critter: CritterDef | null;
  /** `true` when the player already owned the critter. */
  duplicate: boolean;
  /** The number of the opening: it changes every time a pack is opened. */
  runId: number;
}

export function PacksScreen() {
  const params = useLocalSearchParams<{ demo?: string }>();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [owned, setOwned] = useState<Map<string, number>>(new Map());
  const [useTicket, setUseTicket] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  /** `true` when the player can pay for another pack. */
  const [canOpenAnother, setCanOpenAnother] = useState(true);
  /** Changes every time the player has to be told that the pack is too dear. */
  const [shakeToken, setShakeToken] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const store = await openLocalStore();
      const today = localDayKey(new Date());
      const nextWallet = await store.readWallet(today);
      setWallet(nextWallet);
      setOwned(await store.readCollection());
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

  // The demo of the web build opens the reveal of a pack right away.
  useEffect(() => {
    if (params.demo !== 'reveal') {
      return;
    }
    const pack = PACKS[0];
    if (pack === undefined) {
      return;
    }
    const critter = pack.critters.find((entry) => entry.rarity === 'epic') ?? pack.critters[0];
    if (critter === undefined) {
      return;
    }
    setOpening({ pack, critter, duplicate: false, runId: 1 });
  }, [params.demo]);

  /**
   * Whether the player can pay for another pack.
   *
   * The check follows the wallet, so the button of the reveal is dimmed as
   * soon as the tokens run out.
   */
  useEffect(() => {
    if (opening === null || wallet === null) {
      return;
    }
    setCanOpenAnother(
      canOpenPack(wallet, opening.pack, Date.now(), {
        useTicket: useTicket && wallet.packTickets > 0,
      }).ok,
    );
  }, [opening, useTicket, wallet]);

  const onOpen = useCallback(
    async (pack: PackDef) => {
      if (busy) {
        return;
      }

      setBusy(true);
      setMessage(null);
      play('tap');

      try {
        const store = await openLocalStore();
        const result = await store.buyAndOpenPack(pack.id, {
          useTicket: useTicket && (wallet?.packTickets ?? 0) > 0,
        });

        if (!result.ok) {
          setMessage(result.message);
          setBusy(false);
          return;
        }

        setWallet(result.wallet);
        setCanOpenAnother(
          canOpenPack(result.wallet, pack, Date.now(), {
            useTicket: useTicket && result.wallet.packTickets > 0,
          }).ok,
        );
        play('coin');
        setOpening((current) => ({
          pack,
          critter: findCritter(result.critterId) ?? null,
          duplicate: result.duplicate,
          runId: (current?.runId ?? 0) + 1,
        }));
        // The purchase is done: the reveal must accept "Open another" (a
        // busy flag left on made that button a no-op).
        setBusy(false);
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

  /**
   * Opens the same pack again.
   *
   * The balance and the pack tickets are checked again before anything
   * happens: the show only starts when the pack can really be paid for.
   * When it cannot, the reveal shakes and the player is told why.
   */
  const onOpenAnother = useCallback(() => {
    const current = opening;
    if (current === null || busy) {
      return;
    }

    const walletNow = wallet ?? emptyWallet(localDayKey(new Date()));
    const check = canOpenPack(walletNow, current.pack, Date.now(), {
      useTicket: useTicket && walletNow.packTickets > 0,
    });

    if (!check.ok) {
      setCanOpenAnother(false);
      setShakeToken((token) => token + 1);
      setMessage(check.message);
      hapticError();
      play('wrong');
      return;
    }

    // The show starts again from the beginning, with a fresh pack.
    setBusy(true);
    setOpening({ ...current, runId: current.runId + 1 });

    void (async () => {
      try {
        const store = await openLocalStore();
        const result = await store.buyAndOpenPack(current.pack.id, {
          useTicket: check.useTicket,
        });

        if (!result.ok) {
          setMessage(result.message);
          setCanOpenAnother(false);
          setShakeToken((token) => token + 1);
          hapticError();
          play('wrong');
          setBusy(false);
          return;
        }

        setWallet(result.wallet);
        setCanOpenAnother(
          canOpenPack(result.wallet, current.pack, Date.now(), {
            useTicket: useTicket && result.wallet.packTickets > 0,
          }).ok,
        );
        play('coin');
        setOpening((latest) =>
          latest === null
            ? latest
            : {
                ...latest,
                critter: findCritter(result.critterId) ?? null,
                duplicate: result.duplicate,
              },
        );
        setBusy(false);
      } catch {
        setMessage('The pack could not be opened.');
        setShakeToken((token) => token + 1);
        setBusy(false);
      }
    })();
  }, [busy, opening, useTicket, wallet]);

  const tickets = wallet?.packTickets ?? 0;
  const balance = wallet?.balance ?? 0;
  const ownedCount = useMemo(() => owned.size, [owned]);

  return (
    <GameBackground variant="packs">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader title="PACK SHOP" subtitle="Open a pack, find a critter" />

          <GlassCard contentStyle={styles.wallet} tint={colors.ticket}>
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

          {PACKS.filter((pack) => pack.availableUntil === null || Date.now() < pack.availableUntil).map((pack) => (
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
          runId={opening?.runId ?? 0}
          pack={opening?.pack ?? PACKS[0]!}
          critter={opening?.critter ?? null}
          duplicate={opening?.duplicate ?? false}
          canOpenAnother={canOpenAnother}
          shakeToken={shakeToken}
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
