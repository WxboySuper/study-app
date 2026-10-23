import { State } from "ts-fsrs";

import { DEFAULT_LEECH_THRESHOLD } from "./mastery";
import type { QuestionTrack } from "./track";
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

/**
 * The built-in presets of the Math section. Math questions are slow to
 * solve, so the defaults are smaller: 5 new questions a day and a day
 * between the learning steps.
 */
export const MATH_PRESETS: readonly StudyPreset[] = [
  {
    id: "math",
    name: "Math",
    newPerDay: 5,
    reviewsPerDay: 50,
    leechThreshold: DEFAULT_LEECH_THRESHOLD,
    learnStepsMinutes: [10, 1440],
    relearnStepsMinutes: [10],
  },
  {
    id: "math-light",
    name: "Math light",
    newPerDay: 3,
    reviewsPerDay: 25,
    leechThreshold: DEFAULT_LEECH_THRESHOLD,
    learnStepsMinutes: [10, 1440],
    relearnStepsMinutes: [10],
  },
  {
    id: "math-push",
    name: "Math push",
    newPerDay: 10,
    reviewsPerDay: 100,
    leechThreshold: DEFAULT_LEECH_THRESHOLD,
    learnStepsMinutes: [10, 60],
    relearnStepsMinutes: [10],
  },
];

/** The presets a track offers. The first one is its default. */
export function presetsOfTrack(track: QuestionTrack = "mc"): readonly StudyPreset[] {
  return track === "math" ? MATH_PRESETS : BUILT_IN_PRESETS;
}

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
  /** Math preset id by deck id (the Math section has its own presets). */
  mathDeckPresets: Record<string, string>;
  /** Math preset id by class id. */
  mathClassPresets: Record<string, string>;
}

export const EMPTY_STUDY_OPTIONS: StudyOptions = {
  deckPresets: {},
  classPresets: {},
  mathDeckPresets: {},
  mathClassPresets: {},
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
      mathDeckPresets: stringRecord(value.mathDeckPresets),
      mathClassPresets: stringRecord(value.mathClassPresets),
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
export function presetById(
  id: string | undefined,
  track: QuestionTrack = "mc",
): StudyPreset {
  const presets = presetsOfTrack(track);
  return presets.find((p) => p.id === id) ?? presets[0]!;
}

/** The preset of a deck: its own, else its class's, else the default. */
export function presetForDeck(
  options: StudyOptions,
  deckId: string,
  classId: string | null | undefined,
  track: QuestionTrack = "mc",
): StudyPreset {
  const decks = track === "math" ? options.mathDeckPresets : options.deckPresets;
  const classes = track === "math" ? options.mathClassPresets : options.classPresets;
  const own = decks?.[deckId];
  if (own !== undefined) return presetById(own, track);
  if (classId !== null && classId !== undefined) {
    const viaClass = classes?.[classId];
    if (viaClass !== undefined) return presetById(viaClass, track);
  }
  return presetById(undefined, track);
}

/** Sets (or clears with `null`) the preset of a deck or class. */
export function setPreset(
  options: StudyOptions,
  target: { deckId: string } | { classId: string },
  presetId: string | null,
  track: QuestionTrack = "mc",
): StudyOptions {
  const key =
    track === "math"
      ? "deckId" in target
        ? "mathDeckPresets"
        : "mathClassPresets"
      : "deckId" in target
        ? "deckPresets"
        : "classPresets";
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

/**
 * Anki's learn-ahead limit: a learning question whose next step is due within
 * this window already counts as today's learning.
 */
export const LEARN_AHEAD_MS = 20 * 60_000;

/** `true` for a question in (re)learning. */
export function isLearningState(state: CardState | undefined): boolean {
  return (
    state !== undefined &&
    (state.state === State.Learning || state.state === State.Relearning)
  );
}

/**
 * The kind of a question for the daily limits (and today's counts).
 *
 * A learning question is `learning` only once its step is due (with the
 * learn-ahead window); before that it waits (`later`), like in Anki.
 */
export function limitKind(
  state: CardState | undefined,
  now: number,
): "new" | "learning" | "due" | "later" {
  if (state === undefined || state.state === State.New) return "new";
  if (isLearningState(state))
    return state.due <= now + LEARN_AHEAD_MS ? "learning" : "later";
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
  if (!isLearningState(prior) && (kind === "due" || kind === "later")) {
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
    /** The track of the questions (its presets apply). */
    track?: QuestionTrack;
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
        input.track,
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
  track: QuestionTrack = "mc",
): { learnStepsMinutes: readonly number[]; relearnStepsMinutes: readonly number[] } {
  const ids = new Set(
    deckIds.map((deckId) => presetForDeck(options, deckId, classOf(deckId), track).id),
  );
  const preset =
    ids.size === 1 ? presetById([...ids][0], track) : presetById(undefined, track);
  return {
    learnStepsMinutes: preset.learnStepsMinutes,
    relearnStepsMinutes: preset.relearnStepsMinutes,
  };
}

/** Today's Mastery queue of a scope, by bucket (Anki's New / Learn / Due). */
export interface TodayCounts {
  new: number;
  learning: number;
  due: number;
}

/** What a scope holds for today and tomorrow (the deck list and Done screen). */
export interface MasteryForecast {
  /** Today's queue that is still to do, within the daily limits. */
  today: TodayCounts;
  /** The next time a studied card comes due after `now` (epoch ms), if any. */
  nextDueAt: number | null;
  /** Reviews due by the end of tomorrow (not counting today's). */
  tomorrowReviews: number;
  /** New questions tomorrow's limits will bring in. */
  tomorrowNew: number;
}

/** The epoch ms of the end of tomorrow (local midnight after next). */
function endOfTomorrow(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 2);
  return date.getTime();
}

/**
 * Today's Mastery queue of a scope and the forecast of tomorrow.
 *
 * Today's numbers are exactly what {@link limitSessionPool} lets into a
 * session, so the deck list never promises more than one day holds.
 */
export function masteryForecast<
  T extends { id: string; deckId: string; state?: CardState | undefined },
>(
  questions: readonly T[],
  input: {
    options: StudyOptions;
    done: DailyDone;
    now: number;
    classOf: (deckId: string) => string | null | undefined;
    track?: QuestionTrack;
  },
): MasteryForecast {
  const limited = limitSessionPool(questions, input);
  const today: TodayCounts = { new: 0, learning: 0, due: 0 };
  const kept = new Set<string>();
  for (const q of limited.questions) {
    kept.add(q.id);
    const kind = limitKind(q.state, input.now);
    if (kind === "new") today.new += 1;
    else if (kind === "learning") today.learning += 1;
    else today.due += 1;
  }

  const horizon = endOfTomorrow(input.now);
  let nextDueAt: number | null = null;
  let tomorrowReviews = 0;
  const newLeftByDeck: Record<string, number> = {};
  for (const q of questions) {
    if (isHidden(input.options, q.id, input.done.day)) continue;
    const kind = limitKind(q.state, input.now);
    if (kind === "new") {
      if (!kept.has(q.id)) newLeftByDeck[q.deckId] = (newLeftByDeck[q.deckId] ?? 0) + 1;
      continue;
    }
    const due = q.state!.due;
    if (due > input.now) {
      if (nextDueAt === null || due < nextDueAt) nextDueAt = due;
      if (due < horizon && kind === "later" && !isLearningState(q.state)) tomorrowReviews += 1;
    }
  }
  let tomorrowNew = 0;
  for (const [deckId, count] of Object.entries(newLeftByDeck)) {
    const preset = presetForDeck(input.options, deckId, input.classOf(deckId), input.track);
    tomorrowNew += Math.min(count, preset.newPerDay);
  }
  return { today, nextDueAt, tomorrowReviews, tomorrowNew };
}
