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

/**
 * The Thanksgiving 2026 seasonal pack. It follows Halloween: on sale from
 * Nov 2 to Dec 1, 2026 (US Central time).
 */
export const THANKSGIVING_PACK_ID = 'gobble_scholars';

/**
 * The Winter 2026 seasonal pack. It follows Thanksgiving: on sale from Dec 1
 * 2026 to Jan 1 2027 (US Central time), the finals season.
 */
export const WINTER_PACK_ID = 'frostbitten_finals';

/**
 * The Flight School pack: an aviation-themed core pack, always on sale.
 */
export const FLIGHT_PACK_ID = 'flight_school';

/** Every pack of the catalogue. */
export const CRITTER_PACKS: readonly CritterPackDef[] = [
  {
    id: STARTER_PACK_ID,
    name: 'Brain Buddies',
    kind: 'core',
    priceTokens: 30,
    availableFrom: null,
    availableUntil: null,
    assetId: 'pack_brain_buddies',
    emoji: '🧠',
  },
  {
    id: FLIGHT_PACK_ID,
    name: 'Flight School',
    kind: 'core',
    priceTokens: 30,
    availableFrom: null,
    availableUntil: null,
    assetId: 'pack_flight_school',
    emoji: '✈️',
  },
  {
    id: HALLOWEEN_PACK_ID,
    name: 'Halloween 2026 — Midterm Monsters',
    kind: 'seasonal',
    priceTokens: 40,
    // Oct 1 2026 00:00 CDT (UTC-5) -> Nov 2 2026 00:00 CST (UTC-6).
    availableFrom: Date.UTC(2026, 9, 1, 5, 0, 0),
    availableUntil: Date.UTC(2026, 10, 2, 6, 0, 0),
    assetId: 'pack_midterm_monsters',
    emoji: '🎃',
  },
  {
    id: THANKSGIVING_PACK_ID,
    name: 'Thanksgiving 2026 — Gobble Scholars',
    kind: 'seasonal',
    priceTokens: 40,
    // Nov 2 2026 00:00 CST (UTC-6) -> Dec 1 2026 00:00 CST (UTC-6).
    availableFrom: Date.UTC(2026, 10, 2, 6, 0, 0),
    availableUntil: Date.UTC(2026, 11, 1, 6, 0, 0),
    assetId: 'pack_gobble_scholars',
    emoji: '🦃',
  },
  {
    id: WINTER_PACK_ID,
    name: 'Winter 2026 — Frostbitten Finals',
    kind: 'seasonal',
    priceTokens: 40,
    // Dec 1 2026 00:00 CST (UTC-6) -> Jan 1 2027 00:00 CST (UTC-6).
    availableFrom: Date.UTC(2026, 11, 1, 6, 0, 0),
    availableUntil: Date.UTC(2027, 0, 1, 6, 0, 0),
    assetId: 'pack_frostbitten_finals',
    emoji: '❄️',
  },
];
