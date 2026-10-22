import { describe, expect, it } from "vitest";

import {
  MASTERY_EPOCH,
  appendOutbox,
  dropStaleOutbox,
  foldRemoteEvents,
  isStaleSchedulingEvent,
  makeEvent,
  needsMasteryReset,
  peekOutbox,
  type RemoteEvent,
} from "../src/progressSync";

const state = {
  cardId: "c1",
  due: 1,
  stability: 1,
  difficulty: 1,
  elapsedDays: 0,
  scheduledDays: 0,
  reps: 1,
  lapses: 0,
  state: 2,
  lastReview: 10,
};

describe("mastery epoch reset", () => {
  it("stamps scheduling events with the epoch", () => {
    const card = makeEvent("d", 1, 5, "card_state", { state });
    expect((card.payload as { epoch?: number }).epoch).toBe(MASTERY_EPOCH);
    const kv = makeEvent("d", 2, 5, "kv", {
      key: "fishing.masteryCounts.v1",
      value: "{}",
    });
    expect((kv.payload as { epoch?: number }).epoch).toBe(MASTERY_EPOCH);
    const spin = makeEvent("d", 3, 5, "spin", { localDate: "x", reward: 1 });
    expect("epoch" in spin.payload).toBe(false);
  });

  it("treats unstamped scheduling events as stale, others never", () => {
    expect(isStaleSchedulingEvent("card_state", { state })).toBe(true);
    expect(isStaleSchedulingEvent("review", { cardId: "c1" })).toBe(true);
    expect(
      isStaleSchedulingEvent("kv", {
        key: "fishing.masteryCounts.v1",
        value: "{}",
      }),
    ).toBe(true);
    expect(isStaleSchedulingEvent("kv", { key: "other", value: "{}" })).toBe(
      false,
    );
    expect(isStaleSchedulingEvent("wallet_delta", { balance: 3 })).toBe(false);
    expect(
      isStaleSchedulingEvent("card_state", { state, epoch: MASTERY_EPOCH }),
    ).toBe(false);
  });

  it("drops stale events from the outbox and keeps money", () => {
    const old = {
      id: "d-1",
      seq: 1,
      at: 1,
      type: "card_state" as const,
      payload: { state },
    };
    const money = makeEvent("d", 2, 2, "wallet_delta", {
      reason: "s",
      balance: 5,
      packTickets: 0,
      critters: {},
    });
    const fresh = makeEvent("d", 3, 3, "card_state", { state });
    const out = peekOutbox(
      dropStaleOutbox(appendOutbox(null, [old, money, fresh])),
      10,
    );
    expect(out.map((e) => e.id)).toEqual(["d-2", "d-3"]);
  });

  it("fold ignores old-epoch card states from other devices", () => {
    const remote = (id: string, payload: object): RemoteEvent =>
      ({
        id,
        seq: 1,
        at: 1,
        type: "card_state",
        payload,
        device_id: "other",
        cursor: 1,
      }) as RemoteEvent;
    const changes = foldRemoteEvents(
      [remote("o-1", { state })],
      new Map(),
      "me",
    );
    expect(changes.cardStates).toEqual([]);
    const ok = foldRemoteEvents(
      [remote("o-2", { state, epoch: MASTERY_EPOCH })],
      new Map(),
      "me",
    );
    expect(ok.cardStates.length).toBe(1);
  });

  it("runs the reset only until the epoch is saved", () => {
    expect(needsMasteryReset(null)).toBe(true);
    expect(needsMasteryReset("1")).toBe(true);
    expect(needsMasteryReset(String(MASTERY_EPOCH))).toBe(false);
  });
});
