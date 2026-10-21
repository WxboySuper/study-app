import { describe, expect, it } from 'vitest';

import {
  CATCHES,
  CATCH_TIER_ORDER,
  CATCH_TIERS,
  CRITTER_TIER,
  SPECIAL_COLOR,
  catchesOfTier,
  findCatch,
  findCritterCatch,
  formatLbs,
  tierDefinition,
  type CatchTier,
} from '../../src/fishing/catches';
import { CRITTERS } from '../../src/critters';

describe('the catch tiers (§6)', () => {
  it('has the seven tiers of the design doc', () => {
    expect(CATCH_TIER_ORDER).toEqual(['trash', 'easy', 'great', 'rare', 'epic', 'cotd', 'legend']);
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
    expect(tierDefinition('legend').maxLbs).toBe(2_500_000);
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
    }
  });

  it('has the five easy catches', () => {
    const easy = catchesOfTier('easy');
    expect(easy.map((entry) => entry.name)).toEqual([
      'Minnow Memo',
      'Flashcard Flounder',
      'Bluegill Bookmark',
      'Goldfish Cracker',
      'Lilypad Frog',
    ]);
    expect(easy.map((entry) => [entry.minLbs, entry.maxLbs])).toEqual([
      [10, 25],
      [15, 40],
      [20, 45],
      [30, 65],
      [50, 100],
    ]);
  });

  it('has the four great catches', () => {
    expect(catchesOfTier('great').map((entry) => entry.name)).toEqual([
      'Highlighter Trout',
      'Wet Cat',
      'Sticky-Note Sunfish',
      'Cram Carp',
    ]);
  });

  it('has the five rare catches', () => {
    expect(catchesOfTier('rare').map((entry) => entry.name)).toEqual([
      'Quizzical Catfish',
      'Seal of Approval',
      'Margin-Note Crab',
      'Pop-Quiz Pufferfish',
      'Blobfish of Burnout',
    ]);
  });

  it('has the four epic catches', () => {
    expect(catchesOfTier('epic').map((entry) => entry.name)).toEqual([
      'Lantern of Lore',
      'Octo-Tutor',
      'Thesis Tuna',
      'Donut Blobfish',
    ]);
  });

  it('has the three catches of the day', () => {
    expect(catchesOfTier('cotd').map((entry) => entry.name)).toEqual([
      'Synapse Narwhal',
      'Scholar Sturgeon',
      'Mega-Lodon of Midterms',
    ]);
  });

  it('has the legends, including the seasonal slot', () => {
    const legends = catchesOfTier('legend');
    expect(legends.map((entry) => entry.name)).toEqual([
      'The Spaced Leviathan',
      'Golden Grade Koi',
      "Teacher's UFO",
    ]);
  });

  it('only shows the seasonal catches in their season', () => {
    const halloween = catchesOfTier('legend', { season: 'halloween' });
    expect(halloween.map((entry) => entry.name)).toContain('Pumpkin Kraken');
    expect(halloween.map((entry) => entry.name)).not.toContain('Frost Whale');

    const winter = catchesOfTier('legend', { season: 'winter' });
    expect(winter.map((entry) => entry.name)).toContain('Frost Whale');
    expect(winter.map((entry) => entry.name)).not.toContain('Pumpkin Kraken');
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

  it('keeps the critter catches out of the normal tier pools', () => {
    for (const tier of CATCH_TIER_ORDER) {
      for (const entry of catchesOfTier(tier)) {
        expect(entry.critterId).toBeUndefined();
      }
    }
  });

  it('can include the critter catches on request', () => {
    const easy = catchesOfTier('easy', { includeCritters: true });
    expect(easy.some((entry) => entry.critterId !== undefined)).toBe(true);
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
