import {
  addToHistory,
  localDayKey,
  parseReviewHistory,
  type ReviewHistory,
} from "@study-app/core";

import type { LocalStore } from "@/db/types";

/** The key/value key of the review history (docs: core `reviewHistory`). */
export const REVIEW_HISTORY_KEY = "study.history.v1";

let chain: Promise<unknown> = Promise.resolve();

/** Adds answers (`at` epoch ms, `rating` 1-4) to the saved history. */
export function recordHistory(
  store: LocalStore,
  entries: readonly { at: number; rating: number }[],
): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  const task = async () => {
    const history = parseReviewHistory(await store.readKv(REVIEW_HISTORY_KEY));
    const next = addToHistory(
      history,
      entries.map(({ at, rating }) => ({
        day: localDayKey(new Date(at)),
        rating,
      })),
    );
    await store.writeKv(REVIEW_HISTORY_KEY, JSON.stringify(next));
  };
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run.catch(() => undefined);
}

/** The saved history. */
export async function readHistory(store: LocalStore): Promise<ReviewHistory> {
  return parseReviewHistory(await store.readKv(REVIEW_HISTORY_KEY));
}
