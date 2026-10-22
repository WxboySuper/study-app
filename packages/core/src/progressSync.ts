import type { CardState } from "./types";
import type { WalletSnapshot } from "./wallet";

/**
 * Progress sync between the phone and the web (docs/design/sync.md §3).
 *
 * Every change of the player's progress becomes an append-only event. The
 * events wait in an outbox on the device and are pushed to the Worker,
 * which relays them to the other devices of the player. This module is
 * pure: building events, keeping the outbox and folding remote events into
 * the changes a device must apply.
 *
 * Merge rules:
 * - `card_state`: last writer wins by (`lastReview`, `device_id`).
 * - `wallet_delta`: deltas add up (two devices earning both count).
 * - `kv`: last writer wins by (`at`, `device_id`), only for synced keys.
 * - `baseline`: the phone's full state at registration; a device that has
 *   no progress of its own adopts it.
 * - `review`, `spin`: history, kept for stats and the daily state.
 */

/** The kv keys that travel between devices. */
export const SYNCED_KV_KEYS: readonly string[] = ["fishing.masteryCounts.v1"];

/** The most events an outbox keeps (the oldest are dropped past it). */
export const OUTBOX_MAX = 20_000;

export type ProgressEventType =
  "card_state" | "review" | "wallet_delta" | "kv" | "spin" | "baseline";

export interface WalletDeltaPayload {
  /** Why the wallet moved (`session`, `pack`, `sell`, `spin`, `admin`...). */
  reason: string;
  balance: number;
  packTickets: number;
  /** Critter id -> change of the owned count. */
  critters: Record<string, number>;
}

export interface BaselinePayload {
  wallet: Pick<WalletSnapshot, "balance" | "packTickets">;
  collection: Record<string, number>;
  lastSpin: { localDate: string; reward: number } | null;
}

export interface ProgressPayloads {
  card_state: { state: CardState };
  review: Record<string, unknown> & { cardId: string };
  wallet_delta: WalletDeltaPayload;
  kv: { key: string; value: string };
  spin: { localDate: string; reward: number };
  baseline: BaselinePayload;
}

/** An event as it is kept in the outbox and pushed. */
export interface ProgressEvent<
  T extends ProgressEventType = ProgressEventType,
> {
  id: string;
  seq: number;
  at: number;
  type: T;
  payload: ProgressPayloads[T];
}

/** An event as it comes back from a pull. */
export interface RemoteEvent extends ProgressEvent {
  device_id: string;
  cursor: number;
}

/** Builds an event (the id is `<device>-<seq>`, unique per device). */
export function makeEvent<T extends ProgressEventType>(
  deviceId: string,
  seq: number,
  at: number,
  type: T,
  payload: ProgressPayloads[T],
): ProgressEvent<T> {
  return { id: `${deviceId}-${seq}`, seq, at, type, payload };
}

/** The change between two wallet + collection readings (`null` when none). */
export function walletDelta(
  reason: string,
  before: {
    wallet: Pick<WalletSnapshot, "balance" | "packTickets">;
    collection: ReadonlyMap<string, number>;
  },
  after: {
    wallet: Pick<WalletSnapshot, "balance" | "packTickets">;
    collection: ReadonlyMap<string, number>;
  },
): WalletDeltaPayload | null {
  const critters: Record<string, number> = {};
  const ids = new Set([
    ...before.collection.keys(),
    ...after.collection.keys(),
  ]);
  for (const id of ids) {
    const change =
      (after.collection.get(id) ?? 0) - (before.collection.get(id) ?? 0);
    if (change !== 0) critters[id] = change;
  }
  const balance = after.wallet.balance - before.wallet.balance;
  const packTickets = after.wallet.packTickets - before.wallet.packTickets;
  if (
    balance === 0 &&
    packTickets === 0 &&
    Object.keys(critters).length === 0
  ) {
    return null;
  }
  return { reason, balance, packTickets, critters };
}

function parseOutbox(raw: string | null): ProgressEvent[] {
  if (raw === null || raw === "") return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as ProgressEvent[]) : [];
  } catch {
    return [];
  }
}

/** Appends events to a serialized outbox. */
export function appendOutbox(
  raw: string | null,
  events: readonly ProgressEvent[],
  max = OUTBOX_MAX,
): string {
  const all = [...parseOutbox(raw), ...events];
  return JSON.stringify(all.length > max ? all.slice(all.length - max) : all);
}

/** The first `count` events of an outbox. */
export function peekOutbox(raw: string | null, count: number): ProgressEvent[] {
  return parseOutbox(raw).slice(0, count);
}

/** The size of an outbox. */
export function outboxSize(raw: string | null): number {
  return parseOutbox(raw).length;
}

/** Removes the events the server answered for (accepted or rejected). */
export function dropFromOutbox(
  raw: string | null,
  ids: ReadonlySet<string>,
): string {
  return JSON.stringify(parseOutbox(raw).filter((event) => !ids.has(event.id)));
}

/** `true` when `a` beats `b` for the same card. */
function newerCardState(
  a: { state: CardState; device: string },
  b: { state: CardState; device: string },
): boolean {
  const ar = a.state.lastReview ?? -1;
  const br = b.state.lastReview ?? -1;
  if (ar !== br) return ar > br;
  return a.device > b.device;
}

/** What a device must apply after a pull. */
export interface RemoteChanges {
  /** The winning remote state per card (only when it beats the local one). */
  cardStates: CardState[];
  /** The sum of the remote wallet deltas. */
  wallet: {
    balance: number;
    packTickets: number;
    critters: Record<string, number>;
  };
  /** The winning remote value per synced key. */
  kv: Record<string, string>;
  /** The newest remote spin. */
  lastSpin: { localDate: string; reward: number } | null;
  /** The newest baseline in the batch (`null` when none). */
  baseline: BaselinePayload | null;
  /** How many reviews came in (history). */
  reviews: number;
}

/**
 * Folds pulled events into the changes to apply.
 *
 * `local` is the device's own card states; a remote state that is not newer
 * is ignored, so applying a pull twice changes nothing.
 */
export function foldRemoteEvents(
  events: readonly RemoteEvent[],
  local: ReadonlyMap<string, CardState>,
  localDeviceId: string,
): RemoteChanges {
  const cards = new Map<string, { state: CardState; device: string }>();
  const kv = new Map<string, { value: string; at: number; device: string }>();
  const wallet = {
    balance: 0,
    packTickets: 0,
    critters: {} as Record<string, number>,
  };
  let lastSpin: RemoteChanges["lastSpin"] = null;
  let baseline: { payload: BaselinePayload; at: number } | null = null;
  let reviews = 0;

  for (const event of events) {
    if (event.device_id === localDeviceId) continue;
    switch (event.type) {
      case "card_state": {
        const { state } = event.payload as ProgressPayloads["card_state"];
        if (state === undefined || typeof state.cardId !== "string") break;
        const candidate = { state, device: event.device_id };
        const current = cards.get(state.cardId);
        if (current === undefined || newerCardState(candidate, current))
          cards.set(state.cardId, candidate);
        break;
      }
      case "wallet_delta": {
        const delta = event.payload as WalletDeltaPayload;
        wallet.balance += Number(delta.balance) || 0;
        wallet.packTickets += Number(delta.packTickets) || 0;
        for (const [id, n] of Object.entries(delta.critters ?? {})) {
          wallet.critters[id] = (wallet.critters[id] ?? 0) + (Number(n) || 0);
        }
        break;
      }
      case "kv": {
        const { key, value } = event.payload as ProgressPayloads["kv"];
        if (!SYNCED_KV_KEYS.includes(key) || typeof value !== "string") break;
        const current = kv.get(key);
        if (
          current === undefined ||
          event.at > current.at ||
          (event.at === current.at && event.device_id > current.device)
        ) {
          kv.set(key, { value, at: event.at, device: event.device_id });
        }
        break;
      }
      case "spin": {
        const spin = event.payload as ProgressPayloads["spin"];
        if (lastSpin === null || spin.localDate > lastSpin.localDate)
          lastSpin = spin;
        break;
      }
      case "baseline": {
        if (baseline === null || event.at >= baseline.at) {
          baseline = {
            payload: event.payload as BaselinePayload,
            at: event.at,
          };
        }
        break;
      }
      case "review":
        reviews += 1;
        break;
      default:
        break;
    }
  }

  const cardStates: CardState[] = [];
  for (const [cardId, { state, device }] of cards) {
    const mine = local.get(cardId);
    if (
      mine === undefined ||
      newerCardState({ state, device }, { state: mine, device: localDeviceId })
    ) {
      cardStates.push(state);
    }
  }
  wallet.critters = Object.fromEntries(
    Object.entries(wallet.critters).filter(([, n]) => n !== 0),
  );

  return {
    cardStates,
    wallet,
    kv: Object.fromEntries([...kv].map(([key, { value }]) => [key, value])),
    lastSpin,
    baseline: baseline?.payload ?? null,
    reviews,
  };
}

/** The wallet and collection after applying pulled changes. */
export function applyWalletChanges(
  current: {
    wallet: Pick<WalletSnapshot, "balance" | "packTickets">;
    collection: ReadonlyMap<string, number>;
  },
  changes: Pick<RemoteChanges, "wallet" | "baseline">,
  adoptBaseline: boolean,
): {
  balance: number;
  packTickets: number;
  collection: Map<string, number>;
} {
  const base =
    adoptBaseline && changes.baseline !== null
      ? {
          balance: Number(changes.baseline.wallet?.balance) || 0,
          packTickets: Number(changes.baseline.wallet?.packTickets) || 0,
          collection: new Map(
            Object.entries(changes.baseline.collection ?? {}).map(
              ([id, n]) => [id, Number(n) || 0] as const,
            ),
          ),
        }
      : {
          balance: current.wallet.balance,
          packTickets: current.wallet.packTickets,
          collection: new Map(current.collection),
        };
  const collection = base.collection;
  for (const [id, n] of Object.entries(changes.wallet.critters)) {
    collection.set(id, (collection.get(id) ?? 0) + n);
  }
  for (const [id, n] of [...collection]) {
    if (n <= 0) collection.delete(id);
  }
  return {
    balance: Math.max(0, base.balance + changes.wallet.balance),
    packTickets: Math.max(0, base.packTickets + changes.wallet.packTickets),
    collection,
  };
}

/** Merges parked card states with new ones (newest `lastReview` wins). */
export function mergeCardStates(
  a: readonly CardState[],
  b: readonly CardState[],
): CardState[] {
  const out = new Map<string, CardState>();
  for (const state of [...a, ...b]) {
    const current = out.get(state.cardId);
    if (
      current === undefined ||
      (state.lastReview ?? -1) >= (current.lastReview ?? -1)
    ) {
      out.set(state.cardId, state);
    }
  }
  return [...out.values()];
}
