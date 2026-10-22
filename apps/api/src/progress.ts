import { isStaleSchedulingEvent } from "@study-app/core";
import type { Context } from "hono";

import { recordQuizAnswers } from "./quizzes";
import { bearerToken } from "./auth";
import type { Bindings } from "./types";

/**
 * Phone <-> web progress sync (docs/design/sync.md, docs/API.md).
 *
 * The Worker is a relay: devices push append-only events and pull the
 * events of the other devices of the same player. Tokens are random 32
 * bytes; only their SHA-256 is stored, and they are never logged.
 */

/** How long a pairing code is good for. */
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong claims (per code) before the code is locked. */
export const PAIR_MAX_ATTEMPTS = 5;
/** The most events per push. */
export const PUSH_MAX_EVENTS = 500;
/** The most events per pull page. */
export const PULL_PAGE = 500;
/** The biggest payload of one event (bytes of JSON). */
export const EVENT_MAX_BYTES = 16 * 1024;
/** Crockford base32 (no I, L, O, U). */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const UUIDISH = /^[A-Za-z0-9_-]{8,64}$/;
const EVENT_TYPE = /^[a-z][a-z0-9_]{1,31}$/;

type Ctx = Context<{ Bindings: Bindings }>;

export interface AuthedDevice {
  id: string;
  playerId: string;
  kind: string;
}

/** A sync event as it travels on the wire. */
export interface WireEvent {
  id: string;
  device_id: string;
  seq: number;
  at: number;
  type: string;
  payload: unknown;
  cursor?: number;
}

/** Hex SHA-256. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 32 random bytes, base64url. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** An 8-character Crockford code (40 bits). */
export function newPairCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % 32]).join("");
}

/** Normalizes what a person typed: upper case, no spaces/dashes, O->0, I/L->1. */
export function normalizePairCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

function db(c: Ctx): D1Database {
  return c.env.DB;
}

/** The device behind the bearer token, or `null`. */
export async function authDevice(c: Ctx): Promise<AuthedDevice | null> {
  const token = bearerToken(c.req.header("authorization"));
  if (token === null) {
    return null;
  }
  const hash = await sha256Hex(token);
  const row = await db(c)
    .prepare(
      "SELECT id, player_id, kind FROM sync_devices WHERE token_hash = ? AND revoked_at IS NULL",
    )
    .bind(hash)
    .first<{ id: string; player_id: string; kind: string }>();
  if (row === null) {
    return null;
  }
  await db(c)
    .prepare("UPDATE sync_devices SET last_seen = ? WHERE id = ?")
    .bind(Date.now(), row.id)
    .run();
  return { id: row.id, playerId: row.player_id, kind: row.kind };
}

async function readJson(c: Ctx): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function createDevice(
  c: Ctx,
  playerId: string,
  deviceId: string,
  kind: "phone" | "web",
  label: string | null,
): Promise<string> {
  const token = newToken();
  const hash = await sha256Hex(token);
  // A device that registers again (reinstall, lost token) gets a new token;
  // the old one stops working.
  await db(c)
    .prepare(
      `INSERT INTO sync_devices (id, player_id, kind, label, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, revoked_at = NULL, label = excluded.label`,
    )
    .bind(deviceId, playerId, kind, label, hash, Date.now())
    .run();
  return token;
}

/** `POST /api/devices/register` - the phone registers itself (first sync). */
export async function registerDevice(c: Ctx): Promise<Response> {
  const body = await readJson(c);
  const playerId = body?.player_id;
  const deviceId = body?.device_id;
  if (
    typeof playerId !== "string" ||
    !UUIDISH.test(playerId) ||
    typeof deviceId !== "string" ||
    !UUIDISH.test(deviceId)
  ) {
    return c.json({ error: "bad_request" }, 400);
  }
  const existing = await db(c)
    .prepare("SELECT player_id FROM sync_devices WHERE id = ?")
    .bind(deviceId)
    .first<{ player_id: string }>();
  if (existing !== null && existing.player_id !== playerId) {
    return c.json({ error: "device_taken" }, 409);
  }
  const player = await db(c)
    .prepare("SELECT id FROM sync_players WHERE id = ?")
    .bind(playerId)
    .first();
  if (player !== null && existing === null) {
    // A known player only gains devices through pairing; this stops anyone
    // who learns a player id from minting a token for it.
    const phone = await db(c)
      .prepare(
        "SELECT id FROM sync_devices WHERE player_id = ? AND kind = 'phone' AND revoked_at IS NULL",
      )
      .bind(playerId)
      .first();
    if (phone !== null) {
      return c.json({ error: "player_taken" }, 409);
    }
  }
  if (player === null) {
    await db(c)
      .prepare("INSERT INTO sync_players (id, created_at) VALUES (?, ?)")
      .bind(playerId, Date.now())
      .run();
  }
  const label =
    typeof body?.label === "string" ? body.label.slice(0, 64) : null;
  const token = await createDevice(c, playerId, deviceId, "phone", label);
  return c.json(
    { player_id: playerId, device_id: deviceId, device_token: token },
    201,
  );
}

/** `POST /api/pair/start` - the phone asks for a one-time code. */
export async function startPairing(
  c: Ctx,
  device: AuthedDevice,
): Promise<Response> {
  if (device.kind !== "phone") {
    return c.json({ error: "phone_only" }, 403);
  }
  const code = newPairCode();
  const expiresAt = Date.now() + PAIR_CODE_TTL_MS;
  // One live code per player: a new code replaces the old ones.
  await db(c)
    .prepare("DELETE FROM sync_pair_codes WHERE player_id = ?")
    .bind(device.playerId)
    .run();
  await db(c)
    .prepare(
      "INSERT INTO sync_pair_codes (code_hash, player_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(await sha256Hex(code), device.playerId, expiresAt)
    .run();
  return c.json({ code, expires_at: expiresAt }, 201);
}

/** `POST /api/pair/claim` - a browser trades the code for its own token. */
export async function claimPairing(c: Ctx): Promise<Response> {
  const body = await readJson(c);
  const rawCode = body?.code;
  const deviceId = body?.device_id;
  if (
    typeof rawCode !== "string" ||
    typeof deviceId !== "string" ||
    !UUIDISH.test(deviceId)
  ) {
    return c.json({ error: "bad_request" }, 400);
  }
  const code = normalizePairCode(rawCode);
  if (code.length !== 8) {
    return c.json({ error: "invalid_code" }, 400);
  }
  const hash = await sha256Hex(code);
  const row = await db(c)
    .prepare(
      "SELECT player_id, expires_at, attempts, used_at FROM sync_pair_codes WHERE code_hash = ?",
    )
    .bind(hash)
    .first<{
      player_id: string;
      expires_at: number;
      attempts: number;
      used_at: number | null;
    }>();
  if (
    row === null ||
    row.used_at !== null ||
    row.expires_at < Date.now() ||
    row.attempts >= PAIR_MAX_ATTEMPTS
  ) {
    return c.json({ error: "invalid_code" }, 400);
  }
  const taken = await db(c)
    .prepare("SELECT player_id FROM sync_devices WHERE id = ?")
    .bind(deviceId)
    .first<{ player_id: string }>();
  if (taken !== null && taken.player_id !== row.player_id) {
    return c.json({ error: "device_taken" }, 409);
  }
  await db(c)
    .prepare("UPDATE sync_pair_codes SET used_at = ? WHERE code_hash = ?")
    .bind(Date.now(), hash)
    .run();
  const label =
    typeof body?.label === "string" ? body.label.slice(0, 64) : null;
  const token = await createDevice(c, row.player_id, deviceId, "web", label);
  return c.json(
    { player_id: row.player_id, device_id: deviceId, device_token: token },
    201,
  );
}

/** `GET /api/devices` - the devices of the player. */
export async function listDevices(
  c: Ctx,
  device: AuthedDevice,
): Promise<Response> {
  const rows = await db(c)
    .prepare(
      "SELECT id, kind, label, created_at, last_seen FROM sync_devices WHERE player_id = ? AND revoked_at IS NULL ORDER BY created_at",
    )
    .bind(device.playerId)
    .all<{
      id: string;
      kind: string;
      label: string | null;
      created_at: number;
      last_seen: number | null;
    }>();
  return c.json({
    devices: rows.results.map((row) => ({
      ...row,
      current: row.id === device.id,
    })),
  });
}

/** `DELETE /api/devices/:id` - the phone unlinks a device. */
export async function revokeDevice(
  c: Ctx,
  device: AuthedDevice,
  targetId: string,
): Promise<Response> {
  if (device.kind !== "phone" && targetId !== device.id) {
    return c.json({ error: "phone_only" }, 403);
  }
  const result = await db(c)
    .prepare(
      "UPDATE sync_devices SET revoked_at = ? WHERE id = ? AND player_id = ? AND revoked_at IS NULL",
    )
    .bind(Date.now(), targetId, device.playerId)
    .run();
  if ((result.meta?.changes ?? 0) === 0) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ ok: true as const, id: targetId });
}

/** Validates one pushed event (`null` when it is malformed). */
export function parseEvent(raw: unknown, deviceId: string): WireEvent | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !UUIDISH.test(e.id)) return null;
  if (typeof e.type !== "string" || !EVENT_TYPE.test(e.type)) return null;
  if (typeof e.seq !== "number" || !Number.isSafeInteger(e.seq) || e.seq < 0)
    return null;
  if (typeof e.at !== "number" || !Number.isFinite(e.at) || e.at <= 0)
    return null;
  if (!("payload" in e)) return null;
  return {
    id: e.id,
    device_id: deviceId,
    seq: e.seq,
    at: Math.floor(e.at),
    type: e.type,
    payload: e.payload,
  };
}

/** `POST /api/sync/push` - append events (idempotent by event id). */
export async function pushEvents(
  c: Ctx,
  device: AuthedDevice,
): Promise<Response> {
  const body = await readJson(c);
  const events = body?.events;
  if (!Array.isArray(events) || events.length > PUSH_MAX_EVENTS) {
    return c.json({ error: "bad_request", max: PUSH_MAX_EVENTS }, 400);
  }
  const parsed: WireEvent[] = [];
  const rejected: number[] = [];
  events.forEach((raw, index) => {
    const event = parseEvent(raw, device.id);
    if (
      event === null ||
      JSON.stringify(event.payload).length > EVENT_MAX_BYTES
    ) {
      rejected.push(index);
    } else {
      parsed.push(event);
    }
  });
  // Scheduling progress from before the Mastery reset never comes back.
  const fresh = parsed.filter(
    (event) => !isStaleSchedulingEvent(event.type, event.payload),
  );
  const now = Date.now();
  const statements = fresh.map((event) =>
    db(c)
      .prepare(
        `INSERT INTO sync_events (id, player_id, device_id, seq, at, type, payload_json, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        event.id,
        device.playerId,
        device.id,
        event.seq,
        event.at,
        event.type,
        JSON.stringify(event.payload),
        now,
      ),
  );
  let inserted = 0;
  if (statements.length > 0) {
    const results = await db(c).batch(statements);
    inserted = results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
    await recordQuizAnswers(db(c), device, fresh);
  }
  const top = await db(c)
    .prepare(
      "SELECT MAX(cursor) AS cursor FROM sync_events WHERE player_id = ?",
    )
    .bind(device.playerId)
    .first<{ cursor: number | null }>();
  return c.json({
    accepted: parsed.map((e) => e.id),
    inserted,
    duplicates: parsed.length - inserted,
    rejected,
    cursor: top?.cursor ?? 0,
  });
}

/** `GET /api/sync/pull?cursor=&all=1` - the events after a cursor. */
export async function pullEvents(
  c: Ctx,
  device: AuthedDevice,
): Promise<Response> {
  const rawCursor = Number(c.req.query("cursor") ?? "0");
  const cursor =
    Number.isSafeInteger(rawCursor) && rawCursor > 0 ? rawCursor : 0;
  // `all=1` includes the device's own events (a reinstall or a repair).
  const includeOwn = c.req.query("all") === "1";
  const rows = await db(c)
    .prepare(
      `SELECT cursor, id, device_id, seq, at, type, payload_json FROM sync_events
       WHERE player_id = ? AND cursor > ? ORDER BY cursor LIMIT ?`,
    )
    .bind(device.playerId, cursor, PULL_PAGE + 1)
    .all<{
      cursor: number;
      id: string;
      device_id: string;
      seq: number;
      at: number;
      type: string;
      payload_json: string;
    }>();
  const page = rows.results.slice(0, PULL_PAGE);
  const more = rows.results.length > PULL_PAGE;
  const next =
    page.length > 0 ? (page[page.length - 1]?.cursor ?? cursor) : cursor;
  const events: WireEvent[] = page
    .filter((row) => includeOwn || row.device_id !== device.id)
    .map((row) => ({
      cursor: row.cursor,
      id: row.id,
      device_id: row.device_id,
      seq: row.seq,
      at: row.at,
      type: row.type,
      payload: JSON.parse(row.payload_json) as unknown,
    }));
  return c.json({ events, cursor: next, more, player_id: device.playerId });
}
