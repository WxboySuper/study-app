import {
  PACKS,
  collectionEntry,
  collectionProgress,
  findCritter,
  localDayKey,
  type CritterDef,
  type WalletSnapshot,
} from '@study-app/core';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, type HostInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalStore } from '@/db/local';
import { hapticImpact, hapticSuccess } from '@/haptics';
import { critterArt } from '@/packs/critterArt';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, spacing } from '@/theme';
import {
  CritterLoader,
  GameBackground,
  GameButton,
  GlassCard,
  ScreenHeader,
  Skeleton,
  TokenCounter,
} from '@/ui';

import { CoinFlight } from './CoinFlight';
import { CritterCard } from './CritterCard';
import { CritterSheet } from './CritterSheet';
import { PackHeader } from './PackHeader';
import { PackTabs } from './PackTabs';
import { SellAllSheet } from './SellAllSheet';

/**
 * The collection book.
 *
 * The album of the critters: one page per pack, a chunky pill for every
 * page, a header that shows how much of the pack is collected and a shelf of
 * glassy cards. The critters the player owns are drawn in the gradient of
 * their rarity, the missing ones are dark silhouettes that shimmer, and a
 * tap opens the critter in a sheet that sells the duplicates.
 */
export function CollectionScreen() {
  const params = useLocalSearchParams<{ demo?: string }>();
  const [collection, setCollection] = useState<Map<string, number>>(new Map());
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [packId, setPackId] = useState(PACKS[0]?.id ?? '');
  const [sheet, setSheet] = useState<CritterDef | null>(null);
  const [sellAll, setSellAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flight, setFlight] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    count: number;
  } | null>(null);
  const counterRef = useRef<HostInstance>(null);

  const refresh = useCallback(async () => {
    try {
      const store = await openLocalStore();
      setCollection(await store.readCollection());
      setWallet(await store.readWallet(localDayKey(new Date())));
    } catch {
      // The book stays empty when the local store cannot be read.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const pack = useMemo(
    () => PACKS.find((entry) => entry.id === packId) ?? PACKS[0]!,
    [packId],
  );
  const progress = useMemo(() => collectionProgress(collection, pack), [collection, pack]);

  /** The duplicates of the whole collection and what they are worth. */
  const duplicates = useMemo(() => {
    let copies = 0;
    let tokens = 0;
    for (const entry of PACKS) {
      for (const critter of entry.critters) {
        const owned = collection.get(critter.id) ?? 0;
        const extra = Math.max(0, owned - 1);
        if (extra === 0) {
          continue;
        }
        copies += extra;
        const value = collectionEntry(collection, critter.id)?.sellValue ?? 0;
        tokens += extra * value;
      }
    }
    return { copies, tokens };
  }, [collection]);

  // The demo of the web build opens the sheet of the first critter.
  useEffect(() => {
    if (params.demo !== 'sheet') {
      return;
    }
    const first = pack.critters.find((critter) => (collection.get(critter.id) ?? 0) > 0);
    if (first !== undefined) {
      setSheet(first);
    }
  }, [collection, pack.critters, params.demo]);

  const onSell = useCallback(
    async (critterId: string, qty: number) => {
      try {
        const store = await openLocalStore();
        const result = await store.sellDuplicates(critterId, qty);
        if (result.ok) {
          hapticSuccess();
          play('coin');
          setWallet(result.wallet);
          setSheet(null);
          await refresh();
        }
      } catch {
        // The critters stay in the collection.
      }
    },
    [refresh],
  );

  const onSellAll = useCallback(
    async (origin: { x: number; y: number }) => {
      try {
        const store = await openLocalStore();
        const result = await store.sellAllDuplicates();
        if (!result.ok) {
          setSellAll(false);
          return;
        }

        hapticImpact('heavy');
        play('coin');
        setWallet(result.wallet);
        setSellAll(false);
        await refresh();

        // The coins fly from the button to the counter of the wallet.
        const count = Math.min(12, Math.max(4, result.sold));
        const node = counterRef.current;
        if (node === null) {
          setFlight({ from: origin, to: { x: 0, y: 0 }, count });
          return;
        }
        node.measureInWindow((x, y, width, height) => {
          setFlight({
            from: origin,
            to: { x: x + width / 2, y: y + height / 2 },
            count,
          });
        });
      } catch {
        setSellAll(false);
      }
    },
    [refresh],
  );

  const entry = sheet === null ? undefined : collectionEntry(collection, sheet.id);

  return (
    <GameBackground variant="collection">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="COLLECTION"
            subtitle="Your critters, and the duplicates you can sell"
            right={
              <View ref={counterRef} collapsable={false}>
                <GlassCard borderRadius={radius.chip} elevated={false} contentStyle={styles.headerChip}>
                  <TokenCounter value={wallet?.balance ?? 0} size={18} />
                </GlassCard>
              </View>
            }
          />

          <PackTabs
            packs={PACKS}
            activeId={pack.id}
            onSelect={(id) => {
              setPackId(id);
            }}
          />

          <PackHeader pack={pack} owned={progress.owned} total={progress.total} />

          {loading ? (
            <View style={styles.loading}>
              <CritterLoader emoji="🐾" label="Opening the book…" />
              <Skeleton width="92%" height={18} />
              <Skeleton width="64%" height={18} />
              <Skeleton width="78%" height={18} />
            </View>
          ) : collection.size === 0 ? (
            <EmptyCollection />
          ) : (
            <>
              <View style={styles.grid}>
                {pack.critters.map((critter, index) => (
                  <CritterCard
                    key={critter.id}
                    critter={critter}
                    count={collection.get(critter.id) ?? 0}
                    index={index}
                    onPress={() => {
                      hapticImpact('light');
                      play('tap');
                      setSheet(critter);
                    }}
                  />
                ))}
              </View>

              <GameButton
                label={
                  duplicates.copies === 0
                    ? 'NO DUPLICATES TO SELL'
                    : `SELL ALL DUPES (${duplicates.copies})`
                }
                variant="collection"
                size="lg"
                disabled={duplicates.copies === 0}
                onPress={() => {
                  hapticImpact('medium');
                  play('tap');
                  setSellAll(true);
                }}
                accessibilityLabel="Sell all duplicates"
              />

              {duplicates.copies === 0 ? null : (
                <Text style={styles.footnote}>
                  {duplicates.copies} duplicate{duplicates.copies === 1 ? '' : 's'} are worth{' '}
                  {duplicates.tokens} coins.
                </Text>
              )}
            </>
          )}
        </ScrollView>

        {sheet === null ? null : (
          <CritterSheet
            critter={sheet}
            count={entry?.count ?? 0}
            duplicates={entry?.duplicates ?? 0}
            sellValue={entry?.sellValue ?? 0}
            onClose={() => {
              setSheet(null);
            }}
            onSell={(qty) => {
              void onSell(sheet.id, qty);
            }}
          />
        )}

        {sellAll ? (
          <SellAllSheet
            copies={duplicates.copies}
            tokens={duplicates.tokens}
            onClose={() => {
              setSellAll(false);
            }}
            onConfirm={(origin) => {
              void onSellAll(origin);
            }}
          />
        ) : null}

        {flight === null ? null : (
          <CoinFlight
            from={flight.from}
            to={flight.to}
            count={flight.count}
            onDone={() => {
              setFlight(null);
            }}
          />
        )}
      </SafeAreaView>
    </GameBackground>
  );
}

/**
 * The empty book.
 *
 * The player has no critter at all: a critter waves at them and the shop is
 * one tap away.
 */
function EmptyCollection() {
  const router = useRouter();
  const critter = findCritter('nibbles_the_notecard');
  const art = critter === undefined ? null : critterArt(critter);

  return (
    <GlassCard style={styles.empty} contentStyle={styles.emptyContent}>
      {art === null ? (
        <Text style={styles.emptyEmoji}>{critter?.emoji ?? '🐾'}</Text>
      ) : (
        <Image source={art} style={styles.emptyArt} resizeMode="contain" />
      )}

      <Text style={styles.emptyTitle}>No critters yet</Text>
      <Text style={styles.emptyText}>
        Open a pack to catch your first critter — every one of them lands in this book.
      </Text>

      <GameButton
        label="OPEN A PACK"
        variant="shop"
        size="lg"
        onPress={() => {
          hapticImpact('medium');
          play('tap');
          router.push('/packs');
        }}
      />
    </GlassCard>
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
  loading: {
    gap: 10,
    paddingVertical: spacing.lg,
  },
  empty: {
    borderRadius: radius.card,
  },
  emptyContent: {
    alignItems: 'center',
    gap: 10,
    padding: spacing.xl,
  },
  emptyArt: {
    width: 128,
    height: 128,
  },
  emptyEmoji: {
    fontSize: 72,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  footnote: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    textAlign: 'center',
  },
});
