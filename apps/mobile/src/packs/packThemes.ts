import { colors, type Gradient } from '@/theme';

/**
 * The look of every pack of the shop.
 *
 * A pack is a big illustrated pouch: the gradient of its theme, the critters
 * that peek out of it and a ribbon for the seasonal ones. Adding a pack is
 * a data change (see `docs/ADDING-CONTENT.md`), so the themes live in one
 * map with a fallback for the packs that are not listed yet.
 */
export interface PackTheme {
  /** The gradient of the pouch. */
  gradient: Gradient;
  /** The gradient of the crimp (the sealed top of the pouch). */
  crimp: Gradient;
  /** The color of the glow behind the pack. */
  glow: string;
  /** The color of the ribbon of a seasonal pack. */
  ribbon: Gradient;
  /** The name of the theme, shown on the card. */
  label: string;
}

const THEMES: Record<string, PackTheme> = {
  brain_buddies: {
    gradient: ['#a78bfa', '#3b82f6'],
    crimp: ['#c4b5fd', '#60a5fa'],
    glow: '#7b61ff',
    ribbon: ['#8b5cf6', '#4f7dff'],
    label: 'Brain Buddies',
  },
  midterm_monsters: {
    gradient: ['#fb923c', '#7c3aed'],
    crimp: ['#fdba74', '#a78bfa'],
    glow: '#f97316',
    ribbon: ['#f97316', '#7c3aed'],
    label: 'Midterm Monsters',
  },
};

const FALLBACK: PackTheme = {
  gradient: ['#7b61ff', '#4f7dff'],
  crimp: ['#a78bff', '#60a5fa'],
  glow: colors.primary,
  ribbon: ['#7b61ff', '#4f7dff'],
  label: 'Pack',
};

/** The theme of a pack. */
export function packTheme(packId: string): PackTheme {
  return THEMES[packId] ?? FALLBACK;
}
