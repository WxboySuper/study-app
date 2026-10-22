import { State } from "ts-fsrs";

import { DEFAULT_LEECH_THRESHOLD } from "./mastery";
import type { CardState } from "./types";

/**
 * The study options of docs/design/sync.md §6.1: option presets per deck or
 * class (daily limits, leech threshold), suspended and buried cards, and
 * the daily counts that drive "Done for today".
 *
 * Everything is a plain JSON value so the app can keep it in its key/value
 * store and the functions stay pure.
 */

/** An option preset (Anki's "options group"). */
export interface StudyPreset {
  id: string;
  name: string;
  newPerDay: number;
  reviewsPerDay: number;
  leechThreshold: number;
  /** Learning steps of new questions, in minutes. */
  learnStepsMinutes: readonly number[];
  /** Relearning steps of missed questions, in minutes. */
  relearnStepsMinutes: readonly number[];
}

/** The built-in presets. The first one is the default. */
export const BUILT_IN_PRESETS: readonly StudyPreset[] = [
  {
    id: "default",
    name: "Default",
    newPerDay: 20,
    reviewsPerDay: 200,
    leechThreshold: DEFAULT_LEECH_THRESHOLD,
    learnStepsMinutes: [1, 10],
    relearnStepsMinutes: [1],
  },
  {
    id: "light",
    name: "Light",
    newPerDay: 5,
    reviewsPerDay: 50,
    leechThreshold: DEFAULT_LEECH_THRESHOLD,
    learnStepsMinutes: [10, 1440],
    relearnStepsMinutes: [10],
  },
  {
    id: "cram",
    name: "Cram",
    newPerDay: 100,
    reviewsPerDay: 9999,
    leechThreshold: 12,
    learnStepsMinutes: [1, 5],
    relearnStepsMinutes: [1],
  },
];

/** The study options the app saves. */
export interface StudyOptions {
  /** Preset id by deck id. Overrides the class preset. */
  deckPresets: Record<string, string>;
  /** Preset id by class id. */
  classPresets: Record<string, string>;
  /** Suspended card ids: never studied until unsuspended. */
  suspended: string[];
  /** Buried card ids, with the day (YYYY-MM-DD) they are buried for. */
  buried: Record<string, string>;
}

export const EMPTY_STUDY_OPTIONS: StudyOptions = {
  deckPresets: {},
  classPresets: {},
  suspended: [],
  buried: {},
};

function stringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") out[key] = item;
    }
  }
  return out;
}

/** Reads saved options; anything malformed falls back to empty. */
export function parseStudyOptions(raw: string | null): StudyOptions {
  if (raw === null) return { ...EMPTY_STUDY_OPTIONS };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      deckPresets: stringRecord(value.deckPresets),
      classPresets: stringRecord(value.classPresets),
      suspended: Array.isArray(value.suspended)
        ? value.suspended.filter((id): id is string => typeof id === "string")
        : [],
      buried: stringRecord(value.buried),
    };
  } catch {
    return { ...EMPTY_STUDY_OPTIONS };
  }
}

/** A preset by id (the default one when unknown). */
export function presetById(id: string | undefined): StudyPreset {
  return BUILT_IN_PRESETS.find((p) => p.id === id) ?? BUILT_IN_PRESETS[0]!;
}

/** The preset of a deck: its own, else its class's, else the default. */
export function presetForDeck(
  options: StudyOptions,
  deckId: string,
  classId: string | null | undefined,
): StudyPreset {
  const own = options.deckPresets[deckId];
  if (own !== undefined) return presetById(own);
  if (classId !== null && classId !== undefined) {
    const viaClass = options.classPresets[classId];
    if (viaClass !== undefined) return presetById(viaClass);
  }
  return presetById(undefined);
}

/** Sets (or clears with `null`) the preset of a deck or class. */
export function setPreset(
  options: StudyOptions,
  target: { deckId: string } | { classId: string },
  presetId: string | null,
): StudyOptions {
  const key = "deckId" in target ? "deckPresets" : "classPresets";
  const id = "deckId" in target ? target.deckId : target.classId;
  const next = { ...options[key] };
  if (presetId === null) delete next[id];
  else next[id] = presetId;
  return { ...options, [key]: next };
}

/** `true` when a card is suspended, or buried for `day`. */
export function isHidden(
  options: StudyOptions,
  cardId: string,
  day: string,
): boolean {
  return options.suspended.includes(cardId) || options.buried[cardId] === day;
}

/** Suspends or unsuspends a card. */
export function setSuspended(
  options: StudyOptions,
  cardId: string,
  suspended: boolean,
): StudyOptions {
  const rest = options.suspended.filter((id) => id !== cardId);
  return { ...options, suspended: suspended ? [...rest, cardId] : rest };
}

/** Buries a card for `day`, or unburies it with `null`. Old days are dropped. */
export function setBuried(
  options: StudyOptions,
  cardId: string,
  day: string | null,
  today: string,
): StudyOptions {
  const buried: Record<string, string> = {};
  for (const [id, d] of Object.entries(options.buried)) {
    if (d >= today && id !== cardId) buried[id] = d;
  }
  if (day !== null) buried[cardId] = day;
  return { ...options, buried };
}

/** What was studied today, per deck. */
export interface DailyDone {
  day: string;
  /** New cards introduced today, by deck id. */
  newByDeck: Record<string, number>;
  /** Reviews done today, by deck id. */
  reviewsByDeck: Record<string, number>;
  /** Cards already counted today (a card counts once). */
  seen: string[];
}

function numberRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
    }
  }
  return out;
}

/** Reads the saved counts; a different day starts from zero. */
export function parseDailyDone(raw: string | null, day: string): DailyDone {
  const empty: DailyDone = { day, newByDeck: {}, reviewsByDeck: {}, seen: [] };
  if (raw === null) return empty;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.day !== day) return empty;
    return {
      day,
      newByDeck: numberRecord(value.newByDeck),
      reviewsByDeck: numberRecord(value.reviewsByDeck),
      seen: Array.isArray(value.seen)
        ? value.seen.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return empty;
  }
}

/** The kind of a card for the daily limits. */
export function limitKind(
  state: CardState | undefined,
  now: number,
): "new" | "learning" | "due" | "later" {
  if (state === undefined || state.state === State.New) return "new";
  if (state.state === State.Learning || state.state === State.Relearning)
    return "learning";
  return state.due <= now ? "due" : "later";
}

/**
 * Counts one answer. `prior` is the card's state when the session started,
 * so a new card counts as new once even when it is asked again.
 */
export function noteAnswered(
  done: DailyDone,
  cardId: string,
  deckId: string,
  prior: CardState | undefined,
  now: number,
): DailyDone {
  if (done.seen.includes(cardId)) return done;
  const kind = limitKind(prior, now);
  const seen = [...done.seen, cardId];
  if (kind === "new") {
    return {
      ...done,
      seen,
      newByDeck: {
        ...done.newByDeck,
        [deckId]: (done.newByDeck[deckId] ?? 0) + 1,
      },
    };
  }
  if (kind === "due" || kind === "later") {
    return {
      ...done,
      seen,
      reviewsByDeck: {
        ...done.reviewsByDeck,
        [deckId]: (done.reviewsByDeck[deckId] ?? 0) + 1,
      },
    };
  }
  return { ...done, seen };
}

/** The result of {@link limitSessionPool}. */
export interface LimitedPool<T> {
  questions: T[];
  /** `true` when the scope has cards but none is left for today. */
  doneForToday: boolean;
  newLeft: number;
  reviewsLeft: number;
}

/**
 * Applies Anki's daily limits to the questions of a Mastery session:
 * hidden cards are dropped, new cards and due reviews are capped per deck
 * by the deck's preset, learning cards always stay, and reviews that are
 * not due yet wait for their day. Cards already counted today stay too.
 */
export function limitSessionPool<
  T extends { id: string; deckId: string; state?: CardState | undefined },
>(
  questions: readonly T[],
  input: {
    options: StudyOptions;
    done: DailyDone;
    now: number;
    classOf: (deckId: string) => string | null | undefined;
  },
): LimitedPool<T> {
  const day = input.done.day;
  const newLeft: Record<string, number> = {};
  const reviewsLeft: Record<string, number> = {};
  const left = (deckId: string) => {
    if (newLeft[deckId] === undefined) {
      const preset = presetForDeck(
        input.options,
        deckId,
        input.classOf(deckId),
      );
      newLeft[deckId] = Math.max(
        0,
        preset.newPerDay - (input.done.newByDeck[deckId] ?? 0),
      );
      reviewsLeft[deckId] = Math.max(
        0,
        preset.reviewsPerDay - (input.done.reviewsByDeck[deckId] ?? 0),
      );
    }
  };

  const kept: T[] = [];
  for (const q of questions) {
    if (isHidden(input.options, q.id, day)) continue;
    left(q.deckId);
    if (input.done.seen.includes(q.id)) {
      kept.push(q);
      continue;
    }
    const kind = limitKind(q.state, input.now);
    if (kind === "learning") kept.push(q);
    else if (kind === "new" && newLeft[q.deckId]! > 0) {
      newLeft[q.deckId]! -= 1;
      kept.push(q);
    } else if (kind === "due" && reviewsLeft[q.deckId]! > 0) {
      reviewsLeft[q.deckId]! -= 1;
      kept.push(q);
    }
  }

  const sum = (r: Record<string, number>) =>
    Object.values(r).reduce((a, b) => a + b, 0);
  return {
    questions: kept,
    doneForToday: questions.length > 0 && kept.length === 0,
    newLeft: sum(newLeft),
    reviewsLeft: sum(reviewsLeft),
  };
}

/** Formats learning steps (minutes) like Anki: `1m 10m 1d`. */
export function formatSteps(steps: readonly number[]): string {
  return steps
    .map((m) => {
      if (m >= 1440 && m % 1440 === 0) return `${m / 1440}d`;
      if (m >= 60) return `${Math.floor(m / 60)}h${m % 60 === 0 ? "" : `${m % 60}m`}`;
      return `${m}m`;
    })
    .join(" ");
}

/**
 * The learning steps of a session: those of the preset its decks share, or
 * the default preset's when the decks use different presets.
 */
export function sessionStepsFor(
  options: StudyOptions,
  deckIds: readonly string[],
  classOf: (deckId: string) => string | null | undefined,
): { learnStepsMinutes: readonly number[]; relearnStepsMinutes: readonly number[] } {
  const ids = new Set(deckIds.map((deckId) => presetForDeck(options, deckId, classOf(deckId)).id));
  const preset = ids.size === 1 ? presetById([...ids][0]) : presetById(undefined);
  return {
    learnStepsMinutes: preset.learnStepsMinutes,
    relearnStepsMinutes: preset.relearnStepsMinutes,
  };
}
