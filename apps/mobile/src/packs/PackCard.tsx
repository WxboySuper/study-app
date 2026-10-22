import { useId } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import type { PackDef } from '@study-app/core';

import { colors, fonts, radius, shadow } from '@/theme';
import { GameButton, GlassCard, Glow } from '@/ui';

import { critterArt } from './critterArt';
import { PackPouch } from './PackPouch';
import { packTheme } from './packThemes';

/**
 * The card of a pack in the shop.
 *
 * The pack is the hero of the screen: a big pouch in the gradient of its
 * theme, the critters that peek out of it, the price as a chunky pill of
 * tokens and (for a seasonal pack) a ribbon with the countdown.
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
  const peeking = pack.critters.slice(0, 3);

  const label = !available
    ? 'Not on sale'
    : !affordable
      ? 'Not enough tokens'
      : useTicket && tickets > 0
        ? 'OPEN WITH TICKET'
        : 'OPEN PACK';

  return (
    <View style={styles.wrap}>
      <Glow color={theme.glow} size={300} opacity={0.4} style={styles.glow} />

      <GlassCard contentStyle={styles.card} tint={theme.glow}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.name} numberOfLines={1}>
              {pack.name}
            </Text>
            <Text style={styles.meta}>
              {pack.critters.length} critters · {pack.kind === 'seasonal' ? 'seasonal' : 'always on sale'}
            </Text>
          </View>
          {pack.kind === 'seasonal' ? (
            <View style={styles.seasonBadge}>
              <Text style={styles.seasonBadgeText}>SEASONAL</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.showcase}>
          <View style={styles.peekers}>
            {peeking.map((critter) => {
              const art = critterArt(critter);
              const count = owned.get(critter.id) ?? 0;
              if (art === null) {
                return null;
              }
              return (
                <View key={critter.id} style={styles.peeker}>
                  <Image source={art} style={styles.peekerImage} resizeMode="contain" />
                  {count > 0 ? (
                    <View style={styles.peekerBadge}>
                      <Text style={styles.peekerBadgeText}>{count}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <PackPouch gradient={theme.gradient} crimp={theme.crimp} />
        </View>

        {pack.kind === 'seasonal' ? <Ribbon theme={theme}>{countdown}</Ribbon> : null}

        <View style={styles.footer}>
          <PricePill price={pack.priceTokens} />
          {pack.kind === 'seasonal' ? null : <Text style={styles.always}>Always on sale</Text>}
        </View>

        <GameButton
          label={label}
          variant="shop"
          size="lg"
          disabled={busy || !available || !affordable}
          onPress={onOpen}
          accessibilityLabel={`Open ${pack.name}`}
        />
      </GlassCard>
    </View>
  );
}

/** The price of a pack: a chunky pill of tokens. */
function PricePill({ price }: { price: number }) {
  return (
    <View style={styles.pricePill}>
      <View style={styles.priceCoin} />
      <Text style={styles.priceText}>{price}</Text>
    </View>
  );
}

/** The ribbon of a seasonal pack. */
function Ribbon({
  theme,
  children,
}: {
  theme: ReturnType<typeof packTheme>;
  children: React.ReactNode;
}) {
  const rawId = useId();
  const id = `ribbon${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <View style={styles.ribbon}>
      <Svg width="100%" height="100%" viewBox="0 0 200 34" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={theme.ribbon[0]} />
            <Stop offset="1" stopColor={theme.ribbon[1]} />
          </LinearGradient>
        </Defs>
        <Path d="M 0 0 L 200 0 L 190 17 L 200 34 L 0 34 L 10 17 Z" fill={`url(#${id})`} />
      </Svg>
      <Text style={styles.ribbonText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  card: {
    padding: 16,
    gap: 12,
  },
  glow: {
    position: 'absolute',
    top: -110,
    right: -80,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  headText: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
    letterSpacing: 0.4,
  },
  meta: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
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
    fontFamily: fonts.title,
    fontSize: 10,
    letterSpacing: 1,
  },
  showcase: {
    height: 168,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  peekers: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 4,
  },
  peeker: {
    width: 62,
    height: 66,
    justifyContent: 'flex-end',
  },
  peekerImage: {
    width: 62,
    height: 62,
  },
  peekerBadge: {
    position: 'absolute',
    right: 2,
    top: 0,
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: radius.chip,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  peekerBadgeText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 11,
  },
  ribbon: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbonText: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 12,
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,209,102,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.4)',
    ...shadow.soft,
  },
  priceCoin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
  },
  priceText: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  always: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
});
