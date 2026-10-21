import type { CritterRarity } from '@study-app/core';
import type { TextStyle, ViewStyle } from 'react-native';

/**
 * The look of the app.
 *
 * The game screens (the shop, the collection, the daily wheel) share this
 * theme: a dark navy/purple night, chunky rounded fonts and saturated
 * buttons with a darker bottom border, so every button looks like a chunky
 * game button and not like a default React Native one.
 */

/** The colors of the app. */
export const colors = {
  /** The background of the game screens. */
  background: '#150b2e',
  /** A darker background, for the wells and the backdrops. */
  backgroundDeep: '#0b0518',
  /** A card of the game screens. */
  surface: '#241547',
  /** A lighter card (the header of a sheet). */
  surfaceLight: '#31206b',
  /** The border of a card. */
  border: '#3f2779',
  /** The main text. */
  text: '#ffffff',
  /** The secondary text. */
  textMuted: '#b8a7ea',
  /** The faint text. */
  textDim: '#7d6cb4',
  /** The color of the tokens. */
  gold: '#ffd166',
  /** The color of the tickets. */
  ticket: '#38bdf8',
  /** The primary action (violet). */
  primary: '#8b5cf6',
  /** The darker bottom border of the primary button. */
  primaryDark: '#5b21b6',
  /** The secondary action (cyan). */
  secondary: '#22d3ee',
  /** The darker bottom border of the secondary button. */
  secondaryDark: '#0e7490',
  /** The action of the shop (pink). */
  shop: '#f472b6',
  /** The darker bottom border of the shop button. */
  shopDark: '#be185d',
  /** The action of the wheel (amber). */
  wheel: '#fbbf24',
  /** The darker bottom border of the wheel button. */
  wheelDark: '#b45309',
  /** The action of the collection (green). */
  collection: '#34d399',
  /** The darker bottom border of the collection button. */
  collectionDark: '#047857',
  /** The color of a success. */
  success: '#22c55e',
  /** The color of a failure. */
  danger: '#ef476f',
  /** The color of a warning. */
  warning: '#f59e0b',
  /** The color of a silhouette. */
  silhouette: '#000000',
} as const;

/** The color of every rarity (SPEC §3). */
export const rarityColors: Record<CritterRarity, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

/** The name of every rarity. */
export const rarityLabels: Record<CritterRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** The colors of the segments of the daily wheel. */
export const spinSegmentColors: readonly string[] = [
  '#38bdf8',
  '#22c55e',
  '#facc15',
  '#fb923c',
  '#f472b6',
  '#a855f7',
  '#ef476f',
  '#f59e0b',
];

/** The chunky fonts of the game screens. */
export const font = {
  heavy: '900',
  bold: '800',
  medium: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/** The rounded corners of the game screens. */
export const radius = {
  card: 22,
  button: 18,
  chip: 999,
  tile: 16,
} as const;

/**
 * A chunky game button: a saturated color with a darker bottom border, so
 * the button looks like it can be pressed down.
 */
export function chunkyButton(color: string, darkColor: string): ViewStyle {
  return {
    backgroundColor: color,
    borderBottomWidth: 6,
    borderBottomColor: darkColor,
    borderRadius: radius.button,
  };
}

/** The style of a card of the game screens. */
export function gameCard(): ViewStyle {
  return {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
  };
}

/** The style of the title of a game screen. */
export const titleStyle: TextStyle = {
  color: colors.text,
  fontSize: 30,
  fontWeight: font.heavy,
  letterSpacing: 0.5,
};

/** The style of the subtitle of a game screen. */
export const subtitleStyle: TextStyle = {
  color: colors.textMuted,
  fontSize: 14,
  fontWeight: font.medium,
};
