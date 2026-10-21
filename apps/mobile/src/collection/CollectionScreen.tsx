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

import { openLocalStore } from '@/db/local';
import { colors, fonts, radius, rarityColors, rarityLabels } from '@/theme';
import { GameBackground, GameButton, GlassCard, ScreenHeader, TokenCounter } from '@/ui';

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
      const store = await openLocalStore();
      setCollection(await store.readCollection());
      setWallet(await store.readWallet(localDayKey(new Date())));
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
        const store = await openLocalStore();
        const result = await store.sellDuplicates(critterId, qty);
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
      const store = await openLocalStore();
      const result = await store.sellAllDuplicates();
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
    <GameBackground variant="collection">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="COLLECTION"
            subtitle="Your critters, and the duplicates you can sell"
            right={
              <GlassCard borderRadius={radius.chip} elevated={false} style={styles.headerChip}>
                <TokenCounter value={wallet?.balance ?? 0} size={18} />
              </GlassCard>
            }
          />

          <View style={styles.tabs}>
            {PACKS.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityState={{ selected: entry.id === pack.id }}
                onPress={() => {
                  setPackId(entry.id);
                }}
                style={({ pressed }) => [
                  styles.tab,
                  entry.id === pack.id ? styles.tabOn : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={[styles.tabText, entry.id === pack.id ? styles.tabTextOn : null]}>
                  {entry.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <GlassCard style={styles.progressCard} tint={colors.collection}>
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
          </GlassCard>

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

        <GameButton
          label={duplicates === 0 ? 'No duplicates to sell' : `Sell all dupes (${duplicates})`}
          variant="collection"
          size="lg"
          disabled={duplicates === 0}
          onPress={() => {
            setSheet({ kind: 'all' });
          }}
          accessibilityLabel="Sell all duplicates"
        />
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
    </GameBackground>
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
        <GlassCard style={styles.sheet} padded>
          <Text style={styles.sheetTitle}>Sell every duplicate?</Text>
          <Text style={styles.sheetBody}>
            Every copy above the first one is sold. You keep one of every critter you own.
          </Text>
          <GameButton
            label="Sell them all"
            variant="collection"
            size="lg"
            onPress={() => {
              onSellAll();
              onCancel();
            }}
          />
          <GameButton label="Keep them" variant="ghost" size="md" onPress={onCancel} />
        </GlassCard>
      </View>
    );
  }

  const entry = collectionEntry(collection, sheet.critter.id);
  const owned = (entry?.count ?? 0) > 0;
  const duplicates = entry?.duplicates ?? 0;
  const value = entry?.sellValue ?? 0;

  return (
    <View style={styles.backdrop}>
      <GlassCard style={styles.sheet} padded>
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
            <GameButton
              label={`Sell 1 (+${value})`}
              variant="primary"
              size="lg"
              onPress={() => {
                onSell(sheet.critter.id, 1);
                onCancel();
              }}
            />
            <GameButton
              label={`Sell all ${duplicates} (+${duplicates * value})`}
              variant="collection"
              size="lg"
              onPress={() => {
                onSell(sheet.critter.id, duplicates);
                onCancel();
              }}
            />
          </>
        )}

        <GameButton label="Cancel" variant="ghost" size="md" onPress={onCancel} />
      </GlassCard>
    </View>
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
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    borderRadius: radius.button,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: 'rgba(52,211,153,0.2)',
    borderColor: colors.collection,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.titleSemi,
    textAlign: 'center',
  },
  tabTextOn: {
    color: '#ffffff',
  },
  progressCard: {
    gap: 8,
  },
  progressTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.title,
  },
  progressBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: colors.collection,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.titleSemi,
  },
  message: {
    borderRadius: radius.button,
    backgroundColor: colors.success,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  messageText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: fonts.titleSemi,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.tile,
    borderWidth: 1,
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
    fontFamily: fonts.title,
  },
  rarityChip: {
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rarityChipText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: fonts.title,
    letterSpacing: 0.5,
  },
  tileName: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.titleSemi,
    textAlign: 'center',
  },
  tileNameMissing: {
    color: colors.textDim,
  },
  pressed: {
    opacity: 0.75,
  },
  pressedTile: {
    opacity: 0.8,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 7, 11, 0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    gap: 10,
    alignItems: 'stretch',
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
    fontFamily: fonts.title,
    textAlign: 'center',
  },
  sheetBody: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
  },
});
