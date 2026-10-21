/**
 * The lure shop of the fishing mode (docs/design/fishing.md §9).
 *
 * Lures and baits are persistent upgrades that are bought with tokens. The
 * lure *rank* inside a session is temporary (it is reeled up while playing),
 * but the **starting lure** and the equipped **bait** carry over between
 * sessions.
 */

/** The five lure ranks. */
export type LureRank = 1 | 2 | 3 | 4 | 5;

/** The name and the sprite of a lure rank (§6). */
export interface LureRankDef {
  rank: LureRank;
  name: string;
  /** The sprite id (see docs/design/fishing.md §13a). */
  assetId: string;
  /** Emoji used when the sprite is not available yet. */
  emoji: string;
}

export const LURE_RANKS: readonly LureRankDef[] = [
  { rank: 1, name: 'Worm', assetId: 'lure_r1_worm', emoji: '🪱' },
  { rank: 2, name: 'Spinner', assetId: 'lure_r2_spinner', emoji: '🌀' },
  { rank: 3, name: 'Jig', assetId: 'lure_r3_jig', emoji: '💡' },
  { rank: 4, name: 'Golden Fly', assetId: 'lure_r4_golden_fly', emoji: '✨' },
  { rank: 5, name: 'Legend Lure', assetId: 'lure_r5_legend', emoji: '🌈' },
];

/** The name of a lure rank. */
export function lureRankName(rank: number): string {
  const definition = LURE_RANKS.find((entry) => entry.rank === rank);
  return definition?.name ?? 'Worm';
}

/** The highest lure rank a session can reach. */
export const MAX_LURE_RANK: LureRank = 5;

/** The baits of the shop. */
export type BaitId = 'shiny_spinner' | 'glow_jig' | 'critter_chum';

/** What a bait does while it is equipped. */
export interface BaitEffect {
  id: BaitId;
  /** The multiplier applied to the weight of every catch. */
  weightMultiplier: number;
  /** Percentage points added to the odds of "Rare Find" and above. */
  rareTierBonus: number;
  /** The share of the special table that is a critter catch (in percent). */
  critterShare: number;
}

/** The effect of every bait. */
export const BAIT_EFFECTS: Readonly<Record<BaitId, BaitEffect>> = {
  shiny_spinner: { id: 'shiny_spinner', weightMultiplier: 1.1, rareTierBonus: 0, critterShare: 12 },
  glow_jig: { id: 'glow_jig', weightMultiplier: 1, rareTierBonus: 2, critterShare: 12 },
  critter_chum: { id: 'critter_chum', weightMultiplier: 1, rareTierBonus: 0, critterShare: 16 },
};

/** The baits that are equipped at the start of a session. */
export interface EquippedBaits {
  shinySpinner: boolean;
  glowJig: boolean;
  critterChum: boolean;
}

/** No bait at all. */
export const EMPTY_BAITS: EquippedBaits = {
  shinySpinner: false,
  glowJig: false,
  critterChum: false,
};

/** Builds the equipped baits from a list of bait ids. */
export function baitsFromIds(ids: readonly BaitId[]): EquippedBaits {
  return {
    shinySpinner: ids.includes('shiny_spinner'),
    glowJig: ids.includes('glow_jig'),
    critterChum: ids.includes('critter_chum'),
  };
}

/** The effect of the equipped baits, combined. */
export function equippedBaitEffect(baits: EquippedBaits): BaitEffect {
  let weightMultiplier = 1;
  let rareTierBonus = 0;
  let critterShare = 12;

  if (baits.shinySpinner) {
    weightMultiplier *= BAIT_EFFECTS.shiny_spinner.weightMultiplier;
  }
  if (baits.glowJig) {
    rareTierBonus += BAIT_EFFECTS.glow_jig.rareTierBonus;
    critterShare = Math.max(critterShare, BAIT_EFFECTS.glow_jig.critterShare);
  }
  if (baits.critterChum) {
    critterShare = Math.max(critterShare, BAIT_EFFECTS.critter_chum.critterShare);
  }

  return { id: 'shiny_spinner', weightMultiplier, rareTierBonus, critterShare };
}

/** What kind of shop item it is. */
export type LureItemKind = 'starting_lure' | 'bait' | 'rod' | 'dock_skin';

/** An item of the lure shop. */
export interface LureShopItem {
  id: string;
  name: string;
  kind: LureItemKind;
  /** The price in tokens. */
  priceTokens: number;
  /** What the item does, in one line. */
  description: string;
  /** For starting lures: the rank every session starts at. */
  startRank?: LureRank;
  /** For baits: the id of the bait effect. */
  bait?: BaitId;
  /** The sprite id, when there is one. */
  assetId?: string;
  /** Emoji used when the sprite is not available yet. */
  emoji: string;
}

/**
 * The shop (docs/design/fishing.md §9).
 *
 * "Prices stay below pack prices × 8 so packs stay the main sink." The most
 * expensive item is the Legend Reel (200 tokens) against a 20 token pack.
 */
export const LURE_SHOP_ITEMS: readonly LureShopItem[] = [
  {
    id: 'starting_lure_2',
    name: 'Starting Lure II',
    kind: 'starting_lure',
    priceTokens: 60,
    description: 'Start every session at lure rank 2.',
    startRank: 2,
    emoji: '🌀',
  },
  {
    id: 'starting_lure_3',
    name: 'Starting Lure III',
    kind: 'starting_lure',
    priceTokens: 150,
    description: 'Start every session at lure rank 3.',
    startRank: 3,
    emoji: '💡',
  },
  {
    id: 'bait_shiny_spinner',
    name: 'Shiny Spinner',
    kind: 'bait',
    priceTokens: 30,
    description: '+10% weight on every catch.',
    bait: 'shiny_spinner',
    assetId: 'lure_r2_spinner',
    emoji: '🌀',
  },
  {
    id: 'bait_glow_jig',
    name: 'Glow Jig',
    kind: 'bait',
    priceTokens: 60,
    description: '+2% to Rare Find and above.',
    bait: 'glow_jig',
    assetId: 'lure_r3_jig',
    emoji: '💡',
  },
  {
    id: 'bait_critter_chum',
    name: 'Critter Chum',
    kind: 'bait',
    priceTokens: 80,
    description: 'Critter catch share 12% → 16%.',
    bait: 'critter_chum',
    assetId: 'bait_critter_chum',
    emoji: '🐟',
  },
  {
    id: 'rod_bamboo',
    name: 'Bamboo Rod',
    kind: 'rod',
    priceTokens: 40,
    description: 'A light, honest rod.',
    emoji: '🎋',
  },
  {
    id: 'rod_carbon',
    name: 'Carbon Rod',
    kind: 'rod',
    priceTokens: 90,
    description: 'Lighter swing, longer trail.',
    emoji: '🪶',
  },
  {
    id: 'rod_legend_reel',
    name: 'Legend Reel',
    kind: 'rod',
    priceTokens: 200,
    description: 'The reel sound of a legend.',
    emoji: '🌀',
  },
  {
    id: 'dock_dawn',
    name: 'Dawn Dock',
    kind: 'dock_skin',
    priceTokens: 50,
    description: 'A pale morning palette.',
    emoji: '🌅',
  },
  {
    id: 'dock_night',
    name: 'Night Dock',
    kind: 'dock_skin',
    priceTokens: 50,
    description: 'A calm midnight palette.',
    emoji: '🌙',
  },
  {
    id: 'dock_halloween_swamp',
    name: 'Halloween Swamp',
    kind: 'dock_skin',
    priceTokens: 50,
    description: 'A seasonal swamp palette.',
    emoji: '🎃',
  },
];

/** Looks a shop item up by id. */
export function findLureShopItem(id: string): LureShopItem | undefined {
  return LURE_SHOP_ITEMS.find((item) => item.id === id);
}

/** Every shop item of one kind. */
export function lureShopItemsOfKind(kind: LureItemKind): LureShopItem[] {
  return LURE_SHOP_ITEMS.filter((item) => item.kind === kind);
}
