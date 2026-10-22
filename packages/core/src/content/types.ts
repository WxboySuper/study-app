/**
 * The shared types of the content registries.
 *
 * Every content entry (a critter, a pack, a junk item, a special, a fish)
 * has an id, a name, an art key and an optional availability window. The
 * registries live in this folder (`src/content`), so adding content is a
 * data change: an image plus one entry, never a logic change.
 *
 * See `docs/ADDING-CONTENT.md` for the guide.
 */

/** The window a content entry is available in (epoch milliseconds). */
export interface AvailabilityWindow {
  /** Epoch milliseconds; `null` means "always". */
  from: number | null;
  /** Epoch milliseconds (exclusive); `null` means "always". */
  until: number | null;
}

/** The kinds of content that have their own art. */
export type ContentType = 'critter' | 'junk' | 'special' | 'fish' | 'heavy';

/** The rarity tiers of a catch, from the most common to the rarest. */
export type CatchTier = 'trash' | 'easy' | 'great' | 'rare' | 'epic' | 'cotd' | 'legend';

/** The tiers in ladder order. */
export const CATCH_TIER_ORDER: readonly CatchTier[] = [
  'trash',
  'easy',
  'great',
  'rare',
  'epic',
  'cotd',
  'legend',
];

/** The seasons that unlock extra content. */
export type ContentSeason = 'halloween' | 'winter';

/** An entry that can be available for a while. */
export interface TimedEntry {
  /** Epoch milliseconds; `null` (or missing) means "always". */
  availableFrom?: number | null;
  /** Epoch milliseconds (exclusive); `null` (or missing) means "always". */
  availableUntil?: number | null;
}

/**
 * Whether `now` is inside the window.
 *
 * The window is `[from, until)`: a `null` bound means "always".
 */
export function isWithinWindow(window: AvailabilityWindow, now: number): boolean {
  if (window.from !== null && now < window.from) {
    return false;
  }
  if (window.until !== null && now >= window.until) {
    return false;
  }
  return true;
}

/** The window of an entry with flat `availableFrom`/`availableUntil` bounds. */
export function windowOf(entry: TimedEntry): AvailabilityWindow {
  return {
    from: entry.availableFrom ?? null,
    until: entry.availableUntil ?? null,
  };
}

/** Whether the entry is available at `now` (its own window). */
export function isAvailable(entry: TimedEntry, now: number): boolean {
  return isWithinWindow(windowOf(entry), now);
}
