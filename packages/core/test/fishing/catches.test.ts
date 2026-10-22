import { describe, expect, it } from 'vitest';

import {
  CATCHES,
  CATCH_TIER_ORDER,
  CATCH_TIERS,
  CRITTER_TIER,
  SPECIAL_COLOR,
  catchPool,
  catchesOfTier,
  findCatch,
  findCritterCatch,
  formatLbs,
  isCatchAvailable,
  tierDefinition,
  type CatchDef,
  type CatchTier,
} from '../../src/fishing/catches';
import { CRITTERS } from '../../src/content/critters';
import { JUNK } from '../../src/content/junk';
import { FISHES } from '../../src/content/fish';
import { HEAVY } from '../../src/content/heavy';

/** Oct 21 2026: inside the window of the seasonal pack. */
const INSIDE_THE_WINDOW = Date.UTC(2026, 9, 21, 12, 0, 0);
/** Dec 24 2026: after the window of the seasonal pack. */
const OUTSIDE_THE_WINDOW = Date.UTC(2026, 11, 24, 12, 0, 0);

describe('the catch tiers (§6)', () => {
  it('has the eight tiers of the design doc', () => {
    expect(CATCH_TIER_ORDER).toEqual([
      'trash',
      'easy',
      'great',
      'rare',
      'epic',
      'cotd',
      'legend',
      'heavy',
    ]);
    expect(CATCH_TIERS).toHaveLength(8);
  });

  it('uses the documented names, colours and weight ranges', () => {
    expect(CATCH_TIERS.map((tier) => tier.name)).toEqual([
      'Trash',
      'Easy One',
      'Great Catch',
      'Rare Find',
      'Epic Grab',
      'Catch of the Day',
      "Angler's Legend",
      'Heavy Catch',
    ]);

    expect(tierDefinition('trash')).toEqual({
      id: 'trash',
      name: 'Trash',
      color: '#8d6e63',
      minLbs: 1,
      maxLbs: 10,
    });
    expect(tierDefinition('legend').color).toBe('#8e24aa');
    expect(tierDefinition('legend').maxLbs).toBe(2_500_000);
  });

  it('gives the heavy tier a haul of its own', () => {
    const heavy = tierDefinition('heavy');
    const legend = tierDefinition('legend');

    expect(heavy.name).toBe('Heavy Catch');
    expect(heavy.minLbs).toBeGreaterThanOrEqual(legend.maxLbs);
    expect(heavy.maxLbs).toBeGreaterThan(legend.maxLbs);
  });

  it('grows the weight ladder about 10x per tier', () => {
    for (let index = 1; index < CATCH_TIERS.length; index += 1) {
      const previous = CATCH_TIERS[index - 1]!;
      const current = CATCH_TIERS[index]!;
      expect(current.minLbs).toBeGreaterThan(previous.minLbs);
      expect(current.maxLbs).toBeGreaterThan(previous.maxLbs);
    }
  });

  it('throws for an unknown tier', () => {
    expect(() => tierDefinition('nope' as CatchTier)).toThrow(/Unknown catch tier/);
  });

  it('has a chroma colour for the specials', () => {
    expect(SPECIAL_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('the catch list (§7)', () => {
  it('has the nine junk catches of the design doc', () => {
    const junk = catchesOfTier('trash');
    expect(junk.map((entry) => entry.name)).toEqual([
      'Old Sneaker',
      'Soggy Waffle',
      'Lost Homework',
      'Two of Clubs',
      'Rubber Duck',
      'Tangled Earbuds',
      'Half a Pencil',
      'Mystery Tin Can',
      'Expired Hall Pass',
    ]);
    for (const entry of junk) {
      expect(entry.minLbs).toBe(1);
      expect(entry.maxLbs).toBe(10);
      expect(entry.joke).toBeDefined();
      expect(entry.contentType).toBe('junk');
    }
  });

  it('reads the junk from the junk registry', () => {
    expect(JUNK).toHaveLength(11);
    for (const junk of JUNK) {
      const catchDef = findCatch(junk.id);
      expect(catchDef?.name).toBe(junk.name);
      expect(catchDef?.assetId).toBe(junk.assetId);
      expect(catchDef?.emoji).toBe(junk.emoji);
    }
  });

  it('only shows the seasonal junk in its season', () => {
    const halloween = catchesOfTier('trash', { season: 'halloween' });
    expect(halloween.map((entry) => entry.name)).toContain('Pumpkin Carving');
    expect(halloween.map((entry) => entry.name)).not.toContain('Snowy Mittens');

    const winter = catchesOfTier('trash', { season: 'winter' });
    expect(winter.map((entry) => entry.name)).toContain('Snowy Mittens');
    expect(winter.map((entry) => entry.name)).not.toContain('Pumpkin Carving');

    // Without a season only the junk that is always there swims up.
    expect(catchesOfTier('trash').map((entry) => entry.name)).not.toContain('Pumpkin Carving');
  });

  it('has no fish left in the catalogue', () => {
    expect(FISHES).toHaveLength(0);
    for (const entry of CATCHES) {
      expect(entry.contentType).not.toBe('fish');
      expect(entry.assetId).not.toMatch(/^fish_/);
    }
  });

  it('builds the catalogue from the registries', () => {
    // A fish of the (empty) fish registry would be a catch of its own, so
    // adding one is a data change.
    expect(CATCHES).toHaveLength(JUNK.length + FISHES.length + HEAVY.length + CRITTERS.length);
  });

  it('fills every rarity tier with the critters of that rarity', () => {
    const easy = catchesOfTier('easy', { now: INSIDE_THE_WINDOW });
    expect(easy.map((entry) => entry.name)).toEqual([
      'Nibbles the Notecard',
      'Pip Pencil',
      'Doodle Moth',
      'Sir Highlighter',
      'Candy Corn Kid',
      'Pumpkin Pupil',
      'Bat-ter Up',
    ]);

    expect(catchesOfTier('great', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name)).toEqual([
      'Gummy Eraser',
      'Captain Cram',
      'Recall Raccoon',
      'Ghost of Finals Past',
      'Mummy Wrapped-Up',
    ]);

    expect(catchesOfTier('rare', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name)).toEqual([
      'Synapse Sprite',
      'Professor Hoot-n-Holler',
      'Count Flashula',
    ]);

    expect(catchesOfTier('epic', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name)).toEqual([
      'Mnemo the Memory Jelly',
      'The Spaced Ranger',
      'The Witching Hour Owl',
    ]);

    expect(catchesOfTier('legend', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name)).toEqual([
      'Gigabrain Golem',
      'Headless Homework Horseman',
    ]);
  });

  it('only swims up the critters of the packs that are on sale', () => {
    const easy = catchesOfTier('easy', { now: OUTSIDE_THE_WINDOW });
    expect(easy.map((entry) => entry.name)).toEqual([
      'Nibbles the Notecard',
      'Pip Pencil',
      'Doodle Moth',
      'Sir Highlighter',
    ]);
  });

  it('keeps the tier weights of the design doc', () => {
    const easy = catchesOfTier('easy', { now: INSIDE_THE_WINDOW })[0]!;
    expect([easy.minLbs, easy.maxLbs]).toEqual([10, 100]);

    const legend = catchesOfTier('legend', { now: INSIDE_THE_WINDOW })[0]!;
    expect([legend.minLbs, legend.maxLbs]).toEqual([500_000, 2_500_000]);
  });

  it('keeps every catch inside the weight range of its tier', () => {
    for (const entry of CATCHES) {
      const tier = tierDefinition(entry.tier);
      expect(entry.minLbs).toBeGreaterThanOrEqual(tier.minLbs);
      expect(entry.maxLbs).toBeLessThanOrEqual(tier.maxLbs);
      expect(entry.minLbs).toBeLessThanOrEqual(entry.maxLbs);
    }
  });

  it('gives every catch a sprite id and an emoji', () => {
    for (const entry of CATCHES) {
      expect(entry.assetId.length).toBeGreaterThan(0);
      expect(entry.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('the critter catches', () => {
  it('links every critter of the catalogue to a catch', () => {
    for (const critter of CRITTERS) {
      const linked = findCritterCatch(critter.id);
      expect(linked).toBeDefined();
      expect(linked?.critterId).toBe(critter.id);
      expect(linked?.name).toBe(critter.name);
      expect(linked?.assetId).toBe(critter.assetId);
      expect(linked?.packId).toBe(critter.packId);
      expect(linked?.contentType).toBe('critter');
    }
  });

  it('puts a critter on the tier of its rarity', () => {
    expect(CRITTER_TIER).toEqual({
      common: 'easy',
      uncommon: 'great',
      rare: 'rare',
      epic: 'epic',
      legendary: 'legend',
    });
  });

  it('has the critter catches in the pools of their tier', () => {
    for (const tier of CATCH_TIER_ORDER) {
      for (const entry of catchesOfTier(tier, { now: INSIDE_THE_WINDOW })) {
        if (tier === 'trash' || tier === 'heavy') {
          expect(entry.critterId).toBeUndefined();
        } else {
          expect(entry.critterId).toBeDefined();
        }
      }
    }
  });

  it('can leave the critter catches out on request', () => {
    const easy = catchesOfTier('easy', { now: INSIDE_THE_WINDOW, includeCritters: false });
    expect(easy).toHaveLength(0);
  });

  it('knows whether a catch is available', () => {
    const seasonal = findCritterCatch('candy_corn_kid')!;
    expect(isCatchAvailable(seasonal, INSIDE_THE_WINDOW)).toBe(true);
    expect(isCatchAvailable(seasonal, OUTSIDE_THE_WINDOW)).toBe(false);

    const starter = findCritterCatch('nibbles_the_notecard')!;
    expect(isCatchAvailable(starter, OUTSIDE_THE_WINDOW)).toBe(true);

    const junk = findCatch('old_sneaker')!;
    expect(isCatchAvailable(junk, OUTSIDE_THE_WINDOW)).toBe(true);
  });

  it('knows whether a catch is inside its own window', () => {
    const timed: CatchDef = {
      id: 'timed',
      name: 'Timed',
      tier: 'trash',
      minLbs: 1,
      maxLbs: 10,
      assetId: 'junk_timed',
      emoji: '⏳',
      contentType: 'junk',
      availableFrom: 100,
      availableUntil: 200,
    };

    expect(isCatchAvailable(timed, 99)).toBe(false);
    expect(isCatchAvailable(timed, 100)).toBe(true);
    expect(isCatchAvailable(timed, 199)).toBe(true);
    expect(isCatchAvailable(timed, 200)).toBe(false);
  });
});

describe('the heavy catches', () => {
  it('fills the heavy tier with the registry', () => {
    const heavy = catchesOfTier('heavy');

    expect(heavy.map((entry) => entry.name)).toEqual([
      'Galaxy Fish',
      'Golden Koi',
      'Ice Fish',
      'Skeleton Fish',
      'Swamp Monster',
      'Treasure Chest',
      'Void Fish',
    ]);
    for (const entry of heavy) {
      expect(entry.contentType).toBe('heavy');
      expect(entry.assetId).toMatch(/^catch_heavy_/);
      expect(entry.emoji.length).toBeGreaterThan(0);
    }
  });

  it('weighs more than any critter tier', () => {
    const legend = tierDefinition('legend');
    const heavy = tierDefinition('heavy');

    for (const entry of catchesOfTier('heavy')) {
      expect(entry.minLbs).toBeGreaterThanOrEqual(heavy.minLbs);
      expect(entry.maxLbs).toBeLessThanOrEqual(heavy.maxLbs);
      expect(entry.minLbs).toBeGreaterThan(legend.maxLbs);
    }
  });

  it('reads the catches from the heavy registry', () => {
    for (const heavy of HEAVY) {
      const catchDef = findCatch(`heavy_${heavy.id}`);
      expect(catchDef?.name).toBe(heavy.name);
      expect(catchDef?.assetId).toBe(heavy.assetId);
      expect(catchDef?.tier).toBe('heavy');
    }
  });
});

describe('the pool of a tier', () => {
  it('falls back to the closest tier when a tier has no catch', () => {
    // The "Catch of the Day" tier has no critter: the pool is the legends.
    expect(catchesOfTier('cotd', { now: INSIDE_THE_WINDOW })).toHaveLength(0);

    const pool = catchPool('cotd', { now: INSIDE_THE_WINDOW });
    expect(pool.map((entry) => entry.name)).toEqual([
      'Gigabrain Golem',
      'Headless Homework Horseman',
    ]);
  });

  it('falls back to the heavy catches when no critter is left', () => {
    const pool = catchPool('cotd', { now: INSIDE_THE_WINDOW, includeCritters: false });
    expect(pool.map((entry) => entry.name)).toContain('Galaxy Fish');
  });
});

describe('the catch helpers', () => {
  it('finds a catch by id', () => {
    expect(findCatch('old_sneaker')?.name).toBe('Old Sneaker');
    expect(findCatch('nope')).toBeUndefined();
  });

  it('formats a weight', () => {
    expect(formatLbs(1234.6)).toBe('1,235 lbs');
  });
});
