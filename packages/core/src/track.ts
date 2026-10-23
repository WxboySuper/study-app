/**
 * Question tracks: multiple choice and math are played apart.
 *
 * Multiple choice is the core of the app: fast taps, many questions. Math is
 * slower (the player works the problem out and types the answer), so it has
 * its own section, its own Mastery limits and its own daily queue. A session
 * only ever plays the questions of one track.
 *
 * Mixed decks are split by question type: the multiple-choice questions of
 * a deck play in the multiple-choice section, its math questions in the Math
 * section. A deck shows up in a section when it has questions of that track.
 */

/** The track of a question. */
export type QuestionTrack = 'mc' | 'math';

/** The tracks, in the order of the home tabs. */
export const QUESTION_TRACKS: readonly QuestionTrack[] = ['mc', 'math'];

/** The track of a question: math when it is a math question. */
export function trackOf(question: { type?: string; math?: unknown }): QuestionTrack {
  return question.type === 'math' || (question.math !== undefined && question.math !== null)
    ? 'math'
    : 'mc';
}

/** The questions of one track. */
export function filterByTrack<T extends { type?: string; math?: unknown }>(
  questions: readonly T[],
  track: QuestionTrack,
): T[] {
  return questions.filter((question) => trackOf(question) === track);
}

/** Parses a track from a route param (anything else is multiple choice). */
export function parseTrack(value: unknown): QuestionTrack {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'math' ? 'math' : 'mc';
}
