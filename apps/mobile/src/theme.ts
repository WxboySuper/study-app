import type { CritterRarity } from '@study-app/core';
import type { TextStyle, ViewStyle } from 'react-native';

/**
 * The look of the app.
 *
 * One design system for every game screen: a deep layered dark background
 * (#111214 -> #181818 with a navy/indigo wash), radial glows behind the
 * focal elements, glassy cards with a gradient border and a 1px inset top
 * highlight, soft large drop shadows and a violet accent gradient
 * (135deg #7b61ff -> brand blue).
 *
 * The type is chunky and playful: Fredoka for the titles, the buttons and
 * the numbers, Nunito for the body.
 */

/** The colors of the app. */
export const colors = {
  /** The background of the game screens. */
  background: '#111214',
  /** The deeper layer of the background (the wells and the backdrops). */
  backgroundDeep: '#0a0b0e',
  /** The middle layer of the background (the end of the gradients). */
  backgroundMid: '#181818',
  /** A glassy card. */
  surface: 'rgba(255, 255, 255, 0.06)',
  /** A glassy card that is a bit more solid. */
  surfaceSolid: '#1b1d24',
  /** A raised card. */
  surfaceLight: '#262935',
  /** The border of a card. */
  border: 'rgba(255, 255, 255, 0.10)',
  /** The border of a focused card. */
  borderStrong: 'rgba(255, 255, 255, 0.22)',
  /** The main text. */
  text: '#ffffff',
  /** The secondary text. */
  textMuted: '#a6adbe',
  /** The faint text. */
  textDim: '#6d7488',
  /** The color of the tokens. */
  gold: '#ffd166',
  /** The darker side of the coin. */
  goldDark: '#a86a00',
  /** The color of the tickets. */
  ticket: '#38bdf8',
  /** The darker side of the ticket. */
  ticketDark: '#0c5f7d',
  /** The primary action (violet). */
  primary: '#7b61ff',
  /** The lighter side of the primary action. */
  primaryLight: '#a78bff',
  /** The darker bottom border of the primary button. */
  primaryDark: '#4a2fc7',
  /** The secondary action (cyan). */
  secondary: '#22d3ee',
  /** The darker bottom border of the secondary button. */
  secondaryDark: '#0e7490',
  /** The action of the shop (pink). */
  shop: '#f472b6',
  /** The darker bottom border of the shop button. */
  shopDark: '#b21d63',
  /** The action of the wheel (amber). */
  wheel: '#fbbf24',
  /** The darker bottom border of the wheel button. */
  wheelDark: '#a35b06',
  /** The action of the collection (green). */
  collection: '#34d399',
  /** The darker bottom border of the collection button. */
  collectionDark: '#046c50',
  /** The color of a success. */
  success: '#22c55e',
  /** The color of a failure. */
  danger: '#ef476f',
  /** The darker side of the failure. */
  dangerDark: '#9f1239',
  /** The color of a warning. */
  warning: '#f59e0b',
  /** The color of a silhouette. */
  silhouette: '#000000',
  /** The night of the lake (the fishing mode). */
  ocean: '#0a1630',
  /** The deeper night of the lake. */
  oceanDeep: '#050b18',
  /** The highlight of the top edge of a card. */
  highlight: 'rgba(255, 255, 255, 0.16)',
} as const;

/** A gradient: the colors of a `LinearGradient`, from the first to the last. */
export type Gradient = readonly [string, string, ...string[]];

/** The direction of the accent gradients (135deg, like the reference). */
export const gradientDirection = {
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

/** The gradients of the app. */
export const gradients = {
  /** The layered dark background of the game screens. */
  background: ['#111214', '#181818'] as Gradient,
  /** The background of the screens that live in the indigo. */
  indigo: ['#161a2b', '#0c0e18'] as Gradient,
  /** The background of the fishing mode. */
  ocean: ['#0a1630', '#050b18'] as Gradient,
  /** The violet accent of the app. */
  primary: ['#7b61ff', '#4f7dff'] as Gradient,
  /** The gold of the tokens. */
  gold: ['#ffe08a', '#f5a524'] as Gradient,
  /** The pink of the shop. */
  shop: ['#f472b6', '#db2777'] as Gradient,
  /** The amber of the wheel. */
  wheel: ['#fbbf24', '#f97316'] as Gradient,
  /** The green of the collection. */
  collection: ['#34d399', '#059669'] as Gradient,
  /** The cyan of the tickets. */
  ticket: ['#38bdf8', '#0284c7'] as Gradient,
  /** The red of a failure. */
  danger: ['#fb7185', '#e11d48'] as Gradient,
  /** The white shine that sweeps the cards. */
  shine: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)'] as Gradient,
} as const;

/** The gradients of every rarity (SPEC §3). */
export const rarityGradients: Record<CritterRarity, Gradient> = {
  common: ['#b6bdc9', '#7b8494'],
  uncommon: ['#5eead4', '#16a34a'],
  rare: ['#7dd3fc', '#2563eb'],
  epic: ['#d8b4fe', '#7c3aed'],
  legendary: ['#fde68a', '#f59e0b'],
};

/** The color of every rarity (SPEC §3). */
export const rarityColors: Record<CritterRarity, string> = {
  common: '#b6bdc9',
  uncommon: '#5eead4',
  rare: '#7dd3fc',
  epic: '#d8b4fe',
  legendary: '#fde68a',
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

/** The font families of the app (Fredoka for the game, Nunito for the body). */
export const fonts = {
  /** The titles, the buttons and the numbers. */
  title: 'Fredoka_700Bold',
  /** The titles that must not shout. */
  titleSemi: 'Fredoka_600SemiBold',
  /** The body of the app. */
  body: 'Nunito_400Regular',
  /** The body that has to be read. */
  bodySemi: 'Nunito_600SemiBold',
  /** The body that shouts a little. */
  bodyBold: 'Nunito_700Bold',
} as const;

/** The rounded corners of the game screens. */
export const radius = {
  card: 12,
  button: 14,
  chip: 999,
  tile: 10,
  pill: 999,
} as const;

/** The spacing of the game screens (a 4pt scale). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * The soft and large drop shadow of the cards.
 *
 * The shadow is drawn on Android with `elevation` and on iOS with the
 * `shadow*` properties.
 */
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  soft: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  glow: {
    shadowColor: '#7b61ff',
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
} as const satisfies Record<string, ViewStyle>;

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
    backgroundColor: colors.surfaceSolid,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  };
}

/** The style of the title of a game screen. */
export const titleStyle: TextStyle = {
  color: colors.text,
  fontFamily: fonts.title,
  fontSize: 30,
  letterSpacing: 0.5,
};

/** The style of the subtitle of a game screen. */
export const subtitleStyle: TextStyle = {
  color: colors.textMuted,
  fontFamily: fonts.bodySemi,
  fontSize: 14,
};
