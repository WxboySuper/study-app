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
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalDatabase } from '@/db/local';
import { buyAndOpenPack } from '@/db/packs';
import { readCollection, readWallet } from '@/db/wallet';
import { colors, font, radius } from '@/theme';

import { critterArt } from './critterArt';
import { PackOpening } from './PackOpening';

/**
 * The pack shop.
 *
 * Every pack is a card with its art, its price and (for a seasonal pack) the
 * countdown of its window. A tap buys the pack (with tokens or with a pack
 * ticket) and opens it: the pack shakes, bursts and shows the critter.
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
    async (pack: PackDef) => {
      if (busy) {
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
        setOpening({ pack, critter: findCritter(result.critterId) ?? null, duplicate: result.duplicate });
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

  const tickets = wallet?.packTickets ?? 0;
  const balance = wallet?.balance ?? 0;
  const ownedCount = useMemo(() => owned.size, [owned]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>PACK SHOP</Text>

        <View style={styles.wallet}>
          <View style={styles.walletCell}>
            <Text style={styles.walletValue}>🪙 {balance}</Text>
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
        </View>

        {tickets > 0 ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: useTicket }}
            onPress={() => {
              setUseTicket((current) => !current);
            }}
            style={[styles.ticketToggle, useTicket ? styles.ticketToggleOn : null]}
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

        {PACKS.map((pack) => {
          const available = isPackAvailable(pack, Date.now());
          const affordable = balance >= pack.priceTokens || tickets > 0;

          return (
            <View key={pack.id} style={styles.packCard}>
              <View style={styles.packHeader}>
                <View style={styles.packHeaderText}>
                  <Text style={styles.packName}>{pack.name}</Text>
                  <Text style={styles.packMeta}>
                    {pack.critters.length} critters · {pack.kind === 'seasonal' ? 'seasonal' : 'always on sale'}
                  </Text>
                </View>
                {pack.kind === 'seasonal' ? (
                  <View style={styles.seasonBadge}>
                    <Text style={styles.seasonBadgeText}>SEASONAL</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.packArt}>
                {pack.critters.slice(0, 6).map((critter) => {
                  const art = critterArt(critter);
                  const count = owned.get(critter.id) ?? 0;
                  return art === null ? null : (
                    <View key={critter.id} style={styles.packArtCell}>
                      <Image source={art} style={styles.packSprite} />
                      {count > 0 ? (
                        <View style={styles.packArtBadge}>
                          <Text style={styles.packArtBadgeText}>{count}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              <View style={styles.packFooter}>
                <Text style={styles.price}>🪙 {pack.priceTokens}</Text>
                {available ? (
                  <PackCountdown until={pack.availableUntil} />
                ) : (
                  <Text style={styles.closed}>Closed</Text>
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={busy || !available || !affordable}
                onPress={() => {
                  void onOpen(pack);
                }}
                style={({ pressed }) => [
                  styles.openButton,
                  !available || !affordable ? styles.openButtonOff : null,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.openButtonText}>
                  {!available
                    ? 'Not on sale'
                    : !affordable
                      ? 'Not enough tokens'
                      : useTicket && tickets > 0
                        ? 'OPEN WITH TICKET'
                        : 'OPEN PACK'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <PackOpening
        visible={opening !== null}
        pack={opening?.pack ?? PACKS[0]!}
        critter={opening?.critter ?? null}
        duplicate={opening?.duplicate ?? false}
        onContinue={onClose}
      />
    </SafeAreaView>
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
    backgroundColor: colors.background,
  },
  content: {
    padding: 18,
    paddingBottom: 48,
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: font.heavy,
    letterSpacing: 2,
    textAlign: 'center',
  },
  wallet: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 12,
  },
  walletCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  walletDivider: {
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  walletValue: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: font.heavy,
  },
  walletLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: font.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketToggle: {
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 5,
    borderBottomColor: colors.backgroundDeep,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  ticketToggleOn: {
    backgroundColor: colors.ticket,
    borderBottomColor: colors.secondaryDark,
  },
  ticketToggleText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: font.bold,
  },
  message: {
    borderRadius: radius.button,
    backgroundColor: colors.danger,
    borderBottomWidth: 5,
    borderBottomColor: '#9f1239',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  messageText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: font.bold,
    textAlign: 'center',
  },
  packCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  packHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packHeaderText: {
    flex: 1,
  },
  packName: {
    color: colors.text,
    fontSize: 21,
    fontWeight: font.heavy,
  },
  packMeta: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: font.medium,
    marginTop: 2,
  },
  seasonBadge: {
    backgroundColor: colors.shop,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seasonBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: font.heavy,
    letterSpacing: 1,
  },
  packArt: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.tile,
    padding: 10,
  },
  packArtCell: {
    width: '30%',
    aspectRatio: 1,
  },
  packSprite: {
    width: '100%',
    height: '100%',
  },
  packArtBadge: {
    position: 'absolute',
    right: 2,
    top: 2,
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: radius.chip,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  packArtBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: font.heavy,
  },
  packFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  price: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: font.heavy,
  },
  countdown: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: font.bold,
  },
  closed: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: font.heavy,
    textTransform: 'uppercase',
  },
  openButton: {
    borderRadius: radius.button,
    backgroundColor: colors.shop,
    borderBottomWidth: 6,
    borderBottomColor: colors.shopDark,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openButtonOff: {
    backgroundColor: colors.surfaceLight,
    borderBottomColor: colors.backgroundDeep,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 2 }],
  },
  openButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: font.heavy,
    letterSpacing: 1,
  },
});
