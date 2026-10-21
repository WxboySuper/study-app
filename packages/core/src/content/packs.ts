/**
 * The pack registry (docs/SPEC.md §3, "Collectibles: packs & critters").
 *
 * A pack is bought with tokens and holds critters. `core` packs are always
 * on sale, `seasonal` packs only inside their window.
 *
 * The data lives here so that adding a pack is a data change: one entry and
 * one image. The rules (the odds, the buying, the availability) live in the
 * logic files that import this registry.
 */

/** The kind of a pack. */
export type PackKind = 'core' | 'seasonal';

/** A pack of critters. */
export interface CritterPackDef {
  id: string;
  name: string;
  /** `core` packs are always on sale, `seasonal` packs only inside their window. */
  kind: PackKind;
  /** The price in tokens (SPEC "Economy tuning": 20 for core, 25 for seasonal). */
  priceTokens: number;
  /** Epoch milliseconds. `null` means "always on sale" (see SPEC §5). */
  availableFrom: number | null;
  /** Epoch milliseconds (exclusive). `null` means "always on sale". */
  availableUntil: number | null;
  /** The art key of the pack (the file name of the PNG). */
  assetId?: string;
  /** The emoji used when the art is missing. */
  emoji?: string;
}

/**
 * The starter pack: always available, 20 tokens (SPEC "Economy tuning").
 */
export const STARTER_PACK_ID = 'brain_buddies';

/**
 * The Halloween 2026 seasonal pack. It is only on sale from Oct 1 to Nov 2,
 * 2026 (US Central time), which is the window the SPEC announces.
 */
export const HALLOWEEN_PACK_ID = 'midterm_monsters';

/** Every pack of the catalogue. */
export const CRITTER_PACKS: readonly CritterPackDef[] = [
  {
    id: STARTER_PACK_ID,
    name: 'Brain Buddies',
    kind: 'core',
    priceTokens: 20,
    availableFrom: null,
    availableUntil: null,
    assetId: 'pack_brain_buddies',
    emoji: '🧠',
  },
  {
    id: HALLOWEEN_PACK_ID,
    name: 'Halloween 2026 — Midterm Monsters',
    kind: 'seasonal',
    priceTokens: 25,
    // Oct 1 2026 00:00 CDT (UTC-5) -> Nov 2 2026 00:00 CST (UTC-6).
    availableFrom: Date.UTC(2026, 9, 1, 5, 0, 0),
    availableUntil: Date.UTC(2026, 10, 2, 6, 0, 0),
    assetId: 'pack_midterm_monsters',
    emoji: '🎃',
  },
];
