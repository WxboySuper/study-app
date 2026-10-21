import { State } from 'ts-fsrs';

import { computePayout, type Payout, type PayoutRules } from './payout';
import type { CardState, ReviewLogRecord } from './types';

/**
 * The local wallet and collection logic (offline first).
 *
 * Everything here is pure: the app reads a snapshot from its store, asks
 * `settleSession` what changes and writes the result back in one transaction.
 * The server can later re-run the exact same code to validate a sync.
 */

/** Pack tickets are capped at one per session and one per day. */
export const MAX_PACK_TICKETS_PER_SESSION = 1;
export const MAX_PACK_TICKETS_PER_DAY = 1;

/** The minimal review shape the progress counter needs. */
export interface SessionReviewLike {
  cardId: string;
  /** The scheduling state after the review. */
  state: Pick<CardState, 'state'>;
  /** The review log; `log.state` is the state *before* the review. */
  log: Pick<ReviewLogRecord, 'state'>;
}

/** How much real FSRS progress a session made. */
export interface StudyProgress {
  /** New / learning cards that reached the Review state during the session. */
  graduated: number;
  /** Cards that were due for review and are still in Review after the session. */
  dueCleared: number;
}

/**
 * Counts the graduated and the cleared due cards of a session.
 *
 * - graduated: a card whose state went from New/Learning to Review.
 * - due cleared: a card that entered the session in Review (it was due) and
 *   ends the session still in Review (it was not forgotten).
 *
 * Each card counts at most once.
 */
export function countStudyProgress(reviews: readonly SessionReviewLike[]): StudyProgress {
  const graduated = new Set<string>();
  const firstState = new Map<string, State>();
  const lastState = new Map<string, State>();

  for (const review of reviews) {
    if (!firstState.has(review.cardId)) {
      firstState.set(review.cardId, review.log.state);
    }
    lastState.set(review.cardId, review.state.state);
    const before = review.log.state;
    if ((before === State.New || before === State.Learning) && review.state.state === State.Review) {
      graduated.add(review.cardId);
    }
  }

  let dueCleared = 0;
  for (const [cardId, before] of firstState) {
    if (before === State.Review && lastState.get(cardId) === State.Review) {
      dueCleared += 1;
    }
  }

  return { graduated: graduated.size, dueCleared };
}

/** The persisted wallet, as the store hands it over. */
export interface WalletSnapshot {
  /** Spendable tokens. */
  balance: number;
  /** The local day (`YYYY-MM-DD`) the daily counters belong to. */
  day: string;
  /** Tokens earned on `day`. */
  tokensToday: number;
  /** Pack tickets earned on `day`. */
  packTicketsToday: number;
  /** Unused pack tickets. */
  packTickets: number;
}

/** Creates an empty wallet for the given day. */
export function emptyWallet(day: string): WalletSnapshot {
  return { balance: 0, day, tokensToday: 0, packTicketsToday: 0, packTickets: 0 };
}

/** Resets the daily counters when the day changed. */
export function rollWalletDay(wallet: WalletSnapshot, today: string): WalletSnapshot {
  if (wallet.day === today) {
    return wallet;
  }
  return { ...wallet, day: today, tokensToday: 0, packTicketsToday: 0 };
}

/** What a finished session reports. */
export interface SessionOutcome {
  correct: number;
  modeScore?: number;
  reviews: readonly SessionReviewLike[];
  /** The critter ids that were caught, in order (duplicates allowed). */
  critterIds: readonly string[];
  /** The pack tickets the game produced (before the caps). */
  packTickets: number;
}

/** One caught critter after settlement. */
export interface SettledCritter {
  critterId: string;
  /** `true` when the player already owned at least one before this catch. */
  duplicate: boolean;
}

/** The result of settling a session. */
export interface Settlement {
  progress: StudyProgress;
  payout: Payout;
  packTicketsAwarded: number;
  critters: SettledCritter[];
  /** The wallet after the session. */
  wallet: WalletSnapshot;
}

/**
 * Settles a finished session against the wallet: the real payout formula
 * (with the soft daily cap), the capped pack tickets and the critters with
 * their duplicate flags.
 */
export function settleSession(
  wallet: WalletSnapshot,
  outcome: SessionOutcome,
  owned: ReadonlyMap<string, number>,
  today: string,
  rules: Partial<PayoutRules> = {},
): Settlement {
  const current = rollWalletDay(wallet, today);
  const progress = countStudyProgress(outcome.reviews);
  const payout = computePayout(
    {
      correct: outcome.correct,
      graduated: progress.graduated,
      dueCleared: progress.dueCleared,
      modeScore: outcome.modeScore ?? 0,
      tokensToday: current.tokensToday,
    },
    rules,
  );

  const ticketsLeftToday = Math.max(0, MAX_PACK_TICKETS_PER_DAY - current.packTicketsToday);
  const packTicketsAwarded = Math.min(
    Math.max(0, Math.floor(outcome.packTickets)),
    MAX_PACK_TICKETS_PER_SESSION,
    ticketsLeftToday,
  );

  const counts = new Map(owned);
  const critters = outcome.critterIds.map((critterId) => {
    const before = counts.get(critterId) ?? 0;
    counts.set(critterId, before + 1);
    return { critterId, duplicate: before > 0 };
  });

  return {
    progress,
    payout,
    packTicketsAwarded,
    critters,
    wallet: {
      ...current,
      balance: current.balance + payout.tokens,
      tokensToday: current.tokensToday + payout.tokens,
      packTicketsToday: current.packTicketsToday + packTicketsAwarded,
      packTickets: current.packTickets + packTicketsAwarded,
    },
  };
}

/** Formats a local day key (`YYYY-MM-DD`) from a Date in its local zone. */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The seam for a future server sync (D1). The local store is the source of
 * truth for now; a real implementation pushes settled sessions and pulls the
 * authoritative wallet.
 */
export interface WalletSync {
  pushSettlement(sessionId: string, settlement: Settlement): Promise<void>;
}

/** The sync used until the API is wired: does nothing. */
export const NOOP_WALLET_SYNC: WalletSync = {
  pushSettlement: () => Promise.resolve(),
};
