import type * as SQLite from 'expo-sqlite';

import {
  applySpinReward,
  buyPack,
  createRandomRng,
  findPackDef,
  localDayKey,
  sellAllDuplicates,
  sellDuplicate,
  spinDailyWheel,
  type PackPurchaseError,
  type Rng,
  type WalletSnapshot,
} from '@study-app/core';

import { addCritter, readCollection, readWallet, writeWallet } from './wallet';

/**
 * The local (offline first) shop, the collection selling and the daily wheel.
 *
 * The pure rules live in `@study-app/core` (`buyPack`, `sellDuplicate`,
 * `sellAllDuplicates` and `spinDailyWheel`); this file only reads and writes
 * SQLite. Every action happens in one transaction, so a crash never leaves a
 * half bought pack or a half sold collection behind.
 */

const PACKS_SCHEMA = `
CREATE TABLE IF NOT EXISTS daily_spins (
  local_date TEXT PRIMARY KEY NOT NULL,
  reward     INTEGER NOT NULL,
  spun_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pack_opens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id     TEXT NOT NULL,
  critter_id  TEXT NOT NULL,
  duplicate   INTEGER NOT NULL DEFAULT 0,
  used_ticket INTEGER NOT NULL DEFAULT 0,
  paid_tokens INTEGER NOT NULL DEFAULT 0,
  opened_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS pack_opens_opened_at ON pack_opens (opened_at);
`;

/** Makes sure the tables of the shop and of the wheel exist. */
export async function ensurePacksSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(PACKS_SCHEMA);
}

/** A spin of the daily wheel. */
export interface DailySpin {
  /** The local day of the spin (`YYYY-MM-DD`). */
  localDate: string;
  /** The tokens the wheel paid. */
  reward: number;
}

/** The last spin of the wheel, or `null` when it was never spun. */
export async function readLastSpin(db: SQLite.SQLiteDatabase): Promise<DailySpin | null> {
  await ensurePacksSchema(db);
  const row = await db.getFirstAsync<{ local_date: string; reward: number }>(
    'SELECT local_date, reward FROM daily_spins ORDER BY local_date DESC LIMIT 1',
  );
  if (row === null) {
    return null;
  }
  return { localDate: row.local_date, reward: row.reward };
}

/** Why a pack could not be opened. */
export type OpenPackError = 'unknown_pack' | PackPurchaseError;

/** A pack that was bought and opened. */
export interface OpenPackSuccess {
  ok: true;
  /** The wallet after the purchase. */
  wallet: WalletSnapshot;
  /** The critter that came out of the pack. */
  critterId: string;
  /** `true` when the player already owned the critter. */
  duplicate: boolean;
  /** How many tokens were paid (0 when a pack ticket was used). */
  paidTokens: number;
  /** `true` when a pack ticket paid for the pack. */
  usedTicket: boolean;
}

/** A pack that could not be bought. */
export interface OpenPackFailure {
  ok: false;
  /** The reason of the failure. */
  error: OpenPackError;
  /** A message for the player. */
  message: string;
}

/** The result of buying and opening a pack. */
export type OpenPackResult = OpenPackSuccess | OpenPackFailure;

/** The options of {@link buyAndOpenPack}. */
export interface OpenPackOptions {
  /** Opens the pack with a pack ticket instead of tokens. */
  useTicket?: boolean;
  /** The random source of the opening. */
  rng?: Rng;
  /** The time of the purchase (epoch milliseconds). */
  now?: number;
}

/**
 * Buys a pack and opens it in one transaction.
 *
 * The tokens (or the pack ticket) are taken, the critter is added to the
 * collection and the opening is logged, all at once.
 */
export async function buyAndOpenPack(
  db: SQLite.SQLiteDatabase,
  packId: string,
  options: OpenPackOptions = {},
): Promise<OpenPackResult> {
  const now = options.now ?? Date.now();
  const pack = findPackDef(packId);
  if (pack === undefined) {
    return { ok: false, error: 'unknown_pack', message: 'This pack does not exist.' };
  }

  await ensurePacksSchema(db);
  let result: OpenPackResult = {
    ok: false,
    error: 'unknown_pack',
    message: 'The pack could not be opened.',
  };

  await db.withExclusiveTransactionAsync(async (tx) => {
    const wallet = await readWallet(tx, localDayKey(new Date(now)));
    const collection = await readCollection(tx);

    const purchase = buyPack(wallet, pack, now, {
      useTicket: options.useTicket,
      rng: options.rng,
    });

    if (!purchase.ok) {
      result = { ok: false, error: purchase.error, message: purchase.message };
      return;
    }

    const duplicate = (collection.get(purchase.critterId) ?? 0) > 0;

    await writeWallet(tx, purchase.wallet);
    await addCritter(tx, purchase.critterId, now);
    await tx.runAsync(
      `INSERT INTO pack_opens (pack_id, critter_id, duplicate, used_ticket, paid_tokens, opened_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      pack.id,
      purchase.critterId,
      duplicate ? 1 : 0,
      purchase.usedTicket ? 1 : 0,
      purchase.paidTokens,
      now,
    );

    result = {
      ok: true,
      wallet: purchase.wallet,
      critterId: purchase.critterId,
      duplicate,
      paidTokens: purchase.paidTokens,
      usedTicket: purchase.usedTicket,
    };
  });

  return result;
}

/** The result of selling duplicates. */
export type SellDuplicatesResult =
  | {
      ok: true;
      /** The wallet after the sale. */
      wallet: WalletSnapshot;
      /** The tokens that were gained. */
      tokens: number;
      /** How many copies were sold. */
      sold: number;
    }
  | {
      ok: false;
      /** The reason of the failure. */
      error: 'unknown_critter' | 'nothing_to_sell';
      /** A message for the player. */
      message: string;
      /** The wallet, unchanged. */
      wallet: WalletSnapshot;
    };

/**
 * Sells duplicates of a critter in one transaction.
 *
 * The last copy of a critter is never sold.
 */
export async function sellDuplicates(
  db: SQLite.SQLiteDatabase,
  critterId: string,
  qty: number,
  now: number = Date.now(),
): Promise<SellDuplicatesResult> {
  await ensurePacksSchema(db);
  let result: SellDuplicatesResult = {
    ok: false,
    error: 'nothing_to_sell',
    message: 'There is nothing to sell.',
    wallet: { balance: 0, day: '', tokensToday: 0, packTicketsToday: 0, packTickets: 0 },
  };

  await db.withExclusiveTransactionAsync(async (tx) => {
    const today = localDayKey(new Date(now));
    const wallet = await readWallet(tx, today);
    const collection = await readCollection(tx);

    const sale = sellDuplicate(collection, critterId, qty);
    if (sale.sold <= 0) {
      result = {
        ok: false,
        error: collection.has(critterId) ? 'nothing_to_sell' : 'unknown_critter',
        message: collection.has(critterId)
          ? 'You only have one copy, and the last copy is never sold.'
          : 'You do not own this critter.',
        wallet,
      };
      return;
    }

    const next: WalletSnapshot = { ...wallet, balance: wallet.balance + sale.tokens };
    await tx.runAsync(
      'UPDATE collection SET count = ? WHERE critter_id = ?',
      sale.collection.get(critterId) ?? 0,
      critterId,
    );
    await writeWallet(tx, next);

    result = { ok: true, wallet: next, tokens: sale.tokens, sold: sale.sold };
  });

  return result;
}

/** The result of selling every duplicate. */
export type SellAllDuplicatesResult =
  | {
      ok: true;
      /** The wallet after the sale. */
      wallet: WalletSnapshot;
      /** The tokens that were gained. */
      tokens: number;
      /** How many copies were sold. */
      sold: number;
    }
  | {
      ok: false;
      /** The reason of the failure. */
      error: 'nothing_to_sell';
      /** A message for the player. */
      message: string;
      /** The wallet, unchanged. */
      wallet: WalletSnapshot;
    };

/** Sells every duplicate of the collection in one transaction. */
export async function sellAllDuplicatesLocal(
  db: SQLite.SQLiteDatabase,
  now: number = Date.now(),
): Promise<SellAllDuplicatesResult> {
  await ensurePacksSchema(db);
  let result: SellAllDuplicatesResult = {
    ok: false,
    error: 'nothing_to_sell',
    message: 'You do not have any duplicate yet.',
    wallet: { balance: 0, day: '', tokensToday: 0, packTicketsToday: 0, packTickets: 0 },
  };

  await db.withExclusiveTransactionAsync(async (tx) => {
    const today = localDayKey(new Date(now));
    const wallet = await readWallet(tx, today);
    const collection = await readCollection(tx);

    const sale = sellAllDuplicates(collection);
    if (sale.tokens <= 0) {
      result = {
        ok: false,
        error: 'nothing_to_sell',
        message: 'You do not have any duplicate yet.',
        wallet,
      };
      return;
    }

    const next: WalletSnapshot = { ...wallet, balance: wallet.balance + sale.tokens };
    for (const [critterId, count] of sale.collection) {
      await tx.runAsync('UPDATE collection SET count = ? WHERE critter_id = ?', count, critterId);
    }
    await writeWallet(tx, next);

    const sold = [...sale.sold.values()].reduce((sum, count) => sum + count, 0);
    result = { ok: true, wallet: next, tokens: sale.tokens, sold };
  });

  return result;
}

/** The result of a spin of the daily wheel. */
export type SpinResult =
  | {
      ok: true;
      /** The tokens the wheel paid. */
      reward: number;
      /** The wallet after the spin. */
      wallet: WalletSnapshot;
    }
  | {
      ok: false;
      /** The reason of the failure. */
      error: 'already_spun';
      /** A message for the player. */
      message: string;
      /** The wallet, unchanged. */
      wallet: WalletSnapshot;
    };

/** The options of {@link spinDailyWheelLocal}. */
export interface SpinOptions {
  /** The random source of the wheel. */
  rng?: Rng;
  /** The time of the spin (epoch milliseconds). */
  now?: number;
}

/**
 * Spins the daily wheel in one transaction.
 *
 * The wheel can be spun once per local day: the reward is written to
 * `daily_spins` and the tokens are credited to the wallet. The tokens of the
 * wheel do not count toward the daily earning cap of the study sessions.
 */
export async function spinDailyWheelLocal(
  db: SQLite.SQLiteDatabase,
  today: string,
  options: SpinOptions = {},
): Promise<SpinResult> {
  const now = options.now ?? Date.now();
  await ensurePacksSchema(db);

  let result: SpinResult = {
    ok: false,
    error: 'already_spun',
    message: 'You already spun the wheel today.',
    wallet: { balance: 0, day: today, tokensToday: 0, packTicketsToday: 0, packTickets: 0 },
  };

  await db.withExclusiveTransactionAsync(async (tx) => {
    const wallet = await readWallet(tx, today);

    const done = await tx.getFirstAsync<{ local_date: string }>(
      'SELECT local_date FROM daily_spins WHERE local_date = ?',
      today,
    );
    if (done !== null) {
      result = {
        ok: false,
        error: 'already_spun',
        message: 'You already spun the wheel today.',
        wallet,
      };
      return;
    }

    const reward = spinDailyWheel(options.rng ?? createRandomRng());
    await tx.runAsync(
      'INSERT INTO daily_spins (local_date, reward, spun_at) VALUES (?, ?, ?)',
      today,
      reward,
      now,
    );

    // The wheel is a bonus: its tokens do not count toward the daily cap.
    const next = applySpinReward(wallet, reward);
    await writeWallet(tx, next);

    result = { ok: true, reward, wallet: next };
  });

  return result;
}
