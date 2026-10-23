/**
 * The parser of the imported decks.
 *
 * A player (or an AI assistant) hands the app a blob of text: a JSON deck, a
 * TSV paste or a list of `question :: correct :: wrong1 :: wrong2` lines. The
 * parser turns that blob into a deck the app can store, and tells the player
 * what it could not read.
 *
 * Every question carries its OWN wrong answers (Blooket style): the app
 * never borrows the answers of the other cards of the deck. A card without
 * wrong answers is imported as a self-graded card.
 *
 * The rules are deliberately forgiving (comments, blank lines, spaces around
 * the separator) and strict where it matters (no empty sides, no duplicates,
 * at most 3 wrong answers, no more than {@link MAX_IMPORT_CARDS} cards).
 */

import { MAX_WRONG_ANSWERS } from './choices';
import { readMathSpec, type MathSpec } from './mathQuestion';

/** The formats an imported deck can have. */
export type DeckFormat = 'json' | 'tsv' | 'double-colon' | 'pipe';

/** One card of an imported deck. */
export interface ImportCard {
  /** The question of the card. */
  front: string;
  /** The correct answer of the card. */
  back: string;
  /** The wrong answers the author wrote for this card (0 to 3). */
  wrong: string[];
  /**
   * The id the author gave the question (JSON decks only, optional). The
   * server keys the question with it, so an edit keeps the progress.
   */
  id?: string;
  /**
   * The math part of a math question (`"type": "math"`). A math question is
   * answered on the math keyboard; `back` holds its first answer.
   */
  math?: MathSpec;
}

/** How many cards of a deck are asked as a multiple choice question. */
export interface DeckCounts {
  /** Every card of the deck. */
  total: number;
  /** The cards that have at least one wrong answer. */
  multipleChoice: number;
  /** The cards without wrong answers (they are self-graded). */
  selfGrade: number;
  /** The math questions (typed on the math keyboard). */
  math: number;
}

/** The result of parsing an imported deck. */
export interface ParsedDeck {
  /** The name of the deck (the one of the file, or the fallback). */
  name: string;
  /** The cards that could be read. */
  cards: ImportCard[];
  /** The format the deck was written in. */
  format: DeckFormat;
  /** How many cards are multiple choice and how many are self-graded. */
  counts: DeckCounts;
  /** What could not be read, one line per problem. */
  errors: string[];
}

/** The biggest deck the app imports. */
export const MAX_IMPORT_CARDS = 2000;

/**
 * Parses a pasted deck.
 *
 * The format is detected: a text that starts with `{` is JSON, everything
 * else is a line per card. The separator of the lines is detected on the
 * first card line and used for the whole deck.
 *
 * @param text The pasted text.
 * @param fallbackName The name of the deck when the text does not carry one.
 */
export function parseDeck(text: string, fallbackName: string): ParsedDeck {
  const trimmed = text.trim();

  if (trimmed === '') {
    return {
      name: fallbackName,
      cards: [],
      format: 'tsv',
      counts: emptyCounts(),
      errors: ['Nothing to import: the text is empty.'],
    };
  }

  if (trimmed.startsWith('{')) {
    return parseJsonDeck(trimmed, fallbackName);
  }

  return parseTextDeck(trimmed, fallbackName);
}

/**
 * Parses a JSON deck.
 *
 * Three shapes are accepted:
 *
 * - `{"name": "..", "questions": [{"question": "..", "correct": "..", "wrong": [".."]}]}`
 * - the Blooket shape: `{"question": "..", "answers": ["a", "b", "c", "d"], "correct": 0}`
 * - the legacy shape: `{"name": "..", "cards": [{"front": "..", "back": ".."}]}`
 */
function parseJsonDeck(text: string, fallbackName: string): ParsedDeck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      name: fallbackName,
      cards: [],
      format: 'json',
      counts: emptyCounts(),
      errors: [`The deck is not valid JSON: ${messageOf(error)}`],
    };
  }

  if (!isRecord(raw)) {
    return {
      name: fallbackName,
      cards: [],
      format: 'json',
      counts: emptyCounts(),
      errors: ['A JSON deck must be an object with a "questions" list.'],
    };
  }

  const name =
    typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : fallbackName;

  const list = Array.isArray(raw.questions)
    ? raw.questions
    : Array.isArray(raw.cards)
      ? raw.cards
      : null;

  if (list === null) {
    return {
      name,
      cards: [],
      format: 'json',
      counts: emptyCounts(),
      errors: ['A JSON deck must have a "questions" list (or the legacy "cards" list).'],
    };
  }

  const errors: string[] = [];
  const cards: ImportCard[] = [];
  const seen = new Set<string>();

  list.forEach((entry, index) => {
    const number = index + 1;
    const parsed = parseJsonEntry(entry, number);

    if (parsed.card === undefined) {
      errors.push(parsed.error ?? `Question ${number}: it could not be read.`);
      return;
    }

    if (isRecord(entry) && typeof entry.id === 'string' && entry.id.trim() !== '') {
      parsed.card.id = entry.id.trim();
    }

    const key = cardKey(parsed.card.front, parsed.card.back);
    if (seen.has(key)) {
      return;
    }

    if (cards.length >= MAX_IMPORT_CARDS) {
      return;
    }

    seen.add(key);
    cards.push(parsed.card);
  });

  if (list.length > MAX_IMPORT_CARDS) {
    errors.push(`Only the first ${MAX_IMPORT_CARDS} questions were imported.`);
  }

  return { name, cards, format: 'json', counts: countsOf(cards), errors };
}

/**
 * Reads one entry of a JSON deck.
 *
 * The entry is either a question with its own answers (the native shape or
 * the Blooket shape) or a legacy `front`/`back` card.
 */
function parseJsonEntry(
  entry: unknown,
  number: number,
): { card?: ImportCard; error?: string } {
  if (!isRecord(entry)) {
    return { error: `Question ${number}: it must be an object.` };
  }

  // The legacy shape: a card with a front and a back, and no wrong answers.
  if (typeof entry.front === 'string' || typeof entry.back === 'string') {
    const front = typeof entry.front === 'string' ? entry.front.trim() : '';
    const back = typeof entry.back === 'string' ? entry.back.trim() : '';
    if (front === '' || back === '') {
      return { error: `Question ${number}: the front and the back are both needed.` };
    }
    return { card: { front, back, wrong: [] } };
  }

  if (entry.type === 'math') {
    return parseMathEntry(entry, number);
  }

  if (typeof entry.question !== 'string') {
    return { error: `Question ${number}: it needs a "question" (or a "front").` };
  }

  const question = entry.question.trim();
  if (question === '') {
    return { error: `Question ${number}: the question is missing.` };
  }

  // The Blooket shape: the answers of the question and the index of the
  // right one (the answer itself is accepted too).
  if (Array.isArray(entry.answers)) {
    const answers = entry.answers
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value !== '');

    if (answers.length === 0) {
      return { error: `Question ${number}: the answers are missing.` };
    }

    const correct = entry.correct;

    if (typeof correct === 'number') {
      const index = Math.floor(correct);
      if (index < 0 || index >= answers.length) {
        return { error: `Question ${number}: the correct answer is not one of the answers.` };
      }
      const answer = answers[index] as string;
      const wrong = answers.filter((_, position) => position !== index);
      return checked(question, answer, wrong, number);
    }

    if (typeof correct === 'string') {
      const answer = correct.trim();
      if (answer === '') {
        return { error: `Question ${number}: the correct answer is missing.` };
      }
      const index = answers.indexOf(answer);
      const wrong = index >= 0 ? answers.filter((_, position) => position !== index) : answers;
      return checked(question, answer, wrong, number);
    }

    return { error: `Question ${number}: the correct answer is missing.` };
  }

  // The native shape: the question, the correct answer and the wrong ones.
  if (typeof entry.correct === 'string') {
    const correct = entry.correct.trim();
    if (correct === '') {
      return { error: `Question ${number}: the correct answer is missing.` };
    }
    const wrong = Array.isArray(entry.wrong)
      ? entry.wrong.filter((value): value is string => typeof value === 'string')
      : typeof entry.wrong === 'string'
        ? [entry.wrong]
        : [];
    return checked(question, correct, wrong, number);
  }

  return { error: `Question ${number}: the correct answer is missing.` };
}

/** Reads a math question (`"type": "math"`). */
function parseMathEntry(
  entry: Record<string, unknown>,
  number: number,
): { card?: ImportCard; error?: string } {
  const question = typeof entry.question === 'string' ? entry.question.trim() : '';
  if (question === '') {
    return { error: `Question ${number}: the question is missing.` };
  }
  const math = readMathSpec(entry);
  if (typeof math === 'string') {
    return { error: `Question ${number}: ${math}` };
  }
  return { card: { front: question, back: math.answers[0] as string, wrong: [], math } };
}

/**
 * Builds a card and checks that it is a legal one.
 *
 * More than 3 wrong answers is an error: the card would have more than four
 * choices.
 */
function checked(
  question: string,
  correct: string,
  wrong: readonly string[],
  number: number,
): { card?: ImportCard; error?: string } {
  const answers = wrong.map((value) => value.trim()).filter((value) => value !== '');

  if (answers.length > MAX_WRONG_ANSWERS) {
    return {
      error: `Question ${number}: too many wrong answers (a question has one correct answer and at most ${MAX_WRONG_ANSWERS} wrong ones).`,
    };
  }

  return {
    card: {
      front: question,
      back: correct,
      wrong: normalizeWrong(answers, correct),
    },
  };
}

/** Parses a deck that holds one card per line. */
function parseTextDeck(text: string, fallbackName: string): ParsedDeck {
  const errors: string[] = [];
  const cards: ImportCard[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  // The separator is detected on the first card line and used for the whole
  // deck, so a deck never mixes two separators.
  let separator: string | null = null;
  let format: DeckFormat = 'tsv';
  let overflow = false;

  lines.forEach((rawLine, index) => {
    const number = index + 1;
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) {
      return;
    }

    let fields = separator === null ? [] : splitLine(line, separator);

    if (separator === null) {
      const detected = detectSeparator(line);
      if (detected === null) {
        errors.push(`Line ${number}: no separator found (use a TAB, " :: " or " | ").`);
        return;
      }
      separator = detected.separator;
      format = detected.format;
      fields = splitLine(line, separator);
    } else if (fields.length < 2) {
      // The deck uses another separator on this line: the deck keeps its own
      // separator, but the line is still read.
      const detected = detectSeparator(line);
      fields = detected === null ? [] : splitLine(line, detected.separator);
    }

    if (fields.length < 2) {
      errors.push(`Line ${number}: the question and the answer are both needed.`);
      return;
    }

    if (fields.length > MAX_WRONG_ANSWERS + 2) {
      errors.push(
        `Line ${number}: too many answers (a question has one correct answer and at most ${MAX_WRONG_ANSWERS} wrong ones).`,
      );
      return;
    }

    const front = (fields[0] ?? '').trim();
    const back = (fields[1] ?? '').trim();

    if (front === '' || back === '') {
      errors.push(`Line ${number}: the question and the answer are both needed.`);
      return;
    }

    const key = cardKey(front, back);
    if (seen.has(key)) {
      return;
    }

    if (cards.length >= MAX_IMPORT_CARDS) {
      overflow = true;
      return;
    }

    seen.add(key);
    cards.push({
      front,
      back,
      wrong: normalizeWrong(fields.slice(2), back),
    });
  });

  if (overflow) {
    errors.push(`Only the first ${MAX_IMPORT_CARDS} questions were imported.`);
  }

  return { name: fallbackName, cards, format, counts: countsOf(cards), errors };
}

/** The separators a deck can use, in the order they are looked for. */
const SEPARATORS: readonly { separator: string; format: DeckFormat }[] = [
  { separator: '\t', format: 'tsv' },
  { separator: ' :: ', format: 'double-colon' },
  { separator: '::', format: 'double-colon' },
  { separator: ' | ', format: 'pipe' },
  { separator: '|', format: 'pipe' },
];

/**
 * Finds the separator of a line.
 *
 * The first one that is there wins: a TAB, then ` :: ` (or `::`), then ` | `
 * (or `|`).
 */
function detectSeparator(line: string): { separator: string; format: DeckFormat } | null {
  for (const entry of SEPARATORS) {
    if (line.includes(entry.separator)) {
      return { separator: entry.separator, format: entry.format };
    }
  }
  return null;
}

/** Splits a line on its separator (every field of the line). */
function splitLine(line: string, separator: string): string[] {
  return line.split(separator);
}

/**
 * Cleans the wrong answers of a card.
 *
 * The answers that are the correct one and the answers that repeat inside
 * the same card are dropped.
 */
function normalizeWrong(wrong: readonly string[], correct: string): string[] {
  const answer = correct.trim();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of wrong) {
    const value = entry.trim();
    if (value === '' || value === answer || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

/** The key that makes two cards the same card. */
function cardKey(front: string, back: string): string {
  return `${front}\n${back}`;
}

/** Counts the multiple choice cards and the self-graded ones. */
function countsOf(cards: readonly ImportCard[]): DeckCounts {
  let multipleChoice = 0;
  let math = 0;

  for (const card of cards) {
    if (card.math !== undefined) {
      math += 1;
    } else if (card.wrong.length > 0) {
      multipleChoice += 1;
    }
  }

  return {
    total: cards.length,
    multipleChoice,
    selfGrade: cards.length - multipleChoice - math,
    math,
  };
}

/** The counts of an empty deck. */
function emptyCounts(): DeckCounts {
  return { total: 0, multipleChoice: 0, selfGrade: 0, math: 0 };
}

/** `true` when the value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The message of an error, whatever threw it. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
