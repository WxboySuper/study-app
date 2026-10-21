import {
  PACKS,
  collectionEntry,
  collectionProgress,
  localDayKey,
  type CritterDef,
  type WalletSnapshot,
} from '@study-app/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLocalDatabase } from '@/db/local';
import { sellAllDuplicatesLocal, sellDuplicates } from '@/db/packs';
import { readCollection, readWallet } from '@/db/wallet';
import { colors, font, radius, rarityColors, rarityLabels } from '@/theme';

import { critterArt } from '../packs/critterArt';

/**
 * The collection book.
 *
 * Every pack has its own page: the critters the player owns are shown in
 * color with how many copies there are, the ones that are missing are dark
 * silhouettes. Duplicates can be sold from here, one critter at a time or all
 * at once, but the last copy of a critter is never sold.
 */

export function CollectionScreen() {
  const [collection, setCollection] = useState<Map<string, number>>(new Map());
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [packId, setPackId] = useState(PACKS[0]?.id ?? '');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const db = await openLocalDatabase();
      setCollection(await readCollection(db));
      setWallet(await readWallet(db, localDayKey(new Date())));
    } catch {
      // The book stays empty when the local store cannot be read.
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

  const duplicates = useMemo(
    () =>
      PACKS.reduce((total, entry) => {
        let sum = 0;
        for (const critter of entry.critters) {
          sum += Math.max(0, (collection.get(critter.id) ?? 0) - 1);
        }
        return total + sum;
      }, 0),
    [collection],
  );

  const onSell = useCallback(
    async (critterId: string, qty: number) => {
      try {
        const db = await openLocalDatabase();
        const result = await sellDuplicates(db, critterId, qty);
        if (result.ok) {
          setMessage(`+${result.tokens} tokens!`);
          setWallet(result.wallet);
          await refresh();
        } else {
          setMessage(result.message);
        }
      } catch {
        setMessage('The critters could not be sold.');
      }
    },
    [refresh],
  );

  const onSellAll = useCallback(async () => {
    try {
      const db = await openLocalDatabase();
      const result = await sellAllDuplicatesLocal(db);
      if (result.ok) {
        setMessage(`+${result.tokens} tokens!`);
        setWallet(result.wallet);
        await refresh();
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage('The critters could not be sold.');
    }
  }, [refresh]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>COLLECTION</Text>

        <View style={styles.wallet}>
          <Text style={styles.walletValue}>🪙 {wallet?.balance ?? 0}</Text>
          <Text style={styles.walletLabel}>tokens</Text>
        </View>

        <View style={styles.tabs}>
          {PACKS.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              onPress={() => {
                setPackId(entry.id);
              }}
              style={[styles.tab, entry.id === pack.id ? styles.tabOn : null]}
            >
              <Text style={[styles.tabText, entry.id === pack.id ? styles.tabTextOn : null]}>
                {entry.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>{pack.name}</Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress.total === 0 ? 0 : (progress.owned / progress.total) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {progress.owned}/{progress.total} collected
          </Text>
        </View>

        {message === null ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMessage(null);
            }}
            style={styles.message}
          >
            <Text style={styles.messageText}>{message}</Text>
          </Pressable>
        )}

        <View style={styles.grid}>
          {pack.critters.map((critter) => (
            <CritterTile
              key={critter.id}
              critter={critter}
              count={collection.get(critter.id) ?? 0}
              onPress={() => {
                setSheet({ kind: 'critter', critter });
              }}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={duplicates === 0}
          onPress={() => {
            setSheet({ kind: 'all' });
          }}
          style={({ pressed }) => [
            styles.sellAll,
            duplicates === 0 ? styles.sellAllOff : null,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.sellAllText}>
            {duplicates === 0 ? 'No duplicates to sell' : `Sell all dupes (${duplicates})`}
          </Text>
        </Pressable>
      </ScrollView>

      {sheet === null ? null : (
        <SellSheet
          sheet={sheet}
          collection={collection}
          onCancel={() => {
            setSheet(null);
          }}
          onSell={(critterId, qty) => {
            void onSell(critterId, qty);
          }}
          onSellAll={() => {
            void onSellAll();
          }}
        />
      )}
    </SafeAreaView>
  );
}

/** The sheet that is shown when a critter (or everything) is tapped. */
type Sheet = { kind: 'critter'; critter: CritterDef } | { kind: 'all' };

function CritterTile({
  critter,
  count,
  onPress,
}: {
  critter: CritterDef;
  count: number;
  onPress: () => void;
}) {
  const art = critterArt(critter);
  const owned = count > 0;
  const color = rarityColors[critter.rarity];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        owned ? `${critter.name}, ${count} owned` : `${critter.name}, not collected yet`
      }
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressedTile]}
    >
      <View style={styles.tileArt}>
        {art === null ? (
          <Text style={[styles.emoji, !owned && styles.emojiMissing]}>{critter.emoji}</Text>
        ) : (
          <Image
            source={art}
            style={[styles.sprite, !owned && styles.silhouette]}
            resizeMode="contain"
          />
        )}
        {owned ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>x{count}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.rarityChip, { backgroundColor: color }]}>
        <Text style={styles.rarityChipText}>{rarityLabels[critter.rarity]}</Text>
      </View>

      <Text style={[styles.tileName, !owned && styles.tileNameMissing]} numberOfLines={2}>
        {critter.name}
      </Text>
    </Pressable>
  );
}

function SellSheet({
  sheet,
  collection,
  onCancel,
  onSell,
  onSellAll,
}: {
  sheet: Sheet;
  collection: Map<string, number>;
  onCancel: () => void;
  onSell: (critterId: string, qty: number) => void;
  onSellAll: () => void;
}) {
  if (sheet.kind === 'all') {
    return (
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Sell every duplicate?</Text>
          <Text style={styles.sheetBody}>
            Every copy above the first one is sold. You keep one of every critter you own.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onSellAll();
              onCancel();
            }}
            style={({ pressed }) => [styles.sheetButton, styles.sheetConfirm, pressed && styles.pressed]}
          >
            <Text style={styles.sheetButtonText}>Sell them all</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [styles.sheetButton, styles.sheetCancel, pressed && styles.pressed]}
          >
            <Text style={styles.sheetButtonText}>Keep them</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const entry = collectionEntry(collection, sheet.critter.id);
  const owned = (entry?.count ?? 0) > 0;
  const duplicates = entry?.duplicates ?? 0;
  const value = entry?.sellValue ?? 0;

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.sheetArt}>
          {critterArt(sheet.critter) === null ? (
            <Text style={styles.emoji}>{sheet.critter.emoji}</Text>
          ) : (
            <Image source={critterArt(sheet.critter)!} style={styles.sheetSprite} />
          )}
        </View>
        <Text style={styles.sheetTitle}>{sheet.critter.name}</Text>
        <Text style={styles.sheetBody}>
          {!owned
            ? 'You do not own this critter yet. Open a pack to find it.'
            : duplicates === 0
              ? 'You only own one copy, and the last copy is never sold.'
              : `You own ${entry?.count ?? 0} copies · ${duplicates} duplicate${duplicates === 1 ? '' : 's'} · ${value} tokens each`}
        </Text>

        {duplicates === 0 ? null : (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSell(sheet.critter.id, 1);
                onCancel();
              }}
              style={({ pressed }) => [styles.sheetButton, styles.sheetConfirm, pressed && styles.pressed]}
            >
              <Text style={styles.sheetButtonText}>Sell 1 (+{value})</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onSell(sheet.critter.id, duplicates);
                onCancel();
              }}
              style={({ pressed }) => [styles.sheetButton, styles.sheetSell, pressed && styles.pressed]}
            >
              <Text style={styles.sheetButtonText}>
                Sell all {duplicates} (+{duplicates * value})
              </Text>
            </Pressable>
          </>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [styles.sheetButton, styles.sheetCancel, pressed && styles.pressed]}
        >
          <Text style={styles.sheetButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
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
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  walletValue: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: font.heavy,
  },
  walletLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: font.bold,
    textTransform: 'uppercase',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 5,
    borderBottomColor: colors.backgroundDeep,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: colors.collection,
    borderBottomColor: colors.collectionDark,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: font.bold,
    textAlign: 'center',
  },
  tabTextOn: {
    color: '#ffffff',
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  progressTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: font.heavy,
  },
  progressBar: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.backgroundDeep,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 7,
    backgroundColor: colors.collection,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: font.bold,
  },
  message: {
    borderRadius: radius.button,
    backgroundColor: colors.success,
    borderBottomWidth: 5,
    borderBottomColor: colors.collectionDark,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  messageText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: font.bold,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '31%',
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 6,
    alignItems: 'center',
    gap: 4,
  },
  tileArt: {
    width: '100%',
    aspectRatio: 1,
  },
  sprite: {
    width: '100%',
    height: '100%',
  },
  silhouette: {
    tintColor: colors.silhouette,
    opacity: 0.3,
  },
  emoji: {
    fontSize: 44,
    textAlign: 'center',
  },
  emojiMissing: {
    opacity: 0.3,
  },
  countBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: colors.primary,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: colors.backgroundDeep,
  },
  countBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: font.heavy,
  },
  rarityChip: {
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rarityChipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: font.heavy,
    letterSpacing: 0.5,
  },
  tileName: {
    color: colors.text,
    fontSize: 11,
    fontWeight: font.bold,
    textAlign: 'center',
  },
  tileNameMissing: {
    color: colors.textDim,
  },
  sellAll: {
    borderRadius: radius.button,
    backgroundColor: colors.collection,
    borderBottomWidth: 6,
    borderBottomColor: colors.collectionDark,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellAllOff: {
    backgroundColor: colors.surfaceLight,
    borderBottomColor: colors.backgroundDeep,
  },
  sellAllText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: font.heavy,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 2 }],
  },
  pressedTile: {
    opacity: 0.8,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 3, 16, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 3,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
  },
  sheetArt: {
    alignSelf: 'center',
    width: 96,
    height: 96,
  },
  sheetSprite: {
    width: 96,
    height: 96,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: font.heavy,
    textAlign: 'center',
  },
  sheetBody: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: font.medium,
    textAlign: 'center',
  },
  sheetButton: {
    borderRadius: radius.button,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetConfirm: {
    backgroundColor: colors.primary,
    borderBottomWidth: 5,
    borderBottomColor: colors.primaryDark,
  },
  sheetSell: {
    backgroundColor: colors.collection,
    borderBottomWidth: 5,
    borderBottomColor: colors.collectionDark,
  },
  sheetCancel: {
    backgroundColor: colors.surfaceLight,
    borderBottomWidth: 5,
    borderBottomColor: colors.backgroundDeep,
  },
  sheetButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: font.heavy,
  },
});
