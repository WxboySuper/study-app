/**
 * The pack shop (docs/SPEC.md §3, "Collectibles: packs & critters").
 *
 * A pack is bought with tokens (or with a pack ticket) and gives one random
 * critter of the pack, weighted by rarity: "Common 60% · Uncommon 25% ·
 * Rare 10% · Epic 4% · Legendary 1%". When a pack does not hold a rarity,
 * the odds are renormalized over the rarities it does hold.
 *
 * Everything in this file is pure: the random source is injected, so a pack
 * can be opened in a test with a seeded RNG. The wallet rules live in
 * `src/wallet.ts`, the collection rules in `src/collection.ts`.
 */

import {
  CRITTER_PACKS,
  CRITTER_RARITIES,
  CRITTER_RARITY_ODDS,
  crittersOfPack,
  isPackAvailable,
  type CritterDef,
  type CritterPackDef,
  type CritterRarity,
} from './critters';
import { createRandomRng, type Rng } from './fishing/roll';
import type { WalletSnapshot } from './wallet';

/** A pack of the shop: the catalogue entry plus its critters. */
export interface PackDef extends CritterPackDef {
  /** The critters of the pack, in catalogue order. */
  critters: readonly CritterDef[];
}

/** Every pack of the shop. */
export const PACKS: readonly PackDef[] = CRITTER_PACKS.map((pack) => ({
  ...pack,
  critters: crittersOfPack(pack.id),
}));

/** Looks a pack of the shop up by id. */
export function findPackDef(id: string): PackDef | undefined {
  return PACKS.find((pack) => pack.id === id);
}

/**
 * The rarity odds of a pack, in percent.
 *
 * The odds of the SPEC are used for the rarities the pack holds; the shares
 * of the rarities it does not hold are renormalized over the ones it does.
 * A rarity the pack does not hold has an odds of 0.
 */
export function packRarityOdds(pack: PackDef): Record<CritterRarity, number> {
  const odds = {} as Record<CritterRarity, number>;
  const present = CRITTER_RARITIES.filter((rarity) =>
    pack.critters.some((critter) => critter.rarity === rarity),
  );

  let total = 0;
  for (const rarity of present) {
    total += CRITTER_RARITY_ODDS[rarity];
  }

  for (const rarity of CRITTER_RARITIES) {
    if (total <= 0) {
      odds[rarity] = 0;
      continue;
    }
    odds[rarity] = present.includes(rarity) ? (CRITTER_RARITY_ODDS[rarity] / total) * 100 : 0;
  }

  return odds;
}

/**
 * Opens a pack and returns the id of the critter that came out.
 *
 * The rarity is rolled with the odds of the pack, the critter is then drawn
 * from the critters of that rarity. Throws when the pack is empty.
 */
export function openPack(pack: PackDef, rng: Rng): string {
  if (pack.critters.length === 0) {
    throw new Error(`The pack "${pack.id}" is empty.`);
  }

  const odds = packRarityOdds(pack);
  const roll = rng.next() * 100;

  let cumulative = 0;
  let rarity: CritterRarity = 'common';
  for (const candidate of CRITTER_RARITIES) {
    if (odds[candidate] <= 0) {
      continue;
    }
    cumulative += odds[candidate];
    rarity = candidate;
    if (roll < cumulative) {
      break;
    }
  }

  const pool = pack.critters.filter((critter) => critter.rarity === rarity);
  const picked = pool[rng.int(0, pool.length - 1)] ?? pack.critters[0];
  /* v8 ignore next -- a pack always holds at least one critter */
  if (picked === undefined) {
    throw new Error(`The pack "${pack.id}" is empty.`);
  }
  return picked.id;
}

/** Why a pack could not be bought. */
export type PackPurchaseError =
  | 'insufficient_tokens'
  | 'pack_unavailable'
  | 'no_ticket'
  | 'empty_pack';

/** A pack that was bought. */
export interface PackPurchaseSuccess {
  ok: true;
  /** The wallet after the purchase. */
  wallet: WalletSnapshot;
  /** The critter that came out of the pack. */
  critterId: string;
  /** How many tokens were paid (0 when a pack ticket was used). */
  paidTokens: number;
  /** `true` when a pack ticket paid for the pack. */
  usedTicket: boolean;
}

/** A pack that could not be bought. */
export interface PackPurchaseFailure {
  ok: false;
  /** The reason of the failure. */
  error: PackPurchaseError;
  /** A message for the player. */
  message: string;
  /** The wallet, unchanged. */
  wallet: WalletSnapshot;
}

/** The result of buying a pack. */
export type PackPurchaseResult = PackPurchaseSuccess | PackPurchaseFailure;

/** The options of {@link buyPack}. */
export interface BuyPackOptions {
  /** Opens the pack with a pack ticket instead of tokens. */
  useTicket?: boolean;
  /** The random source of the opening. */
  rng?: Rng;
}

/**
 * The options of {@link canOpenPack}.
 */
export interface CanOpenPackOptions {
  /** The player wants to use a pack ticket (the switch of the shop). */
  useTicket?: boolean;
  /**
   * `true` (the default) to fall back on a pack ticket when the tokens are
   * not enough: the ticket opens any available pack for free.
   */
  ticketFallback?: boolean;
}

/**
 * The answer of {@link canOpenPack}: can the player open this pack right now?
 */
export type PackAffordability =
  | {
      ok: true;
      /** How much the pack costs in tokens. */
      priceTokens: number;
      /** `true` when a pack ticket opens the pack for free. */
      useTicket: boolean;
    }
  | {
      ok: false;
      /** The reason of the refusal. */
      error: PackPurchaseError;
      /** A message for the player. */
      message: string;
      /** How much the pack costs in tokens. */
      priceTokens: number;
    };

/**
 * Checks whether a pack can be opened with the wallet of the player.
 *
 * This is the check the shop does before it shows "Open another": the balance
 * and the pack tickets are read again, so a pack that cannot be paid for is
 * never started. It follows exactly the same rules as {@link buyPack}, so
 * the answer and the purchase never disagree.
 */
export function canOpenPack(
  wallet: WalletSnapshot,
  pack: PackDef,
  now: number,
  options: CanOpenPackOptions = {},
): PackAffordability {
  const priceTokens = pack.priceTokens;

  if (!isPackAvailable(pack, now)) {
    return {
      ok: false,
      error: 'pack_unavailable',
      message: 'This pack is not available right now.',
      priceTokens,
    };
  }

  if (pack.critters.length === 0) {
    return {
      ok: false,
      error: 'empty_pack',
      message: 'This pack is empty.',
      priceTokens,
    };
  }

  if (options.useTicket === true) {
    if (wallet.packTickets < 1) {
      return {
        ok: false,
        error: 'no_ticket',
        message: 'You do not have a pack ticket.',
        priceTokens,
      };
    }
    return { ok: true, priceTokens, useTicket: true };
  }

  if (wallet.balance >= priceTokens) {
    return { ok: true, priceTokens, useTicket: false };
  }

  // The tokens are not enough: a pack ticket opens the pack for free.
  if (options.ticketFallback !== false && wallet.packTickets >= 1) {
    return { ok: true, priceTokens, useTicket: true };
  }

  return {
    ok: false,
    error: 'insufficient_tokens',
    message: 'You do not have enough tokens for this pack.',
    priceTokens,
  };
}

/**
 * Buys a pack and opens it.
 *
 * The pack has to be on sale at `now` and the player has to be able to pay:
 * with tokens, or with a pack ticket (which opens any available pack for
 * free). The wallet of the result is a new one; the old one is never changed.
 */
export function buyPack(
  wallet: WalletSnapshot,
  pack: PackDef,
  now: number,
  options: BuyPackOptions = {},
): PackPurchaseResult {
  if (!isPackAvailable(pack, now)) {
    return {
      ok: false,
      error: 'pack_unavailable',
      message: 'This pack is not available right now.',
      wallet,
    };
  }

  if (pack.critters.length === 0) {
    return {
      ok: false,
      error: 'empty_pack',
      message: 'This pack is empty.',
      wallet,
    };
  }

  if (options.useTicket === true) {
    if (wallet.packTickets < 1) {
      return {
        ok: false,
        error: 'no_ticket',
        message: 'You do not have a pack ticket.',
        wallet,
      };
    }

    return {
      ok: true,
      wallet: { ...wallet, packTickets: wallet.packTickets - 1 },
      critterId: openPack(pack, options.rng ?? createRandomRng()),
      paidTokens: 0,
      usedTicket: true,
    };
  }

  if (wallet.balance < pack.priceTokens) {
    return {
      ok: false,
      error: 'insufficient_tokens',
      message: 'You do not have enough tokens for this pack.',
      wallet,
    };
  }

  return {
    ok: true,
    wallet: { ...wallet, balance: wallet.balance - pack.priceTokens },
    critterId: openPack(pack, options.rng ?? createRandomRng()),
    paidTokens: pack.priceTokens,
    usedTicket: false,
  };
}
