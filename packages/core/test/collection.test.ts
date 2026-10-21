import { describe, expect, it } from 'vitest';

import {
  CRITTER_SELL_VALUES,
  collectionEntry,
  collectionProgress,
  critterSellValue,
  sellAllDuplicates,
  sellDuplicate,
} from '../src/collection';
import { PACKS, findPackDef } from '../src/packs';

describe('the sell values', () => {
  it('scales with the rarity', () => {
    expect(CRITTER_SELL_VALUES).toEqual({
      common: 1,
      uncommon: 2,
      rare: 4,
      epic: 8,
      legendary: 15,
    });
  });

  it('knows the value of a critter', () => {
    expect(critterSellValue('nibbles_the_notecard')).toBe(1);
    expect(critterSellValue('gummy_eraser')).toBe(2);
    expect(critterSellValue('synapse_sprite')).toBe(4);
    expect(critterSellValue('mnemo_the_memory_jelly')).toBe(8);
    expect(critterSellValue('gigabrain_golem')).toBe(15);
    expect(critterSellValue('nobody')).toBe(0);
  });

  it('is always below the cheapest pack', () => {
    const cheapestPack = Math.min(...PACKS.map((pack) => pack.priceTokens));
    expect(cheapestPack).toBe(20);

    for (const [rarity, value] of Object.entries(CRITTER_SELL_VALUES)) {
      expect(value, `${rarity} sells for ${value}`).toBeLessThan(cheapestPack);
    }
  });
});

describe('the collection', () => {
  it('reads one critter of the collection', () => {
    const entry = collectionEntry(new Map([['nibbles_the_notecard', 3]]), 'nibbles_the_notecard');
    expect(entry?.count).toBe(3);
    expect(entry?.duplicates).toBe(2);
    expect(entry?.sellValue).toBe(1);
    expect(collectionEntry(new Map(), 'nope')).toBeUndefined();
  });

  it('counts how much of a pack is owned', () => {
    const pack = findPackDef('brain_buddies')!;
    expect(collectionProgress(new Map(), pack)).toEqual({ owned: 0, total: 12 });
    expect(
      collectionProgress(
        new Map([
          ['nibbles_the_notecard', 1],
          ['gigabrain_golem', 2],
        ]),
        pack,
      ),
    ).toEqual({ owned: 2, total: 12 });
  });
});

describe('sellDuplicate', () => {
  it('sells the duplicates and pays for them', () => {
    const result = sellDuplicate(new Map([['nibbles_the_notecard', 3]]), 'nibbles_the_notecard', 2);
    expect(result.sold).toBe(2);
    expect(result.tokens).toBe(2);
    expect(result.collection.get('nibbles_the_notecard')).toBe(1);
  });

  it('never sells the last copy', () => {
    const result = sellDuplicate(new Map([['nibbles_the_notecard', 1]]), 'nibbles_the_notecard', 5);
    expect(result.sold).toBe(0);
    expect(result.tokens).toBe(0);
    expect(result.collection.get('nibbles_the_notecard')).toBe(1);
  });

  it('clamps the quantity to the duplicates the player owns', () => {
    const result = sellDuplicate(new Map([['gigabrain_golem', 2]]), 'gigabrain_golem', 10);
    expect(result.sold).toBe(1);
    expect(result.tokens).toBe(15);
    expect(result.collection.get('gigabrain_golem')).toBe(1);
  });

  it('sells nothing for a critter the player does not own', () => {
    const result = sellDuplicate(new Map(), 'gigabrain_golem', 1);
    expect(result.sold).toBe(0);
    expect(result.tokens).toBe(0);
    expect(result.collection.has('gigabrain_golem')).toBe(false);
  });

  it('ignores a negative or broken quantity', () => {
    expect(sellDuplicate(new Map([['nibbles_the_notecard', 3]]), 'nibbles_the_notecard', -2).sold).toBe(0);
    expect(sellDuplicate(new Map([['nibbles_the_notecard', 3]]), 'nibbles_the_notecard', Number.NaN).sold).toBe(0);
  });

  it('never changes the collection it was given', () => {
    const collection = new Map([['nibbles_the_notecard', 3]]);
    sellDuplicate(collection, 'nibbles_the_notecard', 1);
    expect(collection.get('nibbles_the_notecard')).toBe(3);
  });
});

describe('sellAllDuplicates', () => {
  it('sells every duplicate but keeps one of every critter', () => {
    const result = sellAllDuplicates(
      new Map([
        ['nibbles_the_notecard', 3],
        ['gummy_eraser', 2],
        ['gigabrain_golem', 1],
      ]),
    );

    expect(result.sold.get('nibbles_the_notecard')).toBe(2);
    expect(result.sold.get('gummy_eraser')).toBe(1);
    expect(result.sold.has('gigabrain_golem')).toBe(false);
    // 2 common duplicates + 1 uncommon duplicate.
    expect(result.tokens).toBe(2 * 1 + 2);
    expect(result.collection.get('nibbles_the_notecard')).toBe(1);
    expect(result.collection.get('gummy_eraser')).toBe(1);
    expect(result.collection.get('gigabrain_golem')).toBe(1);
  });

  it('sells nothing when there is no duplicate', () => {
    const result = sellAllDuplicates(new Map([['nibbles_the_notecard', 1]]));
    expect(result.tokens).toBe(0);
    expect(result.sold.size).toBe(0);
  });
});
