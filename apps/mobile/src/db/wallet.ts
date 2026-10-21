import type * as SQLite from 'expo-sqlite';

import {
  NOOP_WALLET_SYNC,
  emptyWallet,
  rollWalletDay,
  settleSession,
  type SessionOutcome,
  type Settlement,
  type WalletSnapshot,
  type WalletSync,
} from '@study-app/core';

/**
 * The local (offline first) wallet and critter collection.
 *
 * The pure rules live in `@study-app/core` (`settleSession`); this file only
 * reads and writes SQLite. Settling is idempotent per session id, so a double
 * tap on "End" (or a re-render) can never pay twice.
 */

const WALLET_SCHEMA = `
CREATE TABLE IF NOT EXISTS wallet (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  balance            INTEGER NOT NULL DEFAULT 0,
  day                TEXT NOT NULL,
  tokens_today       INTEGER NOT NULL DEFAULT 0,
  pack_tickets_today INTEGER NOT NULL DEFAULT 0,
  pack_tickets       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collection (
  critter_id      TEXT PRIMARY KEY NOT NULL,
  count           INTEGER NOT NULL DEFAULT 0,
  first_caught_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settled_sessions (
  session_id   TEXT PRIMARY KEY NOT NULL,
  mode         TEXT NOT NULL,
  tokens       INTEGER NOT NULL,
  pack_tickets INTEGER NOT NULL,
  settled_at   INTEGER NOT NULL,
  synced       INTEGER NOT NULL DEFAULT 0
);
`;

/** Makes sure the wallet tables exist. */
export async function ensureWalletSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(WALLET_SCHEMA);
}

/** Reads the wallet (with the daily counters rolled over to `today`). */
export async function readWallet(db: SQLite.SQLiteDatabase, today: string): Promise<WalletSnapshot> {
  await ensureWalletSchema(db);
  const row = await db.getFirstAsync<WalletRow>(
    'SELECT balance, day, tokens_today, pack_tickets_today, pack_tickets FROM wallet WHERE id = 1',
  );
  if (row === null) {
    return emptyWallet(today);
  }
  return rollWalletDay(
    {
      balance: row.balance,
      day: row.day,
      tokensToday: row.tokens_today,
      packTicketsToday: row.pack_tickets_today,
      packTickets: row.pack_tickets,
    },
    today,
  );
}

/** Reads how many of each critter the player owns. */
export async function readCollection(db: SQLite.SQLiteDatabase): Promise<Map<string, number>> {
  await ensureWalletSchema(db);
  const rows = await db.getAllAsync<{ critter_id: string; count: number }>(
    'SELECT critter_id, count FROM collection',
  );
  return new Map(rows.map((row) => [row.critter_id, row.count]));
}

/**
 * Settles a finished session: credits the tokens, the capped pack tickets and
 * the caught critters in one transaction. Returns `null` when the session was
 * already settled.
 */
export async function settleLocalSession(
  db: SQLite.SQLiteDatabase,
  sessionId: string,
  mode: string,
  outcome: SessionOutcome,
  today: string,
  now: number = Date.now(),
  sync: WalletSync = NOOP_WALLET_SYNC,
): Promise<Settlement | null> {
  await ensureWalletSchema(db);
  let settlement: Settlement | null = null;

  await db.withExclusiveTransactionAsync(async (tx) => {
    const done = await tx.getFirstAsync<{ session_id: string }>(
      'SELECT session_id FROM settled_sessions WHERE session_id = ?',
      sessionId,
    );
    if (done !== null) {
      return;
    }

    const wallet = await readWallet(tx, today);
    const owned = await readCollection(tx);
    const result = settleSession(wallet, outcome, owned, today);

    await tx.runAsync(
      `INSERT INTO wallet (id, balance, day, tokens_today, pack_tickets_today, pack_tickets)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         balance = excluded.balance,
         day = excluded.day,
         tokens_today = excluded.tokens_today,
         pack_tickets_today = excluded.pack_tickets_today,
         pack_tickets = excluded.pack_tickets`,
      result.wallet.balance,
      result.wallet.day,
      result.wallet.tokensToday,
      result.wallet.packTicketsToday,
      result.wallet.packTickets,
    );

    for (const critter of result.critters) {
      await tx.runAsync(
        `INSERT INTO collection (critter_id, count, first_caught_at)
         VALUES (?, 1, ?)
         ON CONFLICT(critter_id) DO UPDATE SET count = count + 1`,
        critter.critterId,
        now,
      );
    }

    await tx.runAsync(
      'INSERT INTO settled_sessions (session_id, mode, tokens, pack_tickets, settled_at) VALUES (?, ?, ?, ?, ?)',
      sessionId,
      mode,
      result.payout.tokens,
      result.packTicketsAwarded,
      now,
    );

    settlement = result;
  });

  if (settlement !== null) {
    try {
      await sync.pushSettlement(sessionId, settlement);
    } catch {
      // Offline first: the row stays `synced = 0` and is retried later.
    }
  }

  return settlement;
}

interface WalletRow {
  balance: number;
  day: string;
  tokens_today: number;
  pack_tickets_today: number;
  pack_tickets: number;
}
