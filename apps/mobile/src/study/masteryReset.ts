import {
  dropStaleOutbox,
  MASTERY_EPOCH,
  needsMasteryReset,
  NORMAL_MODE_FIX_AT,
  normalModeResets,
  parseStudyOptions,
} from "@study-app/core";

import type { LocalStore } from "@/db/types";
import { OUTBOX_KEY } from "@/sync/outbox";

import { MASTERY_COUNTS_KEY, readMasteryCounts } from "./masteryCounts";
import { DAILY_DONE_KEY, STUDY_OPTIONS_KEY } from "./studyOptions";

/** The key/value key of the Mastery epoch this device runs. */
export const MASTERY_EPOCH_KEY = "mastery.epoch";

/**
 * The one-time Mastery reset (see `MASTERY_EPOCH` in core).
 *
 * Clears the scheduling state of every question, the mastery counts,
 * suspend/bury, today's counts and the stale scheduling events of the
 * outbox. Tokens, tickets, critters, decks and option presets stay. It
 * runs on the raw store (no new sync events) and saves the epoch last, so
 * an interrupted reset runs again and a finished one never does.
 */
export async function resetMasteryOnce(store: LocalStore): Promise<boolean> {
  if (!needsMasteryReset(await store.readKv(MASTERY_EPOCH_KEY))) {
    return false;
  }
  await store.resetScheduling();
  await store.writeKv(MASTERY_COUNTS_KEY, "{}");
  await store.writeKv(DAILY_DONE_KEY, "");
  const options = parseStudyOptions(await store.readKv(STUDY_OPTIONS_KEY));
  await store.writeKv(
    STUDY_OPTIONS_KEY,
    JSON.stringify({ ...options, suspended: [], buried: {} }),
  );
  await store.writeKv(
    OUTBOX_KEY,
    dropStaleOutbox(await store.readKv(OUTBOX_KEY)),
  );
  await store.writeKv(MASTERY_EPOCH_KEY, String(MASTERY_EPOCH));
  return true;
}

let once: Promise<unknown> | null = null;

/** Runs {@link resetMasteryOnce} once per app start (concurrent opens share it). */
export function ensureMasteryReset(store: LocalStore): Promise<unknown> {
  once ??= resetMasteryOnce(store).catch(() => {
    once = null;
  });
  return once;
}

/** The key/value key set once the plain-mode undo ran on this device. */
export const NORMAL_MODE_UNDO_KEY = "mastery.normalModeUndo.v1";

/**
 * Undoes the scheduling that plain Normal / Math wrote before v0.1.23
 * (see `normalModeResets` in core). Runs on the outbox store, so the reset
 * questions sync as fresh New states to the server and the other devices.
 * Review history and stats stay.
 */
export async function undoNormalModeScheduleOnce(store: LocalStore): Promise<number> {
  if ((await store.readKv(NORMAL_MODE_UNDO_KEY)) !== null) {
    return 0;
  }
  const states = await store.listCardStates();
  const now = Date.now();
  const resets = normalModeResets(
    states.values(),
    await readMasteryCounts(store),
    now,
    Math.min(now, NORMAL_MODE_FIX_AT),
  );
  for (const state of resets) {
    await store.upsertCardState(state);
  }
  await store.writeKv(NORMAL_MODE_UNDO_KEY, String(Date.now()));
  return resets.length;
}

let undoOnce: Promise<unknown> | null = null;

/** Runs {@link undoNormalModeScheduleOnce} once per app start. */
export function ensureNormalModeUndo(store: LocalStore): Promise<unknown> {
  undoOnce ??= undoNormalModeScheduleOnce(store).catch(() => {
    undoOnce = null;
  });
  return undoOnce;
}
