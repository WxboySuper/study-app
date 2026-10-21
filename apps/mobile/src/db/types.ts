import type {
  CardState,
  PackPurchaseError,
  ReviewLogRecord,
  Rng,
  Settlement,
  SessionOutcome,
  StudyCard,
  WalletSnapshot,
  WalletSync,
} from '@study-app/core';

/**
 * The shapes of the local store.
 *
 * The store is the seam between the app and the place the data lives: SQLite
 * on the phone (`src/db/local.ts`), an in-memory mock with demo data on the
 * web (`src/db/local.web.ts`). Both implement the same {@link LocalStore},
 * so every screen of the app works the same on every platform.
 */

/** A review that is waiting to be synced to the server. */
export interface PendingReview extends ReviewLogRecord {
  /** Client generated id, makes the sync idempotent. */
  clientId: string;
  cardId: string;
  sessionId: string | null;
  durationMs: number | null;
  createdAt: number;
}

/** A set of the local store. */
export interface LocalSet {
  id: string;
  topicId: string | null;
  title: string;
}

/** A topic of the local store. */
export interface LocalTopic {
  id: string;
  name: string;
  color: string | null;
}

/** A spin of the daily wheel. */
export interface DailySpin {
  /** The local day of the spin (`YYYY-MM-DD`). */
  localDate: string;
  /** The tokens the wheel paid. */
  reward: number;
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

/** The options of a pack opening. */
export interface OpenPackOptions {
  /** Opens the pack with a pack ticket instead of tokens. */
  useTicket?: boolean;
  /** The random source of the opening. */
  rng?: Rng;
  /** The time of the purchase (epoch milliseconds). */
  now?: number;
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

/**
 * The local store of the app.
 *
 * Everything the app knows about the player lives here: the study cards and
 * their scheduling state, the wallet, the critter collection, the packs and
 * the daily wheel.
 */
export interface LocalStore {
  // --- the study cards ---
  /** Reads every locally known card. */
  listCards(): Promise<StudyCard[]>;
  /** Reads the scheduling state of every local card. */
  listCardStates(): Promise<Map<string, CardState>>;
  /** Reads every locally known set, sorted by title. */
  listSets(): Promise<LocalSet[]>;
  /** Reads every locally known topic, sorted by name. */
  listTopics(): Promise<LocalTopic[]>;
  /** Inserts or updates the scheduling state of a card. */
  upsertCardState(state: CardState): Promise<void>;
  /** Queues a review for the next sync. */
  enqueueReview(review: PendingReview): Promise<void>;

  // --- the wallet and the collection ---
  /** Reads the wallet (with the daily counters rolled over to `today`). */
  readWallet(today: string): Promise<WalletSnapshot>;
  /** Reads how many of each critter the player owns. */
  readCollection(): Promise<Map<string, number>>;
  /** Settles a finished session and credits the wallet and the collection. */
  settleSession(
    sessionId: string,
    mode: string,
    outcome: SessionOutcome,
    today: string,
    now?: number,
    sync?: WalletSync,
  ): Promise<Settlement | null>;

  // --- the packs and the daily wheel ---
  /** The last spin of the wheel, or `null` when it was never spun. */
  readLastSpin(): Promise<DailySpin | null>;
  /** Buys a pack and opens it. */
  buyAndOpenPack(packId: string, options?: OpenPackOptions): Promise<OpenPackResult>;
  /** Sells duplicates of one critter. */
  sellDuplicates(critterId: string, qty: number, now?: number): Promise<SellDuplicatesResult>;
  /** Sells every duplicate of the collection. */
  sellAllDuplicates(now?: number): Promise<SellAllDuplicatesResult>;
  /** Spins the daily wheel (once per local day). */
  spinDailyWheel(today: string, options?: { rng?: Rng; now?: number }): Promise<SpinResult>;
}
