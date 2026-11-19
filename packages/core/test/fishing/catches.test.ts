import { describe, expect, it } from 'vitest';

import {
  CATCHES,
  CATCH_TIER_ORDER,
  CATCH_TIERS,
  CRITTER_TIER,
  LEGEND_MAX_SHARE,
  SPECIAL_COLOR,
  WIKI_ROW_COUNT,
  catchOddsForRank,
  catchPool,
  catchesForRank,
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
import { WIKI_TABLE, isTierAvailableAt, wikiRowByName } from '../../src/fishing/wiki';

/** Oct 21 2026: inside the window of the seasonal pack. */
const INSIDE_THE_WINDOW = Date.UTC(2026, 9, 21, 12, 0, 0);
/** Dec 24 2026: after the window of the seasonal pack. */
const OUTSIDE_THE_WINDOW = Date.UTC(2027, 1, 24, 12, 0, 0);

describe('the catch tiers (§6)', () => {
  it('has the seven tiers of the Blooket wiki', () => {
    expect(CATCH_TIER_ORDER).toEqual([
      'trash',
      'easy',
      'great',
      'rare',
      'epic',
      'cotd',
      'legend',
    ]);
    expect(CATCH_TIERS).toHaveLength(7);
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
    ]);

    expect(tierDefinition('trash')).toEqual({
      id: 'trash',
      name: 'Trash',
      color: '#8d6e63',
      minLbs: 1,
      maxLbs: 10,
    });
    expect(tierDefinition('legend').color).toBe('#8e24aa');
    expect(tierDefinition('legend').minLbs).toBe(500_000);
    expect(tierDefinition('legend').maxLbs).toBe(2_500_000);
  });

  it('grows the weight ladder tier by tier', () => {
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
  it('has the junk of the Trash tier, all 1-10 lbs', () => {
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
    expect(CATCHES).toHaveLength(JUNK.length + FISHES.length + HEAVY.length + CRITTERS.length);
  });

  it('fills every rarity tier with the critters of that rarity', () => {
    expect(catchesOfTier('easy', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name))
.toEqual(expect.arrayContaining([
      'Nibbles the Notecard',
      'Pip Pencil',
      'Doodle Moth',
      'Sir Highlighter',
      'Candy Corn Kid',
      'Pumpkin Pupil',
      'Bat-ter Up',
    ]));

    expect(catchesOfTier('great', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name))
.toEqual(expect.arrayContaining([
      'Gummy Eraser',
      'Captain Cram',
      'Recall Raccoon',
      'Ghost of Finals Past',
      'Mummy Wrapped-Up',
    ]));

    expect(catchesOfTier('rare', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name))
.toEqual(expect.arrayContaining([
      'Synapse Sprite',
      'Professor Hoot-n-Holler',
      'Count Flashula',
    ]));

    expect(catchesOfTier('epic', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name))
.toEqual(expect.arrayContaining([
      'Mnemo the Memory Jelly',
      'The Spaced Ranger',
      'The Witching Hour Owl',
    ]));

    expect(catchesOfTier('cotd', { now: INSIDE_THE_WINDOW }).map((entry) => entry.name))
.toEqual(expect.arrayContaining([
      'Gigabrain Golem',
      'Headless Homework Horseman',
    ]));
  });

  it('only swims up the critters of the packs that are on sale', () => {
    expect(catchesOfTier('easy', { now: OUTSIDE_THE_WINDOW }).map((entry) => entry.name))
.toEqual(expect.arrayContaining([
      'Nibbles the Notecard',
      'Pip Pencil',
      'Doodle Moth',
      'Sir Highlighter',
    ]));
  });

  it('keeps every catch inside the weight range of its tier', () => {
    for (const entry of CATCHES) {
      const tier = tierDefinition(entry.tier);
      expect(entry.minLbs).toBeGreaterThanOrEqual(tier.minLbs);
      expect(entry.maxLbs).toBeLessThanOrEqual(tier.maxLbs);
      expect(entry.minLbs).toBeLessThanOrEqual(entry.maxLbs);
    }
  });

  it('keeps every catch inside the range of the wiki row it is mapped to', () => {
    for (const entry of CATCHES) {
      const row = wikiRowByName(entry.wikiName);
      expect(entry.minLbs).toBeGreaterThanOrEqual(row.minLbs);
      expect(entry.maxLbs).toBeLessThanOrEqual(row.maxLbs);
      expect(entry.chance).toBe(row.chance);
      expect(entry.tier).toBe(
        CATCH_TIERS.find((tier) => tier.name === row.tier)?.id ?? entry.tier,
      );
    }
  });

  it('gives every catch a sprite id and an emoji', () => {
    for (const entry of CATCHES) {
      expect(entry.assetId.length).toBeGreaterThan(0);
      expect(entry.emoji.length).toBeGreaterThan(0);
    }
  });

  it('maps every wiki row of the table', () => {
    expect(WIKI_ROW_COUNT).toBe(WIKI_TABLE.length);
    expect(WIKI_TABLE).toHaveLength(37);
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
      legendary: 'cotd',
    });
  });

  it('has the critter catches in the pools of their tier', () => {
    for (const tier of CATCH_TIER_ORDER) {
      for (const entry of catchesOfTier(tier, { now: INSIDE_THE_WINDOW })) {
        if (tier === 'trash' || tier === 'legend') {
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
      wikiName: 'Old Boot',
      chance: 15,
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
  it('fills the Angler’s Legend tier with the registry', () => {
    const heavy = catchesOfTier('legend');

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
      expect(entry.tier).toBe('legend');
      expect(entry.assetId).toMatch(/^catch_heavy_/);
      expect(entry.emoji.length).toBeGreaterThan(0);
    }
  });

  it('maps the swamp monster and the treasure chest to their wiki rows', () => {
    expect(findCatch('heavy_swamp_monster')?.wikiName).toBe('Swamp Monster');
    expect(findCatch('heavy_swamp_monster')?.chance).toBe(0.1);
    expect(findCatch('heavy_treasure_chest')?.wikiName).toBe('Tim the Alien');
    expect(findCatch('heavy_treasure_chest')?.chance).toBe(0.05);
  });

  it('reads the catches from the heavy registry', () => {
    for (const heavy of HEAVY) {
      const catchDef = findCatch(`heavy_${heavy.id}`);
      expect(catchDef?.name).toBe(heavy.name);
      expect(catchDef?.assetId).toBe(heavy.assetId);
      expect(catchDef?.tier).toBe('legend');
    }
  });
});

describe('the pool and the odds of a rank', () => {
  it('only includes the tiers the rank can catch', () => {
    expect(catchesForRank(1).every((entry) => entry.tier === 'trash')).toBe(true);
    expect(catchesForRank(5).some((entry) => entry.tier === 'legend')).toBe(true);

    // Seasonal catches are only in the pool of their season, so they are
    // checked against the plain tier availability.
    for (const entry of CATCHES.filter((catchDef) => catchDef.seasonal === undefined)) {
      expect(catchesForRank(1).includes(entry)).toBe(isTierAvailableAt(entry.tier, 1));
    }
  });

  it('falls back to the closest tier when a tier has no catch', () => {
    const pool = catchPool('cotd', { now: INSIDE_THE_WINDOW, includeCritters: false });
    expect(pool.map((entry) => entry.name)).toContain('Galaxy Fish');
  });

  it('gives the catches of a rank the wiki chance as their weight', () => {
    const odds = catchOddsForRank(2, { now: INSIDE_THE_WINDOW });
    expect(odds.length).toBeGreaterThan(0);
    for (const entry of odds) {
      expect(entry.chance).toBe(entry.catch.chance);
      expect(entry.probability).toBeGreaterThan(0);
    }
    expect(odds.reduce((sum, entry) => sum + entry.probability, 0)).toBeCloseTo(100, 8);
  });

  it('adds up to 100 % at rank 1', () => {
    const odds = catchOddsForRank(1);
    expect(odds.reduce((sum, entry) => sum + entry.probability, 0)).toBeCloseTo(100, 8);
    expect(odds.every((entry) => entry.catch.tier === 'trash')).toBe(true);
  });

  it('keeps the Legend share at the cap at rank 5', () => {
    const odds = catchOddsForRank(5);
    const legend = odds
      .filter((entry) => entry.catch.tier === 'legend')
      .reduce((sum, entry) => sum + entry.probability, 0);

    expect(legend).toBeLessThanOrEqual(LEGEND_MAX_SHARE + 1e-9);
    expect(legend).toBeGreaterThan(0);
  });
});

describe('the catch helpers', () => {
  it('finds a catch by id', () => {
    expect(findCatch('old_sneaker')?.name).toBe('Old Sneaker');
    expect(findCatch('nope')).toBeUndefined();
  });

  it('formats a weight compactly', () => {
    expect(formatLbs(999)).toBe('999 lbs');
    expect(formatLbs(1234.6)).toBe('1.2k lbs');
    expect(formatLbs(3_300)).toBe('3.3k lbs');
    expect(formatLbs(1_000_000)).toBe('1M lbs');
    expect(formatLbs(1_234_567)).toBe('1.2M lbs');
  });
});
