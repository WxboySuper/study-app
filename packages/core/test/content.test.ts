import { describe, expect, it } from 'vitest';

import {
  CRITTER_PACKS,
  CRITTER_RARITIES,
  CRITTER_RARITY_ODDS,
  CRITTERS,
  FISHES,
  JUNK,
  POWERUPS,
  SPECIALS,
  contentTypeOf,
  isAvailable,
  isWithinWindow,
  windowOf,
} from '../src/content';

describe('the content registries', () => {
  it('has one registry per content type', () => {
    expect(CRITTERS.length).toBeGreaterThan(0);
    expect(CRITTER_PACKS.length).toBeGreaterThan(0);
    expect(JUNK.length).toBeGreaterThan(0);
    expect(SPECIALS.length).toBeGreaterThan(0);
    expect(POWERUPS.length).toBeGreaterThan(0);
    // The fish registry is typed, but empty for now.
    expect(FISHES).toEqual([]);
  });

  it('has no duplicate ids', () => {
    const ids = [
      ...CRITTERS.map((entry) => entry.id),
      ...CRITTER_PACKS.map((entry) => entry.id),
      ...JUNK.map((entry) => entry.id),
      ...SPECIALS.map((entry) => entry.id),
      ...POWERUPS.map((entry) => entry.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate art keys', () => {
    const assetIds = [
      ...CRITTERS.map((entry) => entry.assetId),
      ...JUNK.map((entry) => entry.assetId),
      ...SPECIALS.map((entry) => entry.assetId),
      ...POWERUPS.map((entry) => entry.assetId),
    ];

    expect(new Set(assetIds).size).toBe(assetIds.length);
  });

  it('puts every critter in a pack of the catalogue', () => {
    for (const critter of CRITTERS) {
      expect(CRITTER_PACKS.map((pack) => pack.id)).toContain(critter.packId);
      expect(CRITTER_RARITIES).toContain(critter.rarity);
      expect(critter.assetId).toMatch(/^critter_/);
      expect(critter.emoji.length).toBeGreaterThan(0);
    }
  });

  it('names the art key of every entry', () => {
    for (const entry of [...JUNK, ...SPECIALS, ...POWERUPS]) {
      expect(entry.assetId.length).toBeGreaterThan(0);
      expect(entry.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('the content type of an art key', () => {
  it('knows the type of every kind of content', () => {
    expect(contentTypeOf('critter_gigabrain_golem')).toBe('critter');
    expect(contentTypeOf('junk_old_sneaker')).toBe('junk');
    expect(contentTypeOf('special_frenzy')).toBe('special');
    expect(contentTypeOf('special_pack_ticket')).toBe('special');
    expect(contentTypeOf('pu_double_hook')).toBe('special');
  });

  it('falls back to the special for an unknown key', () => {
    expect(contentTypeOf('who_knows')).toBe('special');
  });
});

describe('the availability windows', () => {
  it('reads the window of an entry', () => {
    expect(windowOf({})).toEqual({ from: null, until: null });
    expect(windowOf({ availableFrom: 10, availableUntil: 20 })).toEqual({ from: 10, until: 20 });
    expect(windowOf({ availableUntil: 20 })).toEqual({ from: null, until: 20 });
  });

  it('knows whether a moment is inside a window', () => {
    expect(isWithinWindow({ from: null, until: null }, 1_000)).toBe(true);
    expect(isWithinWindow({ from: 10, until: 20 }, 9)).toBe(false);
    expect(isWithinWindow({ from: 10, until: 20 }, 10)).toBe(true);
    expect(isWithinWindow({ from: 10, until: 20 }, 19)).toBe(true);
    expect(isWithinWindow({ from: 10, until: 20 }, 20)).toBe(false);
  });

  it('knows whether an entry is available', () => {
    expect(isAvailable({}, 1_000)).toBe(true);
    expect(isAvailable({ availableFrom: 10 }, 9)).toBe(false);
    expect(isAvailable({ availableUntil: 20 }, 20)).toBe(false);
    expect(isAvailable({ availableFrom: 10, availableUntil: 20 }, 15)).toBe(true);
  });
});

describe('the odds of the packs', () => {
  it('uses the odds of the SPEC', () => {
    expect(CRITTER_RARITY_ODDS).toEqual({
      common: 65,
      uncommon: 24,
      rare: 8,
      epic: 2.5,
      legendary: 0.5,
    });
  });
});
