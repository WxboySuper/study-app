import { describe, expect, it } from 'vitest';

import {
  BAIT_EFFECTS,
  EMPTY_BAITS,
  LURE_RANKS,
  LURE_SHOP_ITEMS,
  MAX_LURE_RANK,
  baitsFromIds,
  equippedBaitEffect,
  findLureShopItem,
  lureRankName,
  lureShopItemsOfKind,
} from '../../src/fishing/lures';

describe('the lure ranks', () => {
  it('has the five ranks of the design doc', () => {
    expect(LURE_RANKS.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(LURE_RANKS.map((entry) => entry.name)).toEqual([
      'Worm',
      'Spinner',
      'Jig',
      'Golden Fly',
      'Legend Lure',
    ]);
    expect(MAX_LURE_RANK).toBe(5);
  });

  it('names a rank', () => {
    expect(lureRankName(1)).toBe('Worm');
    expect(lureRankName(5)).toBe('Legend Lure');
    expect(lureRankName(99)).toBe('Worm');
  });
});

describe('the lure shop (§9)', () => {
  it('has the documented items and prices', () => {
    const byId = new Map(LURE_SHOP_ITEMS.map((item) => [item.id, item]));

    expect(byId.get('starting_lure_2')).toMatchObject({ priceTokens: 60, startRank: 2 });
    expect(byId.get('starting_lure_3')).toMatchObject({ priceTokens: 150, startRank: 3 });
    expect(byId.get('bait_shiny_spinner')).toMatchObject({ priceTokens: 30, bait: 'shiny_spinner' });
    expect(byId.get('bait_glow_jig')).toMatchObject({ priceTokens: 60, bait: 'glow_jig' });
    expect(byId.get('bait_critter_chum')).toMatchObject({ priceTokens: 80, bait: 'critter_chum' });
    expect(byId.get('rod_bamboo')).toMatchObject({ priceTokens: 40, kind: 'rod' });
    expect(byId.get('rod_carbon')).toMatchObject({ priceTokens: 90, kind: 'rod' });
    expect(byId.get('rod_legend_reel')).toMatchObject({ priceTokens: 200, kind: 'rod' });
  });

  it('has the three dock skins', () => {
    const skins = lureShopItemsOfKind('dock_skin');
    expect(skins.map((item) => item.name)).toEqual(['Dawn Dock', 'Night Dock', 'Halloween Swamp']);
    for (const skin of skins) {
      expect(skin.priceTokens).toBe(50);
    }
  });

  it('keeps the prices at or below eight pack prices', () => {
    // The most expensive pack costs 25 tokens (SPEC "Economy tuning") and the
    // Legend Reel sits exactly on the limit the design doc mentions.
    for (const item of LURE_SHOP_ITEMS) {
      expect(item.priceTokens).toBeLessThanOrEqual(25 * 8);
    }
  });

  it('finds an item by id', () => {
    expect(findLureShopItem('bait_glow_jig')?.name).toBe('Glow Jig');
    expect(findLureShopItem('nope')).toBeUndefined();
  });
});

describe('the baits', () => {
  it('starts without any bait', () => {
    expect(EMPTY_BAITS).toEqual({ shinySpinner: false, glowJig: false, critterChum: false });
    expect(equippedBaitEffect(EMPTY_BAITS)).toMatchObject({
      weightMultiplier: 1,
      rareTierBonus: 0,
      critterShare: 12,
    });
  });

  it('builds the equipped baits from their ids', () => {
    expect(baitsFromIds(['shiny_spinner', 'critter_chum'])).toEqual({
      shinySpinner: true,
      glowJig: false,
      critterChum: true,
    });
    expect(baitsFromIds([])).toEqual(EMPTY_BAITS);
  });

  it('adds 10 % weight with the Shiny Spinner', () => {
    const effect = equippedBaitEffect(baitsFromIds(['shiny_spinner']));
    expect(effect.weightMultiplier).toBeCloseTo(1.1, 10);
    expect(BAIT_EFFECTS.shiny_spinner.weightMultiplier).toBeCloseTo(1.1, 10);
  });

  it('adds 2 % to the rare tiers with the Glow Jig', () => {
    const effect = equippedBaitEffect(baitsFromIds(['glow_jig']));
    expect(effect.rareTierBonus).toBe(2);
  });

  it('raises the critter share to 16 % with the Critter Chum', () => {
    const effect = equippedBaitEffect(baitsFromIds(['critter_chum']));
    expect(effect.critterShare).toBe(16);
  });
});
