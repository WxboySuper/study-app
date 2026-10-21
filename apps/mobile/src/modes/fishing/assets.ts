import { CATCH_TIERS, CRITTERS, JUNK, findCritterCatch, type CatchTier } from '@study-app/core';
import type { ImageSourcePropType } from 'react-native';

import { artFor } from '@/content/art';

/**
 * The sprites of the fishing mode.
 *
 * The PNGs live in `apps/mobile/assets/` and are listed in
 * `docs/design/fishing.md` §13a. The art itself is resolved by the art
 * resolver of the app (`src/content/art.ts`), which falls back to the
 * placeholder of the type of a catch when the PNG does not exist yet. The
 * game therefore runs without any art at all.
 *
 * `scripts/generate-fishing-assets.mjs` refreshes the art map once the PNGs
 * are in the repository.
 */

export { CONTENT_ART as FISHING_SPRITES } from '@/content/art';
export { resolveArt } from '@/content/art';

/** The placeholder of a sprite that has no PNG yet. */
export interface FishingFallback {
  /** The emoji that stands in for the sprite. */
  emoji: string;
  /** The colour of the placeholder circle. */
  color: string;
}

/** Every asset id of the design doc (§13a). */
export const FISHING_ASSET_IDS = [
  // Scene
  'bg_lake_day',
  'bg_lake_frenzy',
  'wave_strip',
  'fisher_rod',
  'bobber',
  'ripple_ring',
  'splash',
  'fish_shadow',
  // Junk
  'junk_old_sneaker',
  'junk_soggy_waffle',
  'junk_lost_homework',
  'junk_two_of_clubs',
  'junk_rubber_duck',
  'junk_tangled_earbuds',
  'junk_half_pencil',
  'junk_tin_can',
  'junk_hall_pass',
  'junk_pumpkin_carving',
  'junk_snowy_mittens',
  // Lures and baits
  'lure_r1_worm',
  'lure_r2_spinner',
  'lure_r3_jig',
  'lure_r4_golden_fly',
  'lure_r5_legend',
  'bait_critter_chum',
  // Specials and powerups
  'special_new_lure',
  'special_frenzy',
  'pu_double_hook',
  'pu_lucky_charm',
  'pu_second_chance',
  'pu_heavy_sinker',
  'special_pack_ticket',
  // UI
  'ui_hooked_banner',
  'ui_parchment_note',
  'ui_tag_wood',
  'ui_reveal_rays',
  'ui_tier_ribbon',
  'ui_coin',
] as const;

/** The id of a sprite. */
export type FishingAssetId = (typeof FISHING_ASSET_IDS)[number];

/** The placeholders of the scene, the UI and the special sprites. */
const STATIC_FALLBACKS: Readonly<Record<string, FishingFallback>> = {
  bg_lake_day: { emoji: '🏞️', color: '#8ecae6' },
  bg_lake_frenzy: { emoji: '🌈', color: '#c77dff' },
  wave_strip: { emoji: '🌊', color: '#caf0f8' },
  fisher_rod: { emoji: '🧜', color: '#4d96ff' },
  bobber: { emoji: '🔴', color: '#ef476f' },
  ripple_ring: { emoji: '⭕', color: '#e0fbfc' },
  splash: { emoji: '💦', color: '#90e0ef' },
  fish_shadow: { emoji: '🐟', color: '#1d3557' },
  special_new_lure: { emoji: '🎁', color: '#ffd166' },
  special_frenzy: { emoji: '🌈', color: '#ff5d8f' },
  pu_double_hook: { emoji: '🪝', color: '#48cae4' },
  pu_lucky_charm: { emoji: '🍀', color: '#52b788' },
  pu_second_chance: { emoji: '💗', color: '#ff85a1' },
  pu_heavy_sinker: { emoji: '⚓', color: '#adb5bd' },
  special_pack_ticket: { emoji: '🎟️', color: '#ffd60a' },
  ui_hooked_banner: { emoji: '💥', color: '#ffd60a' },
  ui_parchment_note: { emoji: '📜', color: '#f4e3b2' },
  ui_tag_wood: { emoji: '🪵', color: '#b08968' },
  ui_reveal_rays: { emoji: '🌟', color: '#ffffff' },
  ui_tier_ribbon: { emoji: '🎗️', color: '#ffffff' },
  ui_coin: { emoji: '🪙', color: '#ffd60a' },
};

/** The colour of a tier. */
export function tierColor(tier: CatchTier): string {
  return CATCH_TIERS.find((entry) => entry.id === tier)?.color ?? '#9e9e9e';
}

/**
 * The placeholder of a sprite.
 *
 * The catches and the critters take their emoji from the core registries, so
 * the placeholder always looks like the catch it stands in for.
 */
export function fallbackFor(assetId: string): FishingFallback {
  const staticFallback = STATIC_FALLBACKS[assetId];
  if (staticFallback !== undefined) {
    return staticFallback;
  }

  const critter = CRITTERS.find((entry) => entry.assetId === assetId);
  if (critter !== undefined) {
    const critterCatch = findCritterCatch(critter.id);
    return {
      emoji: critter.emoji,
      color: critterCatch === undefined ? '#9e9e9e' : tierColor(critterCatch.tier),
    };
  }

  const junk = JUNK.find((entry) => entry.assetId === assetId);
  if (junk !== undefined) {
    return { emoji: junk.emoji, color: tierColor(junk.tier) };
  }

  return { emoji: '🟦', color: '#9e9e9e' };
}

/** The PNG of a sprite, or `null` when the art does not exist (yet). */
export function fishingSprite(assetId: string): ImageSourcePropType | null {
  return artFor(assetId);
}
