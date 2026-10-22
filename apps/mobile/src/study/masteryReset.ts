import {
  dropStaleOutbox,
  MASTERY_EPOCH,
  needsMasteryReset,
  parseStudyOptions,
} from "@study-app/core";

import type { LocalStore } from "@/db/types";
import { OUTBOX_KEY } from "@/sync/outbox";

import { MASTERY_COUNTS_KEY } from "./masteryCounts";
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
