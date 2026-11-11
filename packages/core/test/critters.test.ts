import { describe, expect, it } from 'vitest';

import {
  CRITTER_PACKS,
  CRITTER_RARITIES,
  CRITTER_RARITY_ODDS,
  CRITTERS,
  HALLOWEEN_PACK_ID,
  THANKSGIVING_PACK_ID,
  STARTER_PACK_ID,
  crittersByRarity,
  crittersOfPack,
  findCritter,
  findPack,
  isPackAvailable,
} from '../src/critters';

describe('the critter catalogue', () => {
  it('has the twelve Brain Buddies of the SPEC', () => {
    const starters = crittersOfPack(STARTER_PACK_ID);
    expect(starters).toHaveLength(12);
    expect(starters.map((critter) => critter.name)).toEqual([
      'Nibbles the Notecard',
      'Pip Pencil',
      'Doodle Moth',
      'Sir Highlighter',
      'Gummy Eraser',
      'Captain Cram',
      'Recall Raccoon',
      'Synapse Sprite',
      'Professor Hoot-n-Holler',
      'Mnemo the Memory Jelly',
      'The Spaced Ranger',
      'Gigabrain Golem',
    ]);
  });

  it('has the eight Midterm Monsters of the SPEC', () => {
    const halloween = crittersOfPack(HALLOWEEN_PACK_ID);
    expect(halloween).toHaveLength(8);
    expect(halloween.map((critter) => critter.name)).toContain('Headless Homework Horseman');
  });

  it('uses the pack odds of the SPEC', () => {
    expect(CRITTER_RARITY_ODDS).toEqual({ common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 });
    const total = Object.values(CRITTER_RARITY_ODDS).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(100);
    expect(CRITTER_RARITIES).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary']);
  });

  it('gives every critter a rarity, a vibe and a sprite', () => {
    for (const critter of CRITTERS) {
      expect(CRITTER_RARITIES).toContain(critter.rarity);
      expect(critter.vibe.length).toBeGreaterThan(0);
      expect(critter.assetId).toMatch(/^critter_/);
      expect(critter.emoji.length).toBeGreaterThan(0);
    }
  });

  it('finds a critter and a pack by id', () => {
    expect(findCritter('gigabrain_golem')?.rarity).toBe('legendary');
    expect(findCritter('nope')).toBeUndefined();
    expect(findPack(STARTER_PACK_ID)?.priceTokens).toBe(20);
    expect(findPack('nope')).toBeUndefined();
  });

  it('lists the critters of a rarity', () => {
    expect(crittersByRarity('legendary')).toHaveLength(3);
    expect(crittersByRarity('legendary', STARTER_PACK_ID)).toHaveLength(1);
    expect(crittersByRarity('legendary', STARTER_PACK_ID)[0]?.id).toBe('gigabrain_golem');
  });
});

describe('the packs', () => {
  it('keeps the starter pack on sale forever', () => {
    const pack = findPack(STARTER_PACK_ID);
    expect(pack).toBeDefined();
    expect(isPackAvailable(pack!, 0)).toBe(true);
    expect(isPackAvailable(pack!, Date.UTC(2030, 0, 1))).toBe(true);
  });

  it('only sells the Halloween pack inside its window', () => {
    const pack = findPack(HALLOWEEN_PACK_ID);
    expect(pack).toBeDefined();
    expect(pack!.kind).toBe('seasonal');

    // Oct 1 2026 00:00 CDT is the start of the window.
    expect(isPackAvailable(pack!, Date.UTC(2026, 9, 1, 5, 0, 0))).toBe(true);
    expect(isPackAvailable(pack!, Date.UTC(2026, 9, 1, 4, 59, 59))).toBe(false);
    // Nov 2 2026 00:00 CST is the end of the window.
    expect(isPackAvailable(pack!, Date.UTC(2026, 10, 2, 5, 59, 59))).toBe(true);
    expect(isPackAvailable(pack!, Date.UTC(2026, 10, 2, 6, 0, 0))).toBe(false);
  });

  it('has three packs', () => {
    expect(CRITTER_PACKS).toHaveLength(3);
  });
});

describe('the Thanksgiving pack', () => {
  it('has the eight Gobble Scholars and sells inside its window only', () => {
    const critters = crittersOfPack(THANKSGIVING_PACK_ID);
    expect(critters).toHaveLength(8);
    expect(critters.map((critter) => critter.name)).toContain('Gobble Scholar Supreme');

    const pack = findPack(THANKSGIVING_PACK_ID)!;
    expect(pack.kind).toBe('seasonal');
    expect(pack.priceTokens).toBe(25);
    expect(isPackAvailable(pack, Date.UTC(2026, 10, 2, 5, 59, 59))).toBe(false);
    expect(isPackAvailable(pack, Date.UTC(2026, 10, 2, 6, 0, 0))).toBe(true);
    expect(isPackAvailable(pack, Date.UTC(2026, 10, 26))).toBe(true);
    expect(isPackAvailable(pack, Date.UTC(2026, 11, 1, 6, 0, 0))).toBe(false);
  });
});
