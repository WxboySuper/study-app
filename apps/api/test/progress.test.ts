import { describe, expect, it } from "vitest";

import app from "../src/index";
import {
  normalizePairCode,
  PAIR_MAX_ATTEMPTS,
  PUSH_MAX_EVENTS,
} from "../src/progress";
import type { Bindings } from "../src/types";
import { sqliteDatabase } from "./sqlite-d1";

/** The tests of the phone <-> web progress sync (docs/design/sync.md). */

async function setup(): Promise<{
  env: Bindings;
  raw: Awaited<ReturnType<typeof sqliteDatabase>>["raw"];
}> {
  const { db, raw } = await sqliteDatabase();
  return { env: { DB: db }, raw };
}

async function call(
  env: Bindings,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return app.fetch(
    new Request(`https://api.cramcritters.test${path}`, { ...init, headers }),
    env,
  );
}

async function post(
  env: Bindings,
  path: string,
  body: unknown,
  token?: string,
): Promise<Response> {
  return call(env, path, { method: "POST", body: JSON.stringify(body) }, token);
}

async function json<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

async function registerPhone(
  env: Bindings,
  player = "player-0001",
  device = "phone-0001",
): Promise<string> {
  const response = await post(env, "/api/devices/register", {
    player_id: player,
    device_id: device,
  });
  expect(response.status).toBe(201);
  return (await json<{ device_token: string }>(response)).device_token;
}

async function pairWeb(
  env: Bindings,
  phoneToken: string,
  device = "web-00001",
): Promise<string> {
  const start = await json<{ code: string }>(
    await post(env, "/api/pair/start", {}, phoneToken),
  );
  const claim = await post(env, "/api/pair/claim", {
    code: start.code,
    device_id: device,
  });
  expect(claim.status).toBe(201);
  return (await json<{ device_token: string }>(claim)).device_token;
}

function event(
  id: string,
  seq: number,
  type = "review",
  payload: unknown = { cardId: "c1", epoch: 2 },
) {
  return { id, seq, at: 1_700_000_000_000 + seq, type, payload };
}

describe("device registration", () => {
  it("stores only the hash of the token", async () => {
    const { env, raw } = await setup();
    const token = await registerPhone(env);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const row = raw.prepare("SELECT token_hash FROM sync_devices").get() as {
      token_hash: string;
    };
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toBe(token);
  });

  it("refuses a bad body", async () => {
    const { env } = await setup();
    expect(
      (await post(env, "/api/devices/register", { player_id: "x" })).status,
    ).toBe(400);
  });

  it("refuses a second phone on a known player without pairing", async () => {
    const { env } = await setup();
    await registerPhone(env);
    const response = await post(env, "/api/devices/register", {
      player_id: "player-0001",
      device_id: "phone-0002",
    });
    expect(response.status).toBe(409);
  });

  it("re-registering the same phone rotates its token", async () => {
    const { env } = await setup();
    const first = await registerPhone(env);
    const second = await registerPhone(env);
    expect(second).not.toBe(first);
    expect((await call(env, "/api/devices", {}, first)).status).toBe(401);
    expect((await call(env, "/api/devices", {}, second)).status).toBe(200);
  });
});

describe("pairing", () => {
  it("pairs a browser with a one-time code", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const start = await json<{ code: string; expires_at: number }>(
      await post(env, "/api/pair/start", {}, phone),
    );
    expect(start.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(start.expires_at).toBeGreaterThan(Date.now());

    const typed = `${start.code.slice(0, 4).toLowerCase()}-${start.code.slice(4)}`;
    const claim = await post(env, "/api/pair/claim", {
      code: typed,
      device_id: "web-00001",
    });
    expect(claim.status).toBe(201);
    const body = await json<{ player_id: string; device_token: string }>(claim);
    expect(body.player_id).toBe("player-0001");

    // single use
    const again = await post(env, "/api/pair/claim", {
      code: start.code,
      device_id: "web-00002",
    });
    expect(again.status).toBe(400);

    const devices = await json<{ devices: { id: string; kind: string }[] }>(
      await call(env, "/api/devices", {}, body.device_token),
    );
    expect(devices.devices.map((d) => d.kind)).toEqual(["phone", "web"]);
  });

  it("only a phone can start pairing", async () => {
    const { env } = await setup();
    const web = await pairWeb(env, await registerPhone(env));
    expect((await post(env, "/api/pair/start", {}, web)).status).toBe(403);
  });

  it("needs a token to start", async () => {
    const { env } = await setup();
    expect((await post(env, "/api/pair/start", {})).status).toBe(401);
  });

  it("expired codes do not work", async () => {
    const { env, raw } = await setup();
    const phone = await registerPhone(env);
    const start = await json<{ code: string }>(
      await post(env, "/api/pair/start", {}, phone),
    );
    raw.exec("UPDATE sync_pair_codes SET expires_at = 1");
    expect(
      (
        await post(env, "/api/pair/claim", {
          code: start.code,
          device_id: "web-00001",
        })
      ).status,
    ).toBe(400);
  });

  it("a locked code does not work", async () => {
    const { env, raw } = await setup();
    const phone = await registerPhone(env);
    const start = await json<{ code: string }>(
      await post(env, "/api/pair/start", {}, phone),
    );
    raw.exec(`UPDATE sync_pair_codes SET attempts = ${PAIR_MAX_ATTEMPTS}`);
    expect(
      (
        await post(env, "/api/pair/claim", {
          code: start.code,
          device_id: "web-00001",
        })
      ).status,
    ).toBe(400);
  });

  it("a new code replaces the old one", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const first = await json<{ code: string }>(
      await post(env, "/api/pair/start", {}, phone),
    );
    await post(env, "/api/pair/start", {}, phone);
    expect(
      (
        await post(env, "/api/pair/claim", {
          code: first.code,
          device_id: "web-00001",
        })
      ).status,
    ).toBe(400);
  });

  it("normalizes typed codes", () => {
    expect(normalizePairCode(" ab0o-il1 ")).toBe("AB00111");
  });
});

describe("push and pull", () => {
  it("drops scheduling events from before the Mastery reset", async () => {
    const { env, raw } = await setup();
    const phone = await registerPhone(env);
    const events = [
      event("evt-old-review", 1, "review", { cardId: "c1" }),
      event("evt-old-kv", 2, "kv", {
        key: "fishing.masteryCounts.v1",
        value: "{}",
      }),
      event("evt-money", 3, "wallet_delta", { balance: 5 }),
      event("evt-new-review", 4, "review", { cardId: "c1", epoch: 2 }),
    ];
    expect((await post(env, "/api/sync/push", { events }, phone)).status).toBe(
      200,
    );
    const rows = raw
      .prepare("SELECT type FROM sync_events ORDER BY seq")
      .all() as {
      type: string;
    }[];
    expect(rows.map((r) => r.type)).toEqual(["wallet_delta", "review"]);
  });

  it("relays events between devices, idempotently", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const web = await pairWeb(env, phone);

    const push = await json<{
      inserted: number;
      duplicates: number;
      cursor: number;
    }>(
      await post(
        env,
        "/api/sync/push",
        { events: [event("evt-00001", 1), event("evt-00002", 2)] },
        phone,
      ),
    );
    expect(push.inserted).toBe(2);
    const again = await json<{ inserted: number; duplicates: number }>(
      await post(
        env,
        "/api/sync/push",
        { events: [event("evt-00001", 1)] },
        phone,
      ),
    );
    expect(again).toMatchObject({ inserted: 0, duplicates: 1 });

    const pulled = await json<{
      events: { id: string; device_id: string; payload: unknown }[];
      cursor: number;
    }>(await call(env, "/api/sync/pull?cursor=0", {}, web));
    expect(pulled.events.map((e) => e.id)).toEqual(["evt-00001", "evt-00002"]);
    expect(pulled.events[0]?.device_id).toBe("phone-0001");
    expect(pulled.events[0]?.payload).toEqual({ cardId: "c1", epoch: 2 });

    const own = await json<{ events: unknown[]; cursor: number }>(
      await call(env, "/api/sync/pull?cursor=0", {}, phone),
    );
    expect(own.events).toHaveLength(0);
    expect(own.cursor).toBe(pulled.cursor);
    const all = await json<{ events: unknown[] }>(
      await call(env, "/api/sync/pull?cursor=0&all=1", {}, phone),
    );
    expect(all.events).toHaveLength(2);

    const after = await json<{ events: unknown[] }>(
      await call(env, `/api/sync/pull?cursor=${pulled.cursor}`, {}, web),
    );
    expect(after.events).toHaveLength(0);
  });

  it("keeps players apart", async () => {
    const { env } = await setup();
    const a = await registerPhone(env, "player-aaaa", "phone-aaaa");
    const b = await registerPhone(env, "player-bbbb", "phone-bbbb");
    await post(env, "/api/sync/push", { events: [event("evt-aaaa1", 1)] }, a);
    const pulled = await json<{ events: unknown[] }>(
      await call(env, "/api/sync/pull?all=1", {}, b),
    );
    expect(pulled.events).toHaveLength(0);
  });

  it("rejects malformed events but keeps the good ones", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const response = await json<{ inserted: number; rejected: number[] }>(
      await post(
        env,
        "/api/sync/push",
        {
          events: [
            event("evt-00001", 1),
            { id: "x" },
            event("evt-00003", 3, "BAD TYPE"),
          ],
        },
        phone,
      ),
    );
    expect(response).toMatchObject({ inserted: 1, rejected: [1, 2] });
  });

  it("caps the size of a push", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const events = Array.from({ length: PUSH_MAX_EVENTS + 1 }, (_, i) =>
      event(`evt-${String(i).padStart(5, "0")}`, i),
    );
    expect((await post(env, "/api/sync/push", { events }, phone)).status).toBe(
      400,
    );
  });

  it("pages the pull", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const web = await pairWeb(env, phone);
    for (let batch = 0; batch < 2; batch += 1) {
      const events = Array.from({ length: 300 }, (_, i) =>
        event(`evt-${batch}-${String(i).padStart(4, "0")}`, batch * 300 + i),
      );
      await post(env, "/api/sync/push", { events }, phone);
    }
    const first = await json<{
      events: unknown[];
      cursor: number;
      more: boolean;
    }>(await call(env, "/api/sync/pull", {}, web));
    expect(first.events).toHaveLength(500);
    expect(first.more).toBe(true);
    const second = await json<{ events: unknown[]; more: boolean }>(
      await call(env, `/api/sync/pull?cursor=${first.cursor}`, {}, web),
    );
    expect(second.events).toHaveLength(100);
    expect(second.more).toBe(false);
  });

  it("needs a device token", async () => {
    const { env } = await setup();
    expect((await call(env, "/api/sync/pull")).status).toBe(401);
    expect(
      (await post(env, "/api/sync/push", { events: [] }, "nope")).status,
    ).toBe(401);
  });
});

describe("revocation", () => {
  it("the phone unlinks a browser", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const web = await pairWeb(env, phone);
    expect(
      (await call(env, "/api/devices/web-00001", { method: "DELETE" }, phone))
        .status,
    ).toBe(200);
    expect((await call(env, "/api/sync/pull", {}, web)).status).toBe(401);
  });

  it("a browser can only unlink itself", async () => {
    const { env } = await setup();
    const phone = await registerPhone(env);
    const web = await pairWeb(env, phone);
    expect(
      (await call(env, "/api/devices/phone-0001", { method: "DELETE" }, web))
        .status,
    ).toBe(403);
    expect(
      (await call(env, "/api/devices/web-00001", { method: "DELETE" }, web))
        .status,
    ).toBe(200);
  });
});
