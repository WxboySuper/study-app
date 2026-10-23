/**
 * The grader of the math questions.
 *
 * The answers are expressions in the syntax of the math keyboard
 * (docs/DECK-FORMAT.md "Math questions"): `3x^2`, `sqrt(x)`, `ln(x)`,
 * `int(f, x, a, b)`, `diff(f, x)`, `pdiff(f, x)`, `+ C`. They are read by
 * mathjs (open source, pure JavaScript, so it runs on Hermes and on the web).
 *
 * Two answers are the same answer when:
 *
 * 1. mathjs simplifies their difference to `0` (algebraic equivalence), or
 * 2. they agree at random points (numeric sampling, the fallback). The
 *    points come from a seeded generator, so a grade never changes.
 *
 * An antiderivative is `+ C` tolerant: the two answers may differ by a
 * constant. A setup answer is compared by its structure: the same operator
 * (`int`, `diff`, `pdiff`), the same variable, the same bounds and an
 * equivalent integrand.
 */

import { all, create, type FactoryFunctionMap, type MathNode } from 'mathjs';

import type { MathAnswerKind, MathSpec } from './mathQuestion';

const math = create(all as FactoryFunctionMap, {});

/** The names that are not variables. */
const CONSTANTS = new Set(['pi', 'e', 'i', 'Infinity']);

/** The functions the keyboard knows (anything else is a product of letters). */
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'sqrt', 'cbrt', 'abs', 'ln', 'log', 'exp', 'int', 'diff', 'pdiff',
]);

/** The operators of a setup answer. */
const SETUP_OPERATORS = new Set(['int', 'diff', 'pdiff']);

/** The result of a grade. */
export interface MathGrade {
  /** `true` when the answer is right. */
  correct: boolean;
  /** `true` when the answer could not be read at all. */
  invalid: boolean;
}

/** The options of a comparison. */
export interface MathCompareOptions {
  /** What the answer is compared as. */
  kind?: MathAnswerKind;
  /** `true` when the answers may differ by a constant (`+ C`). */
  constant?: boolean;
}

/** Turns the symbols of the keyboard (and the pasted Unicode) into ASCII. */
export function normalizeMathInput(input: string): string {
  return input
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/∞/g, 'Infinity')
    .replace(/\*\*/g, '^')
    .trim();
}

/** Strips a `+ C` at the end of an answer. */
function stripConstant(input: string): { text: string; constant: boolean } {
  const match = /\+\s*C\s*$/.exec(input);
  if (match === null) {
    return { text: input, constant: false };
  }
  return { text: input.slice(0, match.index).trim(), constant: true };
}

/** Appends the parentheses a half-typed answer is missing. */
function closeParens(input: string): string {
  let depth = 0;
  for (const char of input) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
  }
  return input + ')'.repeat(depth);
}

/** Splits a run of letters (`xy`) into a product of single letters. */
function splitSymbol(name: string): MathNode {
  const letters = [...name].map((letter) => new math.SymbolNode(letter) as MathNode);
  return letters.reduce((product, letter) => new math.OperatorNode('*', 'multiply', [product, letter]));
}

/**
 * Reads an answer into a tree, in the rules of the keyboard.
 *
 * @returns `null` when the answer cannot be read.
 */
export function parseMathAnswer(input: string): MathNode | null {
  const text = normalizeMathInput(input);
  if (text === '') {
    return null;
  }
  let node: MathNode;
  try {
    node = math.parse(text);
  } catch {
    return null;
  }
  try {
    return node.transform((child: MathNode) => {
      if (math.isFunctionNode(child)) {
        const name = math.isSymbolNode(child.fn) ? child.fn.name : '';
        const args = child.args;
        if (name === 'ln') {
          return new math.FunctionNode('log', args);
        }
        if (name === 'log' && args.length === 1) {
          return new math.FunctionNode('log10', args);
        }
        if (name === 'arcsin' || name === 'arccos' || name === 'arctan') {
          return new math.FunctionNode(name.replace('arc', 'a'), args);
        }
        if (!FUNCTIONS.has(name)) {
          // `x(x+1)` is a product, not a function.
          if (name.length >= 1 && /^[a-zA-Z]+$/.test(name) && args.length === 1) {
            return new math.OperatorNode('*', 'multiply', [
              splitSymbol(name),
              new math.ParenthesisNode(args[0] as MathNode),
            ]);
          }
          throw new Error(`unknown function ${name}`);
        }
        return child;
      }
      if (math.isSymbolNode(child) && !CONSTANTS.has(child.name) && child.name.length > 1 && !FUNCTIONS.has(child.name)) {
        return splitSymbol(child.name);
      }
      return child;
    });
  } catch {
    return null;
  }
}

/** The variables of a tree (the letters that are not constants). */
function variablesOf(node: MathNode): string[] {
  const names = new Set<string>();
  node.traverse((child: MathNode, _path: string, parent: MathNode | null) => {
    if (!math.isSymbolNode(child) || CONSTANTS.has(child.name)) {
      return;
    }
    if (parent !== null && math.isFunctionNode(parent) && parent.fn === child) {
      return;
    }
    names.add(child.name);
  });
  return [...names].sort();
}

/** A seeded generator (mulberry32): the same answer always gets the same points. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The hash of a text (the seed of the points). */
function hashOf(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type Scope = Record<string, number>;

/** The value of a tree at a point (`NaN` when it has none there). */
function valueAt(node: MathNode, scope: Scope): number {
  const evaluated = evaluateNode(node, scope);
  return typeof evaluated === 'number' && Number.isFinite(evaluated) ? evaluated : Number.NaN;
}

/** Simpson's rule for a definite integral. */
function simpson(f: (x: number) => number, a: number, b: number): number {
  const steps = 200;
  const h = (b - a) / steps;
  let sum = f(a) + f(b);
  for (let index = 1; index < steps; index += 1) {
    sum += (index % 2 === 1 ? 4 : 2) * f(a + index * h);
  }
  return (sum * h) / 3;
}

/** The variable named by the second argument of `int`, `diff` or `pdiff`. */
function variableArg(node: MathNode | undefined): string | null {
  return node !== undefined && math.isSymbolNode(node) ? node.name : null;
}

/** Evaluates a tree, with `int`, `diff` and `pdiff` done by the grader. */
function evaluateNode(node: MathNode, scope: Scope): unknown {
  if (math.isFunctionNode(node) && math.isSymbolNode(node.fn) && SETUP_OPERATORS.has(node.fn.name)) {
    const [body, variableNode, lower, upper] = node.args;
    const variable = variableArg(variableNode);
    if (body === undefined || variable === null) {
      return Number.NaN;
    }
    if (node.fn.name === 'int') {
      if (lower === undefined || upper === undefined) {
        // An indefinite integral has no value: it is compared by structure.
        return Number.NaN;
      }
      const a = valueAt(lower, scope);
      const b = valueAt(upper, scope);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return Number.NaN;
      }
      return simpson((x) => valueAt(body, { ...scope, [variable]: x }), a, b);
    }
    try {
      const derivative = math.derivative(resolveOperators(body, scope), variable);
      return valueAt(derivative, scope);
    } catch {
      return Number.NaN;
    }
  }
  if (containsOperator(node)) {
    // A tree with an operator inside: the operator is replaced by its value.
    return evaluateNode(resolveOperators(node, scope), scope);
  }
  try {
    return node.evaluate({ ...scope }) as unknown;
  } catch {
    return Number.NaN;
  }
}

/** `true` when a tree holds `int`, `diff` or `pdiff`. */
function containsOperator(node: MathNode): boolean {
  return node.filter((child: MathNode) => isOperatorCall(child)).length > 0;
}

function isOperatorCall(node: MathNode): boolean {
  return math.isFunctionNode(node) && math.isSymbolNode(node.fn) && SETUP_OPERATORS.has(node.fn.name);
}

/**
 * Replaces the operators of a tree: a `diff` becomes its derivative (still a
 * tree), a definite `int` becomes its value at the point.
 */
function resolveOperators(node: MathNode, scope: Scope): MathNode {
  return node.transform((child: MathNode) => {
    if (!isOperatorCall(child) || !math.isFunctionNode(child) || !math.isSymbolNode(child.fn)) {
      return child;
    }
    const [body, variableNode] = child.args;
    const variable = variableArg(variableNode);
    if (child.fn.name !== 'int' && body !== undefined && variable !== null) {
      try {
        return math.derivative(resolveOperators(body, scope), variable);
      } catch {
        return new math.ConstantNode(Number.NaN);
      }
    }
    return new math.ConstantNode(valueAt(child, scope));
  });
}

/** `true` when two numbers are the same (relative tolerance). */
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** How many points the sampling tries, and how many it needs. */
const SAMPLE_POINTS = 12;
const SAMPLE_ATTEMPTS = 60;
const SAMPLE_NEEDED = 4;

/** Compares two trees at random points. */
function sameBySampling(expected: MathNode, given: MathNode, constant: boolean): boolean {
  const variables = [...new Set([...variablesOf(expected), ...variablesOf(given)])];
  const random = seededRandom(hashOf(`${expected.toString()}|${given.toString()}`));
  const differences: number[] = [];
  // The points where only the expected answer has a value (`2ln(x)` for
  // `ln(x^2)` at a negative x): a few are fine, most are not.
  let misses = 0;

  for (let attempt = 0; attempt < SAMPLE_ATTEMPTS && differences.length < SAMPLE_POINTS; attempt += 1) {
    const scope: Scope = {};
    for (const name of variables) {
      // Half of the points are positive (sqrt and ln live there).
      scope[name] = attempt % 2 === 0 ? 0.1 + random() * 2.9 : -3 + random() * 6;
    }
    const want = valueAt(expected, scope);
    if (!Number.isFinite(want)) {
      continue;
    }
    const got = valueAt(given, scope);
    if (!Number.isFinite(got)) {
      misses += 1;
      continue;
    }
    if (!constant && !close(want, got)) {
      return false;
    }
    differences.push(got - want);
  }

  if (differences.length < SAMPLE_NEEDED || misses > 2 * differences.length) {
    return false;
  }
  if (constant) {
    const first = differences[0] as number;
    return differences.every((difference) => close(difference, first));
  }
  return true;
}

/** `true` when mathjs simplifies the difference of two trees to 0. */
function sameBySimplify(expected: MathNode, given: MathNode): boolean {
  if (containsOperator(expected) || containsOperator(given)) {
    return false;
  }
  try {
    const difference = math.simplify(new math.OperatorNode('-', 'subtract', [
      new math.ParenthesisNode(expected),
      new math.ParenthesisNode(given),
    ]));
    return math.isConstantNode(difference) && difference.value === 0;
  } catch {
    return false;
  }
}

/** Removes the parentheses around a tree. */
function unwrap(node: MathNode): MathNode {
  let current = node;
  while (math.isParenthesisNode(current)) {
    current = current.content;
  }
  return current;
}

/** Compares two setup answers by their structure. */
function sameSetup(expected: MathNode, given: MathNode): boolean {
  const want = unwrap(expected);
  const got = unwrap(given);
  if (!isOperatorCall(want) || !isOperatorCall(got)) {
    // A setup without an operator is an expression.
    if (!containsOperator(want) && !containsOperator(got)) {
      return sameExpression(want, got, false);
    }
    // A setup that is not one operator (a sum of integrals, say): every
    // part is compared in order.
    if (want.type !== got.type) {
      return false;
    }
    if (math.isOperatorNode(want) && math.isOperatorNode(got)) {
      if (want.fn !== got.fn || want.args.length !== got.args.length) {
        return false;
      }
      return want.args.every((arg, index) => sameSetup(arg, got.args[index] as MathNode));
    }
    return sameExpression(want, got, false);
  }
  if (!math.isFunctionNode(want) || !math.isFunctionNode(got)) {
    return false;
  }
  const wantName = math.isSymbolNode(want.fn) ? want.fn.name : '';
  const gotName = math.isSymbolNode(got.fn) ? got.fn.name : '';
  if (wantName !== gotName || want.args.length !== got.args.length) {
    return false;
  }
  const [wantBody, wantVariable, ...wantBounds] = want.args;
  const [gotBody, gotVariable, ...gotBounds] = got.args;
  const variable = variableArg(wantVariable);
  if (variable === null || variable !== variableArg(gotVariable)) {
    return false;
  }
  for (const [index, bound] of wantBounds.entries()) {
    const other = gotBounds[index];
    if (other === undefined || !sameExpression(bound, other, false)) {
      return false;
    }
  }
  return wantBody !== undefined && gotBody !== undefined && sameExpression(wantBody, gotBody, false);
}

/** Compares two expression trees. */
function sameExpression(expected: MathNode, given: MathNode, constant: boolean): boolean {
  // Two indefinite integrals are compared by their structure.
  if (hasIndefiniteIntegral(expected) || hasIndefiniteIntegral(given)) {
    return sameSetup(expected, given);
  }
  if (!constant && sameBySimplify(expected, given)) {
    return true;
  }
  return sameBySampling(expected, given, constant);
}

function hasIndefiniteIntegral(node: MathNode): boolean {
  return (
    node.filter(
      (child: MathNode) =>
        math.isFunctionNode(child) &&
        math.isSymbolNode(child.fn) &&
        child.fn.name === 'int' &&
        child.args.length < 4,
    ).length > 0
  );
}

/**
 * Compares an answer with one accepted answer.
 */
export function compareMathAnswers(
  expected: string,
  given: string,
  options: MathCompareOptions = {},
): MathGrade {
  const want = stripConstant(normalizeMathInput(expected));
  const got = stripConstant(normalizeMathInput(given));
  const wantNode = parseMathAnswer(want.text);
  const gotNode = parseMathAnswer(got.text);
  if (gotNode === null) {
    return { correct: false, invalid: true };
  }
  if (wantNode === null) {
    return { correct: false, invalid: false };
  }
  const constant = options.constant === true || want.constant;
  const correct =
    options.kind === 'setup'
      ? sameSetup(wantNode, gotNode)
      : sameExpression(wantNode, gotNode, constant);
  return { correct, invalid: false };
}

/** Grades an answer against the accepted answers of a question or a step. */
export function gradeMathAnswer(
  answers: readonly string[],
  given: string,
  options: MathCompareOptions = {},
): MathGrade {
  let invalid = true;
  for (const answer of answers) {
    const grade = compareMathAnswers(answer, given, options);
    if (grade.correct) {
      return grade;
    }
    invalid = invalid && grade.invalid;
  }
  return { correct: false, invalid };
}

/** One part of a math question: a step or the final answer. */
export interface MathPart {
  /** The prompt of the part (`null` for the final answer: the question is the prompt). */
  prompt: string | null;
  /** The accepted answers. */
  answers: string[];
  /** What the answer is compared as. */
  kind: MathAnswerKind;
  /** `+ C` tolerant. */
  constant: boolean;
}

/** The parts of a math question, in the order they are asked. */
export function mathParts(spec: MathSpec): MathPart[] {
  const steps = (spec.steps ?? []).map((step) => ({
    prompt: step.prompt,
    answers: step.answers,
    kind: step.kind,
    constant: step.answers.some((answer) => /\+\s*C\s*$/.test(answer)),
  }));
  return [
    ...steps,
    { prompt: null, answers: spec.answers, kind: spec.kind, constant: spec.constant === true },
  ];
}

/** The LaTeX of `int`, `diff` and `pdiff` (and of `ln`) for the preview. */
function texHandler(node: MathNode, options: object): string | undefined {
  if (!math.isFunctionNode(node) || !math.isSymbolNode(node.fn)) {
    return undefined;
  }
  const tex = (child: MathNode | undefined): string => (child === undefined ? '\\square' : child.toTex(options));
  const [body, variable, lower, upper] = node.args;
  const name = node.fn.name;
  const v = variable === undefined ? 'x' : tex(variable);
  if (name === 'int') {
    const bounds = lower === undefined ? '' : `_{${tex(lower)}}^{${tex(upper)}}`;
    return `\\int${bounds} ${tex(body)}\\,d${v}`;
  }
  if (name === 'diff') {
    return `\\frac{d}{d${v}}\\left(${tex(body)}\\right)`;
  }
  if (name === 'pdiff') {
    return `\\frac{\\partial}{\\partial ${v}}\\left(${tex(body)}\\right)`;
  }
  if (name === 'log' && node.args.length === 1) {
    return `\\ln\\left(${tex(body)}\\right)`;
  }
  if (name === 'log10') {
    return `\\log\\left(${tex(body)}\\right)`;
  }
  return undefined;
}

/**
 * The LaTeX of a (possibly half-typed) answer, for the live preview.
 *
 * @returns `null` when the answer cannot be read yet.
 */
export function mathAnswerToTex(input: string): string | null {
  const { text, constant } = stripConstant(normalizeMathInput(input));
  if (text === '') {
    return constant ? 'C' : '';
  }
  const node = parseMathAnswer(closeParens(text.replace(/[+\-*/^,(]\s*$/, '')));
  if (node === null) {
    return null;
  }
  try {
    const tex = node.toTex({ handler: texHandler, implicit: 'hide', parenthesis: 'keep' });
    return constant ? `${tex} + C` : tex;
  } catch {
    return null;
  }
}
