import {
  dropFromOutbox,
  outboxSize,
  peekOutbox,
  SYNCED_KV_KEYS,
  type ProgressEventType,
  type ProgressPayloads,
} from "@study-app/core";
import { AppState, Platform } from "react-native";

import { API_BASE_URL } from "@/config";
import { openLocalStore } from "@/db/local";
import type { LocalStore } from "@/db/types";

import {
  IDENTITY_KEY,
  OUTBOX_KEY,
  onRecorded,
  parseIdentity,
  record,
  serialized,
  type SyncIdentity,
} from "./outbox";

/**
 * The drain of the progress outbox (docs/design/sync.md §4).
 *
 * - The phone registers itself on its first sync and uploads its whole
 *   history (a baseline plus every card state).
 * - The outbox is pushed in pages of 500 on start, on resume and a few
 *   seconds after a session (any recorded event).
 * - Everything is quiet: no network means "try later".
 */

const TIMEOUT_MS = 10_000;
const PAGE = 500;
const DEBOUNCE_MS = 4_000;

export interface ProgressSyncStatus {
  registered: boolean;
  pending: number;
  lastPushAt: number | null;
  lastError: string | null;
}

let status: ProgressSyncStatus = {
  registered: false,
  pending: 0,
  lastPushAt: null,
  lastError: null,
};
const statusListeners = new Set<(s: ProgressSyncStatus) => void>();
function setStatus(next: Partial<ProgressSyncStatus>): void {
  status = { ...status, ...next };
  for (const listener of statusListeners) listener(status);
}
export function subscribeProgressSync(
  listener: (s: ProgressSyncStatus) => void,
): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function api(
  path: string,
  init: RequestInit & { token?: string },
  fetchImpl = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (init.token !== undefined)
      headers.Authorization = `Bearer ${init.token}`;
    return await fetchImpl(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function readIdentity(
  store: LocalStore,
): Promise<SyncIdentity | null> {
  return parseIdentity(await store.readKv(IDENTITY_KEY));
}

/** The phone's whole progress as events (first upload, or a repair). */
async function recordBaseline(store: LocalStore): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [wallet, collection, lastSpin, states] = await Promise.all([
    store.readWallet(today),
    store.readCollection(),
    store.readLastSpin(),
    store.listCardStates(),
  ]);
  const items: {
    type: ProgressEventType;
    payload: ProgressPayloads[ProgressEventType];
  }[] = [
    {
      type: "baseline",
      payload: {
        wallet: { balance: wallet.balance, packTickets: wallet.packTickets },
        collection: Object.fromEntries(collection),
        lastSpin,
      },
    },
  ];
  for (const state of states.values())
    items.push({ type: "card_state", payload: { state } });
  for (const key of SYNCED_KV_KEYS) {
    const value = await store.readKv(key);
    if (value !== null) items.push({ type: "kv", payload: { key, value } });
  }
  await record(store, items);
}

/** Registers the phone (first sync). Web devices register by pairing. */
async function ensurePhoneIdentity(
  store: LocalStore,
  fetchImpl?: typeof fetch,
): Promise<SyncIdentity | null> {
  const existing = await readIdentity(store);
  if (existing !== null || Platform.OS === "web") return existing;
  const playerId = randomId("pl");
  const deviceId = randomId("ph");
  const response = await api(
    "/api/devices/register",
    {
      method: "POST",
      body: JSON.stringify({
        player_id: playerId,
        device_id: deviceId,
        label: Platform.OS,
      }),
    },
    fetchImpl,
  );
  if (response.status !== 201) {
    setStatus({ lastError: `register ${response.status}` });
    return null;
  }
  const body = (await response.json()) as { device_token?: string };
  if (typeof body.device_token !== "string") return null;
  const identity: SyncIdentity = {
    playerId,
    deviceId,
    deviceToken: body.device_token,
    kind: "phone",
  };
  await serialized(() => store.writeKv(IDENTITY_KEY, JSON.stringify(identity)));
  await recordBaseline(store);
  return identity;
}

/** Pushes the outbox until it is empty (or the network says no). */
async function drain(
  store: LocalStore,
  identity: SyncIdentity,
  fetchImpl?: typeof fetch,
): Promise<void> {
  for (let page = 0; page < 200; page += 1) {
    const batch = peekOutbox(await store.readKv(OUTBOX_KEY), PAGE);
    if (batch.length === 0) break;
    const response = await api(
      "/api/sync/push",
      {
        method: "POST",
        token: identity.deviceToken,
        body: JSON.stringify({ events: batch }),
      },
      fetchImpl,
    );
    if (response.status === 401) {
      // revoked: forget the identity, keep the local progress
      await serialized(() => store.writeKv(IDENTITY_KEY, ""));
      setStatus({ registered: false, lastError: "unlinked" });
      return;
    }
    if (!response.ok) {
      setStatus({ lastError: `push ${response.status}` });
      return;
    }
    const sent = new Set(batch.map((event) => event.id));
    await serialized(async () => {
      await store.writeKv(
        OUTBOX_KEY,
        dropFromOutbox(await store.readKv(OUTBOX_KEY), sent),
      );
    });
    setStatus({ lastPushAt: Date.now(), lastError: null });
  }
}

let running: Promise<void> | null = null;

/** One sync pass (register if needed, then push). Never throws. */
export function syncProgress(
  options: { store?: LocalStore; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  if (running !== null) return running;
  running = (async () => {
    try {
      const store = options.store ?? (await openLocalStore());
      const identity = await ensurePhoneIdentity(store, options.fetchImpl);
      if (identity !== null) {
        setStatus({ registered: true });
        await drain(store, identity, options.fetchImpl);
      }
      setStatus({ pending: outboxSize(await store.readKv(OUTBOX_KEY)) });
    } catch (error) {
      setStatus({
        lastError: error instanceof Error ? error.message : "sync failed",
      });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Starts the automatic drain (start, resume, shortly after any change). */
export function startProgressSync(): () => void {
  void syncProgress();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopRecorded = onRecorded(() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncProgress();
    }, DEBOUNCE_MS);
  });
  const subscription = AppState.addEventListener("change", (next) => {
    if (next === "active") void syncProgress();
  });
  return () => {
    stopRecorded();
    subscription.remove();
    if (timer !== null) clearTimeout(timer);
  };
}
