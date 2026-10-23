import { describe, expect, it } from 'vitest';

import {
  compareMathAnswers,
  gradeMathAnswer,
  mathAnswerToTex,
  mathParts,
  normalizeMathInput,
  parseMathAnswer,
} from '../src/mathGrade';

const same = (expected: string, given: string, options = {}) =>
  compareMathAnswers(expected, given, options).correct;

describe('compareMathAnswers', () => {
  it.each([
    ['3x^2', '3*x^2'],
    ['3x^2', 'x^2*3'],
    ['2sin(x)cos(x)', 'sin(2x)'],
    ['1/(x+1)', '(x+1)^(-1)'],
    ['sqrt(x)', 'x^(1/2)'],
    ['ln(x^2)', '2ln(x)'],
    ['8/3', 'int(x^2, x, 0, 2)'],
    ['2x', 'diff(x^2, x)'],
    ['2xy', 'pdiff(x^2 y, x)'],
    ['pi/4', 'atan(1)'],
    ['pi/4', 'arctan(1)'],
    ['e^x', 'exp(x)'],
    ['xy', 'x*y'],
    ['x(x+1)', 'x^2+x'],
    ['4', '2+2'],
    ['1/2', '0.5'],
    ['sec(x)^2', '1/cos(x)^2'],
    ['3x^2', '3x²'.replace('²', '^2')],
    ['3x^2', '3×x^2'],
    ['-1', '−1'],
    ['2pi', '2π'],
    ['log(100)', '2'],
    ['log(8, 2)', '3'],
  ])('accepts %s = %s', (expected, given) => {
    expect(same(expected, given)).toBe(true);
  });

  it.each([
    ['3x^2', '3x^3'],
    ['ln(x)', 'log(x)'],
    ['3x^2', '3t^2'],
    ['1/2', '0.50001'],
    ['x', 'sqrt(x^2)'],
  ])('rejects %s ≠ %s', (expected, given) => {
    expect(same(expected, given)).toBe(false);
  });

  it('is + C tolerant for antiderivatives', () => {
    expect(same('x^2/2 + C', 'x^2/2')).toBe(true);
    expect(same('x^2/2 + C', 'x^2/2 + 5')).toBe(true);
    expect(same('x^2/2 + C', 'x^2/2 + C')).toBe(true);
    expect(same('-cos(x) + C', '1 - cos(x)')).toBe(true);
    expect(same('x^2/2 + C', 'x^2')).toBe(false);
    expect(same('sin(x)^2', '-cos(x)^2', { constant: true })).toBe(true);
  });

  it('compares setups by their structure', () => {
    const setup = { kind: 'setup' as const };
    expect(same('int(x^2, x, 0, 2)', 'int(x*x, x, 0, 2)', setup)).toBe(true);
    expect(same('int(x^2, x, 0, 2)', '(int(x^2, x, 0, 4/2))', setup)).toBe(true);
    expect(same('int(x^2, x, 0, 2)', 'int(x^2, x, 0, 3)', setup)).toBe(false);
    expect(same('int(x^2, x, 0, 2)', '8/3', setup)).toBe(false);
    expect(same('int(x^2, x, 0, 2)', 'int(x^2, t, 0, 2)', setup)).toBe(false);
    expect(same('int(x^2, x, 0, 2)', 'int(x^2, x)', setup)).toBe(false);
    expect(same('int(x^2, x, 0, 2)', 'diff(x^2, x)', setup)).toBe(false);
    expect(same('diff(x^3, x)', 'diff(x*x^2, x)', setup)).toBe(true);
    expect(same('pdiff(x^2 y, x)', 'pdiff(y x^2, x)', setup)).toBe(true);
    expect(same('int(1, x, 0, 1) + int(x, x, 1, 2)', 'int(1, x, 0, 1) + int(x, x, 1, 2)', setup)).toBe(true);
    expect(same('int(1, x, 0, 1) + int(x, x, 1, 2)', 'int(1, x, 0, 1) - int(x, x, 1, 2)', setup)).toBe(false);
    expect(same('int(x, x, 0, 1) + 1', '1 + 1', setup)).toBe(false);
    expect(same('2', '1+1', setup)).toBe(true);
  });

  it('compares indefinite integrals by structure', () => {
    expect(same('int(sin(x), x)', 'int(sin(x), x)')).toBe(true);
    expect(same('int(sin(x), x)', 'int(cos(x), x)')).toBe(false);
  });

  it('flags answers that cannot be read', () => {
    expect(compareMathAnswers('1', '3x^2+')).toEqual({ correct: false, invalid: true });
    expect(compareMathAnswers('1', '')).toEqual({ correct: false, invalid: true });
    expect(compareMathAnswers('1', 'foo(2, 3)')).toEqual({ correct: false, invalid: true });
    expect(compareMathAnswers('((', '1')).toEqual({ correct: false, invalid: false });
    expect(same('1', 'int(x)')).toBe(false);
    expect(same('1', 'int(x, x, 0, y/0)')).toBe(false);
    expect(same('1', 'diff(x)')).toBe(false);
    expect(same('sqrt(-1-x^2)', '0')).toBe(false);
  });
});

describe('gradeMathAnswer', () => {
  it('accepts any accepted answer', () => {
    expect(gradeMathAnswer(['x^2', 'y'], 'y').correct).toBe(true);
    expect(gradeMathAnswer(['x^2', 'y'], 'z')).toEqual({ correct: false, invalid: false });
    expect(gradeMathAnswer(['x^2'], ')')).toEqual({ correct: false, invalid: true });
  });
});

describe('mathParts', () => {
  it('asks the steps, then the final answer', () => {
    expect(
      mathParts({
        kind: 'expression',
        answers: ['4/3'],
        steps: [
          { prompt: 'Set up', answers: ['int(2x - x^2, x, 0, 2)'], kind: 'setup' },
          { prompt: 'Antiderivative', answers: ['x^2 - x^3/3 + C'], kind: 'expression' },
        ],
      }),
    ).toEqual([
      { prompt: 'Set up', answers: ['int(2x - x^2, x, 0, 2)'], kind: 'setup', constant: false },
      { prompt: 'Antiderivative', answers: ['x^2 - x^3/3 + C'], kind: 'expression', constant: true },
      { prompt: null, answers: ['4/3'], kind: 'expression', constant: false },
    ]);
    expect(mathParts({ kind: 'setup', answers: ['a'], constant: true })).toEqual([
      { prompt: null, answers: ['a'], kind: 'setup', constant: true },
    ]);
  });
});

describe('the preview', () => {
  it('renders the keyboard syntax as LaTeX', () => {
    expect(mathAnswerToTex('int(x^2, x, 0, 2)')).toContain('\\int_{0}^{2}');
    expect(mathAnswerToTex('int(x^2, x)')).toContain('\\int');
    expect(mathAnswerToTex('diff(sin(x), x)')).toContain('\\frac{d}{d');
    expect(mathAnswerToTex('pdiff(x^2 y, x)')).toContain('\\partial');
    expect(mathAnswerToTex('ln(x)')).toContain('\\ln');
    expect(mathAnswerToTex('log(x)')).toContain('\\log');
    expect(mathAnswerToTex('3x^2 + C')).toMatch(/\+ C$/);
    expect(mathAnswerToTex('sqrt(x')).toContain('\\sqrt');
    expect(mathAnswerToTex('x^')).not.toBeNull();
    expect(mathAnswerToTex('')).toBe('');
    expect(mathAnswerToTex('+ C')).toBe('C');
    expect(mathAnswerToTex(')(')).toBeNull();
  });

  it('normalizes the symbols of the keyboard', () => {
    expect(normalizeMathInput(' 2×π÷√x − 1 ')).toBe('2*pi/sqrtx - 1');
    expect(parseMathAnswer('')).toBeNull();
    expect(parseMathAnswer('x**2')?.toString()).toBe('x ^ 2');
  });

  it('asks the steps alone when the last step is the final answer', () => {
    const parts = mathParts({
      kind: 'expression',
      answers: [],
      steps: [
        { prompt: 'u', answers: ['x^2'], kind: 'expression' },
        { prompt: 'Integrate', answers: ['sin(x^2) + C'], kind: 'expression' },
      ],
    });
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({ prompt: 'Integrate', constant: true });
  });
});
