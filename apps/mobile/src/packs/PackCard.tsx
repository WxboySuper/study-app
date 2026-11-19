import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { PackDef } from '@study-app/core';

import { colors, fonts } from '@/theme';
import { GameButton } from '@/ui';

import { critterArt } from './critterArt';
import { packTheme } from './packThemes';

/**
 * The card of a pack in the shop.
 *
 * A flat panel: the name and what it is (always on sale, seasonal with its
 * countdown, or when it opens), a band of the theme with the critters of the
 * pack, and the price next to the button.
 */
export interface PackCardProps {
  /** The pack of the card. */
  pack: PackDef;
  /** How many copies of every critter the player owns. */
  owned: Map<string, number>;
  /** `false` when the pack is not on sale. */
  available: boolean;
  /** `false` when the player cannot pay for the pack. */
  affordable: boolean;
  /** `true` while a pack is being opened. */
  busy: boolean;
  /** `true` when the pack is paid for with a ticket. */
  useTicket: boolean;
  /** How many tickets the player owns. */
  tickets: number;
  /** The countdown of a seasonal pack. */
  countdown: React.ReactNode;
  /** Called when the player opens the pack. */
  onOpen: () => void;
}

/** "Dec 1" for a day in epoch milliseconds. */
function shortDay(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The card of a pack in the shop. */
export function PackCard({
  pack,
  owned,
  available,
  affordable,
  busy,
  useTicket,
  tickets,
  countdown,
  onOpen,
}: PackCardProps) {
  const theme = packTheme(pack.id);
  const peeking = pack.critters.slice(0, 4);
  const upcoming = !available && pack.availableFrom !== null && pack.availableFrom > Date.now();

  const label = !available
    ? upcoming
      ? `Opens ${shortDay(pack.availableFrom ?? 0)}`
      : 'Not on sale'
    : !affordable
      ? 'Not enough tokens'
      : useTicket && tickets > 0
        ? 'OPEN WITH TICKET'
        : 'OPEN PACK';

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.name}>{pack.name}</Text>
          <Text style={styles.meta}>
            {pack.critters.length} critters ·{' '}
            {pack.kind !== 'seasonal'
              ? 'always on sale'
              : upcoming
                ? `opens ${shortDay(pack.availableFrom ?? 0)}`
                : countdown}
          </Text>
        </View>
        <View style={styles.price}>
          <View style={styles.priceCoin} />
          <Text style={styles.priceText}>{pack.priceTokens}</Text>
        </View>
      </View>

      <View style={styles.band}>
        <LinearGradient
          colors={[`${theme.gradient[0]}55`, `${theme.gradient[1]}55`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {peeking.map((critter) => {
          const art = critterArt(critter);
          const count = owned.get(critter.id) ?? 0;
          if (art === null) {
            return null;
          }
          return (
            <View key={critter.id} style={styles.peeker}>
              <Image
                source={art}
                style={[styles.peekerImage, count === 0 ? styles.unowned : null]}
                resizeMode="contain"
              />
              {count > 0 ? (
                <View style={styles.peekerBadge}>
                  <Text style={styles.peekerBadgeText}>{count}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <GameButton
        label={label}
        variant="shop"
        size="md"
        disabled={busy || !available || !affordable}
        onPress={onOpen}
        accessibilityLabel={`Open ${pack.name}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#16171d',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 17,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  price: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceCoin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.gold,
  },
  priceText: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  band: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  peeker: {
    width: 64,
    height: 66,
    justifyContent: 'flex-end',
  },
  peekerImage: {
    width: 64,
    height: 64,
  },
  unowned: {
    opacity: 0.55,
  },
  peekerBadge: {
    position: 'absolute',
    right: 2,
    top: 0,
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  peekerBadgeText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 11,
  },
});
