import {
  appendOutbox,
  makeEvent,
  SYNCED_KV_KEYS,
  walletDelta,
  type ProgressEvent,
  type ProgressEventType,
  type ProgressPayloads,
} from "@study-app/core";

import type { LocalStore } from "@/db/types";
import { recordHistory } from "@/study/reviewHistory";

/**
 * The outbox of the progress sync (docs/design/sync.md §3-§4).
 *
 * {@link withOutbox} wraps a {@link LocalStore}: every write that changes
 * the player's progress also appends an event to the outbox (kept in the
 * kv store). Nothing is recorded until the device has a sync identity, so
 * a player who never syncs pays nothing. The drain lives in
 * `progressSync.ts`.
 */

export const OUTBOX_KEY = "sync:outbox";
export const SEQ_KEY = "sync:seq";
export const IDENTITY_KEY = "sync:identity";

/** Who this device is for the sync server. */
export interface SyncIdentity {
  playerId: string;
  deviceId: string;
  /** Never logged, never shown. */
  deviceToken: string;
  kind: "phone" | "web";
}

export function parseIdentity(raw: string | null): SyncIdentity | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<SyncIdentity>;
    return typeof value.playerId === "string" &&
      typeof value.deviceId === "string" &&
      typeof value.deviceToken === "string" &&
      (value.kind === "phone" || value.kind === "web")
      ? (value as SyncIdentity)
      : null;
  } catch {
    return null;
  }
}

/** Serializes the read-modify-write of the outbox. */
let chain: Promise<unknown> = Promise.resolve();
export function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

/** Listeners told when something was recorded (the drain schedules itself). */
const listeners = new Set<(type: ProgressEventType) => void>();
export function onRecorded(
  listener: (type: ProgressEventType) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Appends events built by `build` (which receives the next sequence
 * numbers). Silent: a sync problem never breaks a local write.
 */
export async function record(
  store: LocalStore,
  items: readonly {
    type: ProgressEventType;
    payload: ProgressPayloads[ProgressEventType];
  }[],
  at = Date.now(),
): Promise<void> {
  if (items.length === 0) return;
  try {
    await serialized(async () => {
      const identity = parseIdentity(await store.readKv(IDENTITY_KEY));
      if (identity === null) return;
      const seq =
        Number.parseInt((await store.readKv(SEQ_KEY)) ?? "0", 10) || 0;
      const events: ProgressEvent[] = items.map((item, index) =>
        makeEvent(
          identity.deviceId,
          seq + index + 1,
          at,
          item.type,
          item.payload,
        ),
      );
      await store.writeKv(SEQ_KEY, String(seq + items.length));
      await store.writeKv(
        OUTBOX_KEY,
        appendOutbox(await store.readKv(OUTBOX_KEY), events),
      );
    });
    for (const item of items)
      for (const listener of listeners) listener(item.type);
  } catch {
    // the local write already happened; the next baseline repairs the gap
  }
}

async function readMoney(store: LocalStore) {
  const today = new Date().toISOString().slice(0, 10);
  const [wallet, collection] = await Promise.all([
    store.readWallet(today),
    store.readCollection(),
  ]);
  return { wallet, collection };
}

/** Runs a write and records the wallet/collection change it made. */
async function trackMoney<T>(
  store: LocalStore,
  reason: string,
  write: () => Promise<T>,
): Promise<T> {
  let before: Awaited<ReturnType<typeof readMoney>> | null = null;
  try {
    before = await readMoney(store);
  } catch {
    before = null;
  }
  const result = await write();
  if (before !== null) {
    try {
      const delta = walletDelta(reason, before, await readMoney(store));
      if (delta !== null)
        await record(store, [{ type: "wallet_delta", payload: delta }]);
    } catch {
      // ignore
    }
  }
  return result;
}

/** Wraps a store so its progress writes feed the outbox. */
export function withOutbox(inner: LocalStore): LocalStore {
  return {
    ...inner,
    upsertCardState: async (state) => {
      await inner.upsertCardState(state);
      await record(inner, [{ type: "card_state", payload: { state } }]);
    },
    enqueueReview: async (review) => {
      await inner.enqueueReview(review);
      await recordHistory(inner, [
        { at: review.review, rating: review.rating },
      ]);
      await record(inner, [{ type: "review", payload: { ...review } }]);
    },
    writeKv: async (key, value) => {
      await inner.writeKv(key, value);
      if (SYNCED_KV_KEYS.includes(key))
        await record(inner, [{ type: "kv", payload: { key, value } }]);
    },
    settleSession: (...args) =>
      trackMoney(inner, "session", () => inner.settleSession(...args)),
    buyAndOpenPack: (...args) =>
      trackMoney(inner, "pack", () => inner.buyAndOpenPack(...args)),
    sellDuplicates: (...args) =>
      trackMoney(inner, "sell", () => inner.sellDuplicates(...args)),
    sellAllDuplicates: (...args) =>
      trackMoney(inner, "sell", () => inner.sellAllDuplicates(...args)),
    spinDailyWheel: async (today, options) => {
      const result = await trackMoney(inner, "spin", () =>
        inner.spinDailyWheel(today, options),
      );
      if (result.ok)
        await record(inner, [
          {
            type: "spin",
            payload: { localDate: today, reward: result.reward },
          },
        ]);
      return result;
    },
    clearCollection: () =>
      trackMoney(inner, "admin", () => inner.clearCollection()),
    resetTokens: () => trackMoney(inner, "admin", () => inner.resetTokens()),
    addTokens: (amount) =>
      trackMoney(inner, "admin", () => inner.addTokens(amount)),
  };
}
