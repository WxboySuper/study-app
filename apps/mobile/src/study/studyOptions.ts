import { parseStudyOptions, type StudyOptions } from "@study-app/core";

/** The key/value key of the study options (presets, suspended, buried). */
export const STUDY_OPTIONS_KEY = "study.options.v1";
/** The key/value key of today's study counts (daily limits). */
export const DAILY_DONE_KEY = "study.dailyDone.v1";

type Kv = {
  readKv(key: string): Promise<string | null>;
  writeKv(key: string, value: string): Promise<void>;
};

/** Reads the study options (empty when unreadable). */
export async function readStudyOptions(store: Kv): Promise<StudyOptions> {
  try {
    return parseStudyOptions(await store.readKv(STUDY_OPTIONS_KEY));
  } catch {
    return parseStudyOptions(null);
  }
}

/** Saves the study options. */
export function writeStudyOptions(
  store: Kv,
  options: StudyOptions,
): Promise<void> {
  return store.writeKv(STUDY_OPTIONS_KEY, JSON.stringify(options));
}
