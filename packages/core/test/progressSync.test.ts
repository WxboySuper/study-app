import { describe, expect, it } from "vitest";

import {
  appendOutbox,
  dropFromOutbox,
  foldRemoteEvents,
  makeEvent,
  outboxSize,
  peekOutbox,
  walletDelta,
  type CardState,
  type RemoteEvent,
} from "../src/index";

function state(cardId: string, lastReview: number | null, reps = 1): CardState {
  return {
    cardId,
    due: 0,
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    reps,
    lapses: 0,
    state: 2,
    lastReview,
  } as CardState;
}

let cursor = 0;
function remote(
  device: string,
  seq: number,
  type: RemoteEvent["type"],
  payload: unknown,
  at = 1000 + seq,
): RemoteEvent {
  cursor += 1;
  return {
    ...makeEvent(device, seq, at, type, payload as never),
    device_id: device,
    cursor,
  };
}

describe("walletDelta", () => {
  it("is null when nothing moved", () => {
    const snap = {
      wallet: { balance: 5, packTickets: 1 },
      collection: new Map([["a", 1]]),
    };
    expect(walletDelta("session", snap, snap)).toBeNull();
  });

  it("reports balance, tickets and critters", () => {
    const before = {
      wallet: { balance: 100, packTickets: 1 },
      collection: new Map([["a", 1]]),
    };
    const after = {
      wallet: { balance: 40, packTickets: 0 },
      collection: new Map([
        ["a", 2],
        ["b", 1],
      ]),
    };
    expect(walletDelta("pack", before, after)).toEqual({
      reason: "pack",
      balance: -60,
      packTickets: -1,
      critters: { a: 1, b: 1 },
    });
  });
});

describe("outbox", () => {
  it("appends, peeks and drops", () => {
    const e1 = makeEvent("d1", 1, 1, "kv", { key: "k", value: "v" });
    const e2 = makeEvent("d1", 2, 2, "kv", { key: "k", value: "w" });
    let raw = appendOutbox(null, [e1]);
    raw = appendOutbox(raw, [e2]);
    expect(outboxSize(raw)).toBe(2);
    expect(peekOutbox(raw, 1).map((e) => e.id)).toEqual(["d1-1"]);
    raw = dropFromOutbox(raw, new Set(["d1-1"]));
    expect(peekOutbox(raw, 10).map((e) => e.id)).toEqual(["d1-2"]);
  });

  it("caps its size and survives garbage", () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent("d", i, i, "spin", { localDate: "x", reward: i }),
    );
    expect(
      peekOutbox(appendOutbox(null, events, 3), 10).map((e) => e.seq),
    ).toEqual([2, 3, 4]);
    expect(outboxSize("not json")).toBe(0);
  });
});

describe("foldRemoteEvents", () => {
  it("keeps the newest card state and ignores older than local", () => {
    const local = new Map([
      ["c1", state("c1", 500)],
      ["c2", state("c2", 900)],
    ]);
    const changes = foldRemoteEvents(
      [
        remote("web", 1, "card_state", { state: state("c1", 600) }),
        remote("web", 2, "card_state", { state: state("c1", 700, 2) }),
        remote("web", 3, "card_state", { state: state("c2", 800) }),
        remote("web", 4, "card_state", { state: state("c3", null) }),
      ],
      local,
      "phone",
    );
    expect(changes.cardStates.map((s) => [s.cardId, s.lastReview])).toEqual([
      ["c1", 700],
      ["c3", null],
    ]);
  });

  it("adds wallet deltas up", () => {
    const changes = foldRemoteEvents(
      [
        remote("web", 1, "wallet_delta", {
          reason: "session",
          balance: 30,
          packTickets: 1,
          critters: {},
        }),
        remote("web", 2, "wallet_delta", {
          reason: "pack",
          balance: -20,
          packTickets: 0,
          critters: { a: 1 },
        }),
        remote("web", 3, "wallet_delta", {
          reason: "sell",
          balance: 5,
          packTickets: 0,
          critters: { a: -1 },
        }),
      ],
      new Map(),
      "phone",
    );
    expect(changes.wallet).toEqual({
      balance: 15,
      packTickets: 1,
      critters: {},
    });
  });

  it("skips its own events, keeps only synced kv keys, LWW", () => {
    const changes = foldRemoteEvents(
      [
        remote("phone", 1, "wallet_delta", {
          reason: "x",
          balance: 99,
          packTickets: 0,
          critters: {},
        }),
        remote(
          "web",
          2,
          "kv",
          { key: "fishing.masteryCounts.v1", value: '{"a":1}' },
          10,
        ),
        remote(
          "web",
          3,
          "kv",
          { key: "fishing.masteryCounts.v1", value: '{"a":2}' },
          20,
        ),
        remote("web", 4, "kv", { key: "secret", value: "x" }, 30),
      ],
      new Map(),
      "phone",
    );
    expect(changes.wallet.balance).toBe(0);
    expect(changes.kv).toEqual({ "fishing.masteryCounts.v1": '{"a":2}' });
  });

  it("keeps the latest spin and baseline, counts reviews", () => {
    const changes = foldRemoteEvents(
      [
        remote(
          "phone",
          1,
          "baseline",
          {
            wallet: { balance: 10, packTickets: 0 },
            collection: {},
            lastSpin: null,
          },
          5,
        ),
        remote("phone", 2, "spin", { localDate: "2026-10-21", reward: 5 }),
        remote("phone", 3, "spin", { localDate: "2026-10-22", reward: 7 }),
        remote("phone", 4, "review", { cardId: "c1" }),
      ],
      new Map(),
      "web",
    );
    expect(changes.baseline?.wallet.balance).toBe(10);
    expect(changes.lastSpin).toEqual({ localDate: "2026-10-22", reward: 7 });
    expect(changes.reviews).toBe(1);
  });

  it("is idempotent against already-applied states", () => {
    const events = [
      remote("web", 1, "card_state", { state: state("c1", 600) }),
    ];
    const first = foldRemoteEvents(events, new Map(), "phone");
    const local = new Map(first.cardStates.map((s) => [s.cardId, s]));
    // the same state again does not win (tie -> device id; local id 'phone' < 'web' so web wins ties)
    const second = foldRemoteEvents(events, local, "zzz");
    expect(second.cardStates).toHaveLength(0);
  });

  it("survives malformed payloads and breaks ties", () => {
    const changes = foldRemoteEvents(
      [
        remote("a", 1, "card_state", {}),
        remote("a", 2, "card_state", { state: state("c1", null) }),
        remote("b", 3, "card_state", { state: state("c1", null) }),
        remote("a", 4, "card_state", { state: state("c1", null) }),
        remote("a", 5, "wallet_delta", {
          balance: "x",
          packTickets: undefined,
        }),
        remote("a", 6, "wallet_delta", {
          balance: 1,
          packTickets: 1,
          critters: { f: "y", g: 2 },
        }),
        remote("a", 7, "kv", { key: "fishing.masteryCounts.v1", value: 3 }),
        remote(
          "a",
          8,
          "kv",
          { key: "fishing.masteryCounts.v1", value: "A" },
          50,
        ),
        remote(
          "b",
          9,
          "kv",
          { key: "fishing.masteryCounts.v1", value: "B" },
          50,
        ),
        remote(
          "a",
          10,
          "kv",
          { key: "fishing.masteryCounts.v1", value: "C" },
          50,
        ),
        remote(
          "a",
          11,
          "kv",
          { key: "fishing.masteryCounts.v1", value: "D" },
          10,
        ),
        remote("a", 12, "spin", { localDate: "2026-10-22", reward: 7 }),
        remote("a", 13, "spin", { localDate: "2026-10-01", reward: 1 }),
        remote(
          "a",
          14,
          "baseline",
          {
            wallet: { balance: 9, packTickets: 0 },
            collection: {},
            lastSpin: null,
          },
          90,
        ),
        remote(
          "a",
          15,
          "baseline",
          {
            wallet: { balance: 1, packTickets: 0 },
            collection: {},
            lastSpin: null,
          },
          20,
        ),
        remote("a", 16, "nope" as RemoteEvent["type"], {}),
      ],
      new Map([["c1", state("c1", 5)]]),
      "local",
    );
    expect(changes.cardStates).toHaveLength(0);
    expect(changes.wallet.balance).toBe(1);
    expect(changes.wallet.packTickets).toBe(1);
    expect(changes.kv["fishing.masteryCounts.v1"]).toBe("B");
    expect(changes.lastSpin?.reward).toBe(7);
    expect(changes.baseline?.wallet.balance).toBe(9);
  });
});
