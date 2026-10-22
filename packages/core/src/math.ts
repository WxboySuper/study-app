/**
 * The splitter of the math of a question.
 *
 * A question may carry LaTeX: `$x^2$` (inline) and `$$x^2$$` (block). The
 * splitter cuts a text into plain parts and math parts, so the app can show
 * the plain parts as text and the math parts with KaTeX.
 *
 * The rules are deliberately forgiving, because a question is written by
 * hand:
 *
 * - `$$...$$` is a block of math, `$...$` is math inside a line;
 * - `\$` is a literal dollar sign (the escape of a currency amount);
 * - a `$` that is never closed is a literal dollar sign: the text is not
 *   math, it is a price;
 * - a `$` that is closed on another line is a literal dollar sign too: math
 *   never spans two lines.
 *
 * The splitter is pure: the same text always gives the same parts.
 */

/** What a part of a text is. */
export type MathSegmentType = 'text' | 'math';

/** One part of a text: plain text or a piece of LaTeX. */
export interface MathSegment {
  /** `text` for plain text, `math` for LaTeX. */
  type: MathSegmentType;
  /**
   * The content of the part.
   *
   * For a math part it is the LaTeX source, without the `$` signs. For a
   * text part it is the plain text, with the escaped dollar signs (`\$`)
   * turned back into `$`.
   */
  value: string;
  /** `true` for a block of math (`$$...$$`), `false` for inline math. */
  block: boolean;
}

/**
 * Splits a text into plain parts and math parts.
 *
 * The parts always cover the whole text, in order, and there is never an
 * empty part.
 *
 * @param text The text of a question or of an answer.
 */
export function splitMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let buffer = '';

  const flush = (): void => {
    if (buffer !== '') {
      segments.push({ type: 'text', value: buffer, block: false });
      buffer = '';
    }
  };

  let index = 0;

  while (index < text.length) {
    const char = text[index];

    // An escaped dollar sign is a literal dollar sign.
    if (char === '\\' && text[index + 1] === '$') {
      buffer += '$';
      index += 2;
      continue;
    }

    if (char !== '$') {
      buffer += char;
      index += 1;
      continue;
    }

    // A block of math: `$$...$$`.
    if (text[index + 1] === '$') {
      const end = text.indexOf('$$', index + 2);
      if (end > index + 2) {
        flush();
        segments.push({ type: 'math', value: text.slice(index + 2, end), block: true });
        index = end + 2;
        continue;
      }
      // An empty or unfinished block is plain text.
      buffer += '$$';
      index += 2;
      continue;
    }

    // Math inside a line: `$...$`.
    const end = findInlineEnd(text, index + 1);
    if (end > index + 1) {
      flush();
      segments.push({ type: 'math', value: text.slice(index + 1, end), block: false });
      index = end + 1;
      continue;
    }

    // A dollar sign that is never closed is a dollar sign.
    buffer += '$';
    index += 1;
  }

  flush();

  return segments;
}

/**
 * Finds the `$` that closes an inline math.
 *
 * The math cannot span two lines and cannot hold an escaped dollar sign.
 *
 * @return The index of the closing `$`, or `-1` when there is none.
 */
function findInlineEnd(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];

    if (char === '\n') {
      return -1;
    }

    if (char === '\\') {
      // An escaped character is part of the math.
      index += 1;
      continue;
    }

    if (char === '$') {
      // `$$` belongs to a block of math, not to an inline math.
      if (text[index + 1] === '$') {
        return -1;
      }
      return index;
    }
  }

  return -1;
}

/**
 * `true` when the text holds math.
 *
 * The app uses it to decide whether a question needs the math renderer at
 * all (a plain question never touches KaTeX).
 */
export function hasMath(text: string): boolean {
  return splitMathSegments(text).some((segment) => segment.type === 'math');
}

/**
 * The plain text of a text: the math is dropped and the escaped dollar
 * signs are turned back into `$`.
 *
 * It is used to measure how long an answer is (the buttons of the game
 * shrink their font when the answer is long).
 */
export function plainText(text: string): string {
  return splitMathSegments(text)
    .filter((segment) => segment.type === 'text')
    .map((segment) => segment.value)
    .join('');
}

/**
 * The LaTeX of a text: every math part, in order.
 *
 * It is used to measure how much math a question holds.
 */
export function mathSources(text: string): string[] {
  return splitMathSegments(text)
    .filter((segment) => segment.type === 'math')
    .map((segment) => segment.value);
}
