/**
 * The text buffer of the math keyboard: the typed answer and its cursor.
 *
 * The keyboard types the syntax the grader reads (`sqrt(`, `int(`, `diff(`).
 * A template key (`int(□, x)`) inserts its text and puts the cursor where the
 * player types next. Pure functions, so the player and the tests share them.
 */
export interface MathBuffer {
  /** The typed answer. */
  text: string;
  /** The cursor, an index into `text` (0 … text.length). */
  cursor: number;
}

/** An empty buffer. */
export const EMPTY_MATH_BUFFER: MathBuffer = { text: '', cursor: 0 };

/** The longest answer the keyboard types. */
export const MAX_MATH_INPUT = 300;

/**
 * Inserts a key at the cursor.
 *
 * `insert` may hold one `|`: the cursor lands there (and the `|` is not
 * typed). Without one, the cursor goes after the insert.
 */
export function mathInsert(buffer: MathBuffer, insert: string): MathBuffer {
  const at = insert.indexOf('|');
  const piece = at < 0 ? insert : insert.slice(0, at) + insert.slice(at + 1);
  if (buffer.text.length + piece.length > MAX_MATH_INPUT) {
    return buffer;
  }
  const cursor = clampCursor(buffer);
  const text = buffer.text.slice(0, cursor) + piece + buffer.text.slice(cursor);
  return { text, cursor: cursor + (at < 0 ? piece.length : at) };
}

/**
 * Deletes before the cursor.
 *
 * A function name (`sin(`, `sqrt(`, `int(`) goes as a whole, so a backspace
 * never leaves `si` behind.
 */
export function mathBackspace(buffer: MathBuffer): MathBuffer {
  const cursor = clampCursor(buffer);
  if (cursor === 0) {
    return { ...buffer, cursor };
  }
  const before = buffer.text.slice(0, cursor);
  const fn = /[A-Za-z]{2,}\($/.exec(before);
  const size = fn === null ? 1 : fn[0].length;
  return {
    text: before.slice(0, -size) + buffer.text.slice(cursor),
    cursor: cursor - size,
  };
}

/** Moves the cursor by `delta` characters. */
export function mathMove(buffer: MathBuffer, delta: number): MathBuffer {
  const cursor = Math.max(0, Math.min(buffer.text.length, clampCursor(buffer) + delta));
  return { ...buffer, cursor };
}

function clampCursor(buffer: MathBuffer): number {
  return Math.max(0, Math.min(buffer.text.length, buffer.cursor));
}
