import {
  dropFromOutbox,
  foldRemoteEvents,
  mergeCardStates,
  type CardState,
  type RemoteEvent,
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
  lastPullAt: number | null;
  lastError: string | null;
}

let status: ProgressSyncStatus = {
  registered: false,
  pending: 0,
  lastPushAt: null,
  lastPullAt: null,
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

const CURSOR_KEY = "sync:pullCursor";
const ADOPTED_KEY = "sync:adopted";
const PARKED_KEY = "sync:parkedStates";

function parseParked(raw: string | null): CardState[] {
  if (raw === null || raw === "") return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as CardState[]) : [];
  } catch {
    return [];
  }
}

/** Forgets the link (revoked, or unlinked by the player). */
async function forgetIdentity(store: LocalStore): Promise<void> {
  await serialized(async () => {
    await store.writeKv(IDENTITY_KEY, "");
    await store.writeKv(CURSOR_KEY, "0");
    await store.writeKv(ADOPTED_KEY, "");
  });
  setStatus({ registered: false, lastError: "unlinked" });
}

/**
 * Pulls the other devices' events and applies them (docs/design/sync.md §5).
 * A web device adopts the phone's baseline once, on its first pull.
 */
async function pull(
  store: LocalStore,
  identity: SyncIdentity,
  fetchImpl?: typeof fetch,
): Promise<void> {
  let cursor = Number(await store.readKv(CURSOR_KEY)) || 0;
  for (let page = 0; page < 200; page += 1) {
    const response = await api(
      `/api/sync/pull?cursor=${cursor}`,
      { method: "GET", token: identity.deviceToken },
      fetchImpl,
    );
    if (response.status === 401) {
      await forgetIdentity(store);
      return;
    }
    if (!response.ok) {
      setStatus({ lastError: `pull ${response.status}` });
      return;
    }
    const body = (await response.json()) as {
      events?: RemoteEvent[];
      cursor?: number;
      more?: boolean;
    };
    const events = Array.isArray(body.events) ? body.events : [];
    const next = typeof body.cursor === "number" ? body.cursor : cursor;
    await serialized(async () => {
      const local = await store.listCardStates();
      const changes = foldRemoteEvents(events, local, identity.deviceId);
      const parked = parseParked(await store.readKv(PARKED_KEY)).filter(
        (state) => {
          const mine = local.get(state.cardId);
          return (
            mine === undefined ||
            (state.lastReview ?? -1) > (mine.lastReview ?? -1)
          );
        },
      );
      changes.cardStates = mergeCardStates(parked, changes.cardStates);
      const adopt =
        identity.kind === "web" &&
        changes.baseline !== null &&
        (await store.readKv(ADOPTED_KEY)) !== "1";
      const { parkedCardStates } = await store.applyRemoteChanges(changes, {
        adoptBaseline: adopt,
      });
      await store.writeKv(PARKED_KEY, JSON.stringify(parkedCardStates));
      if (adopt) await store.writeKv(ADOPTED_KEY, "1");
      await store.writeKv(CURSOR_KEY, String(next));
    });
    if (events.length > 0) notifyApplied();
    cursor = next;
    if (body.more !== true) break;
  }
  setStatus({ lastPullAt: Date.now() });
}

const appliedListeners = new Set<() => void>();
function notifyApplied(): void {
  for (const listener of appliedListeners) listener();
}
/** Called after a pull changed the local progress (screens can refresh). */
export function onProgressApplied(listener: () => void): () => void {
  appliedListeners.add(listener);
  return () => appliedListeners.delete(listener);
}

// --- pairing (docs/API.md "Sync") ---

export interface LinkedDevice {
  id: string;
  kind: "phone" | "web";
  label: string | null;
  created_at: number;
  last_seen: number | null;
  current: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** An authenticated API call with this device's token. */
export function authedRequest<T>(
  path: string,
  init: RequestInit,
  fetchImpl?: typeof fetch,
): Promise<Result<T>> {
  return authed<T>(path, init, fetchImpl);
}

async function authed<T>(
  path: string,
  init: RequestInit,
  fetchImpl?: typeof fetch,
): Promise<Result<T>> {
  try {
    const store = await openLocalStore();
    const identity =
      (await ensurePhoneIdentity(store, fetchImpl)) ??
      (await readIdentity(store));
    if (identity === null) return { ok: false, error: "not_linked" };
    const response = await api(
      path,
      { ...init, token: identity.deviceToken },
      fetchImpl,
    );
    if (response.status === 401) {
      await forgetIdentity(store);
      return { ok: false, error: "unlinked" };
    }
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      return { ok: false, error: body.error ?? `http_${response.status}` };
    return { ok: true, value: body as T };
  } catch {
    return { ok: false, error: "offline" };
  }
}

/** Phone: a one-time code for a browser (10 minutes). */
export function startPairing(
  fetchImpl?: typeof fetch,
): Promise<Result<{ code: string; expires_at: number }>> {
  return authed("/api/pair/start", { method: "POST", body: "{}" }, fetchImpl);
}

/** The devices linked to this player. */
export async function listLinkedDevices(
  fetchImpl?: typeof fetch,
): Promise<Result<LinkedDevice[]>> {
  const result = await authed<{ devices: LinkedDevice[] }>(
    "/api/devices",
    { method: "GET" },
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.devices } : result;
}

/** Unlinks a device (the phone: any; a browser: itself). */
export async function unlinkDevice(
  id: string,
  fetchImpl?: typeof fetch,
): Promise<Result<true>> {
  const result = await authed<{ ok: true }>(
    `/api/devices/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    fetchImpl,
  );
  if (!result.ok) return result;
  const store = await openLocalStore();
  const identity = await readIdentity(store);
  if (identity?.deviceId === id) await forgetIdentity(store);
  return { ok: true, value: true };
}

/** Browser: claims the phone's code and becomes a device of that player. */
export async function claimPairing(
  code: string,
  fetchImpl?: typeof fetch,
): Promise<Result<true>> {
  try {
    const store = await openLocalStore();
    const deviceId = randomId("wb");
    const response = await api(
      "/api/pair/claim",
      {
        method: "POST",
        body: JSON.stringify({ code, device_id: deviceId, label: "web" }),
      },
      fetchImpl,
    );
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      player_id?: string;
      device_token?: string;
    };
    if (
      response.status !== 201 ||
      typeof body.player_id !== "string" ||
      typeof body.device_token !== "string"
    ) {
      return { ok: false, error: body.error ?? `http_${response.status}` };
    }
    const identity: SyncIdentity = {
      playerId: body.player_id,
      deviceId,
      deviceToken: body.device_token,
      kind: "web",
    };
    await serialized(async () => {
      await store.writeKv(CURSOR_KEY, "0");
      await store.writeKv(ADOPTED_KEY, "");
      await store.writeKv(IDENTITY_KEY, JSON.stringify(identity));
    });
    setStatus({ registered: true, lastError: null });
    await syncProgress({ store, fetchImpl });
    return { ok: true, value: true };
  } catch {
    return { ok: false, error: "offline" };
  }
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
      await forgetIdentity(store);
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
        const still = await readIdentity(store);
        if (still !== null) await pull(store, still, options.fetchImpl);
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
