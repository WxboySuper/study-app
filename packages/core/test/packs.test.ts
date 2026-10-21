import { describe, expect, it } from 'vitest';

import { CRITTER_RARITIES, CRITTER_RARITY_ODDS, findCritter } from '../src/critters';
import { createSeededRng, type Rng } from '../src/fishing/roll';
import {
  PACKS,
  buyPack,
  findPackDef,
  openPack,
  packRarityOdds,
  type PackDef,
} from '../src/packs';
import { emptyWallet, type WalletSnapshot } from '../src/wallet';

const STARTER = 'brain_buddies';
const SEASONAL = 'midterm_monsters';

const TODAY = '2026-10-21';
/** Oct 21 2026, inside the window of the seasonal pack. */
const INSIDE_THE_WINDOW = Date.UTC(2026, 9, 21, 12, 0, 0);

/** A RNG that always returns the same numbers. */
function fixedRng(values: readonly number[]): Rng {
  let index = 0;
  return {
    next: () => values[index++ % values.length] ?? 0,
    int: (min: number) => min,
  };
}

function walletWith(balance: number, packTickets = 0): WalletSnapshot {
  return { ...emptyWallet(TODAY), balance, packTickets };
}

describe('the pack catalogue', () => {
  it('has Brain Buddies for 20 tokens, always on sale', () => {
    const pack = findPackDef(STARTER);
    expect(pack).toBeDefined();
    expect(pack!.name).toBe('Brain Buddies');
    expect(pack!.priceTokens).toBe(20);
    expect(pack!.kind).toBe('core');
    expect(pack!.critters).toHaveLength(12);
    expect(pack!.availableFrom).toBeNull();
    expect(pack!.availableUntil).toBeNull();
  });

  it('has Midterm Monsters for 25 tokens until Nov 2 2026', () => {
    const pack = findPackDef(SEASONAL);
    expect(pack).toBeDefined();
    expect(pack!.priceTokens).toBe(25);
    expect(pack!.kind).toBe('seasonal');
    expect(pack!.critters).toHaveLength(8);
    expect(pack!.availableUntil).not.toBeNull();
  });

  it('has the two packs of the SPEC', () => {
    expect(PACKS).toHaveLength(2);
    expect(PACKS.map((pack) => pack.id)).toEqual([STARTER, SEASONAL]);
  });
});

describe('the odds of a pack', () => {
  it('uses the odds of the SPEC when every rarity is there', () => {
    const odds = packRarityOdds(findPackDef(STARTER)!);
    expect(odds).toEqual({ common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 });
    const total = Object.values(odds).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('renormalizes over the rarities the pack holds', () => {
    const pack: PackDef = {
      id: 'test_pack',
      name: 'Test Pack',
      kind: 'core',
      priceTokens: 20,
      availableFrom: null,
      availableUntil: null,
      critters: [
        { ...findCritter('nibbles_the_notecard')!, packId: 'test_pack' },
        { ...findCritter('pip_pencil')!, packId: 'test_pack' },
        { ...findCritter('gummy_eraser')!, packId: 'test_pack' },
      ],
    };

    const odds = packRarityOdds(pack);
    // 60 and 25 renormalized over 85: 70.58 % and 29.41 %.
    expect(odds.common).toBeCloseTo((60 / 85) * 100, 6);
    expect(odds.uncommon).toBeCloseTo((25 / 85) * 100, 6);
    expect(odds.rare).toBe(0);
    expect(odds.epic).toBe(0);
    expect(odds.legendary).toBe(0);
    expect(odds.common + odds.uncommon).toBeCloseTo(100, 6);
  });

  it('is all zeroes for an empty pack', () => {
    const odds = packRarityOdds({
      id: 'empty',
      name: 'Empty',
      kind: 'core',
      priceTokens: 20,
      availableFrom: null,
      availableUntil: null,
      critters: [],
    });
    for (const rarity of CRITTER_RARITIES) {
      expect(odds[rarity]).toBe(0);
    }
  });
});

describe('openPack', () => {
  it('opens a critter of the pack', () => {
    const pack = findPackDef(STARTER)!;
    const critterId = openPack(pack, createSeededRng(7));
    expect(pack.critters.map((critter) => critter.id)).toContain(critterId);
  });

  it('rolls the rarity with the odds of the pack', () => {
    const pack = findPackDef(STARTER)!;

    expect(openPack(pack, fixedRng([0, 0]))).toBe('nibbles_the_notecard');
    expect(openPack(pack, fixedRng([0.7, 0]))).toBe('gummy_eraser');
    expect(openPack(pack, fixedRng([0.9, 0]))).toBe('synapse_sprite');
    expect(openPack(pack, fixedRng([0.97, 0]))).toBe('mnemo_the_memory_jelly');
    expect(openPack(pack, fixedRng([0.999, 0]))).toBe('gigabrain_golem');
  });

  it('throws for an empty pack', () => {
    expect(() =>
      openPack(
        {
          id: 'empty',
          name: 'Empty',
          kind: 'core',
          priceTokens: 20,
          availableFrom: null,
          availableUntil: null,
          critters: [],
        },
        createSeededRng(1),
      ),
    ).toThrow(/empty/);
  });

  it('follows the odds over many openings', () => {
    const pack = findPackDef(STARTER)!;
    const rng = createSeededRng(2026);
    const counts = new Map<string, number>();

    const runs = 20_000;
    for (let index = 0; index < runs; index += 1) {
      const critterId = openPack(pack, rng);
      counts.set(critterId, (counts.get(critterId) ?? 0) + 1);
    }

    for (const rarity of CRITTER_RARITIES) {
      const ofRarity = pack.critters.filter((critter) => critter.rarity === rarity);
      const hits = ofRarity.reduce((sum, critter) => sum + (counts.get(critter.id) ?? 0), 0);
      const share = (hits / runs) * 100;
      // The odds are the SPEC ones (the pack holds every rarity).
      expect(share).toBeGreaterThan(CRITTER_RARITY_ODDS[rarity] - 2);
      expect(share).toBeLessThan(CRITTER_RARITY_ODDS[rarity] + 2);
    }
  });
});

describe('buyPack', () => {
  it('sells a pack for its price', () => {
    const pack = findPackDef(STARTER)!;
    const result = buyPack(walletWith(100), pack, INSIDE_THE_WINDOW, {
      rng: fixedRng([0.999, 0]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.wallet.balance).toBe(80);
    expect(result.paidTokens).toBe(20);
    expect(result.usedTicket).toBe(false);
    expect(result.critterId).toBe('gigabrain_golem');
  });

  it('refuses a pack the player cannot pay for', () => {
    const pack = findPackDef(STARTER)!;
    const result = buyPack(walletWith(5), pack, INSIDE_THE_WINDOW);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('insufficient_tokens');
    expect(result.wallet.balance).toBe(5);
  });

  it('refuses a pack that is not on sale', () => {
    const pack = findPackDef(SEASONAL)!;
    const result = buyPack(walletWith(100), pack, Date.UTC(2026, 11, 1, 12, 0, 0));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('pack_unavailable');
    expect(result.wallet.balance).toBe(100);
  });

  it('opens any available pack with a ticket, for free', () => {
    const pack = findPackDef(SEASONAL)!;
    const result = buyPack(walletWith(0, 2), pack, INSIDE_THE_WINDOW, {
      useTicket: true,
      rng: fixedRng([0, 0]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.usedTicket).toBe(true);
    expect(result.paidTokens).toBe(0);
    expect(result.wallet.balance).toBe(0);
    expect(result.wallet.packTickets).toBe(1);
    expect(pack.critters.map((critter) => critter.id)).toContain(result.critterId);
  });

  it('refuses a ticket the player does not have', () => {
    const pack = findPackDef(STARTER)!;
    const result = buyPack(walletWith(100, 0), pack, INSIDE_THE_WINDOW, { useTicket: true });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('no_ticket');
    expect(result.wallet.packTickets).toBe(0);
    expect(result.wallet.balance).toBe(100);
  });

  it('refuses an empty pack', () => {
    const result = buyPack(
      walletWith(100),
      {
        id: 'empty',
        name: 'Empty',
        kind: 'core',
        priceTokens: 20,
        availableFrom: null,
        availableUntil: null,
        critters: [],
      },
      INSIDE_THE_WINDOW,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBe('empty_pack');
  });

  it('never changes the wallet it was given', () => {
    const wallet = walletWith(100, 1);
    buyPack(wallet, findPackDef(STARTER)!, INSIDE_THE_WINDOW, { rng: createSeededRng(3) });
    expect(wallet.balance).toBe(100);
    expect(wallet.packTickets).toBe(1);
  });
});
