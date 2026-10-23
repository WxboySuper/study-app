/**
 * The math questions of a deck.
 *
 * A math question is answered by typing an expression on the math keyboard
 * of the game (no choices). Its spec says what the answer is:
 *
 * - `kind: 'expression'`: the answer is a value or an expression (`3x^2`,
 *   `x^3/3`, `pi/4`). Any algebraically equivalent answer is right.
 * - `kind: 'setup'`: the answer is the setup itself (`int(x^2, x, 0, 2)`):
 *   the integrand, the variable and the bounds are compared, not the value.
 *
 * A question may also walk through `steps`: every step is a small question
 * of its own, asked in order, and the question is right only when every step
 * is right.
 *
 * The spec is plain data: it is stored as it is (JSON) on the server and on
 * the phone. The grader lives in `mathGrade.ts`.
 */

/** What a math answer is compared as. */
export type MathAnswerKind = 'expression' | 'setup';

/** One step of a multi-step math question. */
export interface MathStep {
  /** The prompt of the step (it may hold KaTeX between `$`). */
  prompt: string;
  /** The accepted answers of the step (at least one). */
  answers: string[];
  /** What the answer of the step is compared as (`expression` by default). */
  kind: MathAnswerKind;
}

/** The math part of a math question. */
export interface MathSpec {
  /** What the final answer is compared as. */
  kind: MathAnswerKind;
  /**
   * The accepted final answers (the first one is shown).
   *
   * Empty when the question has steps and no answer of its own: the last
   * step is then the final answer (see {@link mathFinalAnswers}).
   */
  answers: string[];
  /** The steps, asked in order before the final answer (optional). */
  steps?: MathStep[];
  /**
   * `true` when the answer is an antiderivative (`+ C` is optional). It is
   * also turned on by itself when an answer holds `+ C`.
   */
  constant?: boolean;
}

/** At most this many steps in one question. */
export const MAX_MATH_STEPS = 8;
/** At most this many accepted answers for one question or step. */
export const MAX_MATH_ANSWERS = 8;
/** The longest answer expression. */
export const MAX_MATH_ANSWER_LENGTH = 300;

const MISSING = 'the answer is missing ("answer" or "answers").';

/** Reads a list of answers (`answer` or `answers`, a string or strings). */
function readAnswers(entry: Record<string, unknown>): string[] | string {
  const raw: unknown[] = Array.isArray(entry.answers)
    ? entry.answers
    : entry.answer !== undefined
      ? [entry.answer]
      : typeof entry.correct === 'string'
        ? [entry.correct]
        : [];
  const answers: string[] = [];
  for (const value of raw) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      answers.push(String(value));
    } else if (typeof value === 'string' && value.trim() !== '') {
      answers.push(value.trim());
    }
  }
  if (answers.length === 0) {
    return MISSING;
  }
  if (answers.length > MAX_MATH_ANSWERS) {
    return `at most ${MAX_MATH_ANSWERS} accepted answers.`;
  }
  if (answers.some((answer) => answer.length > MAX_MATH_ANSWER_LENGTH)) {
    return `an answer is longer than ${MAX_MATH_ANSWER_LENGTH} characters.`;
  }
  return [...new Set(answers)];
}

/** Reads the kind of an entry (`setup: true` or `kind: "setup"`). */
function readKind(entry: Record<string, unknown>): MathAnswerKind {
  return entry.setup === true || entry.kind === 'setup' ? 'setup' : 'expression';
}

/** `true` when an answer holds a `+ C` (an antiderivative). */
function hasConstant(answers: readonly string[]): boolean {
  return answers.some((answer) => /\+\s*C\s*$/.test(answer));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the math spec of a deck entry (`"type": "math"`).
 *
 * @returns the spec, or the message of what is wrong with it.
 */
export function readMathSpec(entry: Record<string, unknown>): MathSpec | string {
  // A question with steps may leave its own answer out: the last step is the
  // final answer then.
  const omitted =
    entry.answer === undefined &&
    (entry.answers === undefined || (Array.isArray(entry.answers) && entry.answers.length === 0)) &&
    entry.correct === undefined &&
    Array.isArray(entry.steps) &&
    entry.steps.length > 0;
  const answers = omitted ? [] : readAnswers(entry);
  if (typeof answers === 'string') {
    return answers === MISSING ? `${MISSING.slice(0, -1)} (or give "steps": the last step is the final answer).` : answers;
  }

  const spec: MathSpec = { kind: readKind(entry), answers };
  if (entry.constant === true || hasConstant(answers)) {
    spec.constant = true;
  }

  if (entry.steps !== undefined) {
    if (!Array.isArray(entry.steps)) {
      return '"steps" must be a list.';
    }
    if (entry.steps.length > MAX_MATH_STEPS) {
      return `at most ${MAX_MATH_STEPS} steps.`;
    }
    const steps: MathStep[] = [];
    for (const [index, raw] of entry.steps.entries()) {
      if (!isRecord(raw) || typeof raw.prompt !== 'string' || raw.prompt.trim() === '') {
        return `step ${index + 1} needs a "prompt".`;
      }
      const stepAnswers = readAnswers(raw);
      if (typeof stepAnswers === 'string') {
        return `step ${index + 1}: ${stepAnswers}`;
      }
      steps.push({ prompt: raw.prompt.trim(), answers: stepAnswers, kind: readKind(raw) });
    }
    if (steps.length > 0) {
      spec.steps = steps;
    }
  }

  return spec;
}

/**
 * The accepted final answers of a question: its own, or the last step's
 * when it has none.
 */
export function mathFinalAnswers(spec: MathSpec): string[] {
  if (spec.answers.length > 0) {
    return spec.answers;
  }
  return spec.steps?.[spec.steps.length - 1]?.answers ?? [];
}

/**
 * Reads a stored math spec back (from the server or the local store).
 *
 * Broken data never breaks the app: `undefined` when it cannot be read.
 */
export function parseStoredMathSpec(value: unknown): MathSpec | undefined {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!isRecord(raw)) {
    return undefined;
  }
  // The local store keeps `{ math: spec }` in `choices_json`.
  if (isRecord(raw.math)) {
    raw = raw.math;
  }
  const spec = readMathSpec(raw as Record<string, unknown>);
  return typeof spec === 'string' ? undefined : spec;
}

/** The spec as a deck entry writes it (for an edit that keeps the math). */
export function mathSpecToEntry(spec: MathSpec): Record<string, unknown> {
  return {
    type: 'math',
    ...(spec.answers.length === 0 ? {} : { answers: [...spec.answers] }),
    ...(spec.kind === 'setup' ? { setup: true } : {}),
    ...(spec.constant === true ? { constant: true } : {}),
    ...(spec.steps === undefined
      ? {}
      : {
          steps: spec.steps.map((step) => ({
            prompt: step.prompt,
            answers: [...step.answers],
            ...(step.kind === 'setup' ? { setup: true } : {}),
          })),
        }),
  };
}
