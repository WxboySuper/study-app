/**
 * The parser of the imported decks.
 *
 * A player (or an AI assistant) hands the app a blob of text: a JSON deck, a
 * TSV paste or a list of `front :: back` lines. The parser turns that blob
 * into a deck the app can store, and tells the player what it could not read.
 *
 * The rules are deliberately forgiving (comments, blank lines, spaces around
 * the separator) and strict where it matters (no empty sides, no duplicates,
 * no more than {@link MAX_IMPORT_CARDS} cards).
 */

/** The formats an imported deck can have. */
export type DeckFormat = 'json' | 'tsv' | 'double-colon' | 'pipe';

/** One card of an imported deck. */
export interface ImportCard {
  /** The question of the card. */
  front: string;
  /** The answer of the card. */
  back: string;
}

/** The result of parsing an imported deck. */
export interface ParsedDeck {
  /** The name of the deck (the one of the file, or the fallback). */
  name: string;
  /** The cards that could be read. */
  cards: ImportCard[];
  /** The format the deck was written in. */
  format: DeckFormat;
  /** What could not be read, one line per problem. */
  errors: string[];
}

/** The biggest deck the app imports. */
export const MAX_IMPORT_CARDS = 2000;

/**
 * Parses a pasted deck.
 *
 * The format is detected: a text that starts with `{` is JSON, everything
 * else is a line per card. The separator of a line is the first TAB, else the
 * first ` :: `, else the first ` | ` (`::` and `|` without the spaces work
 * too). Blank lines and the lines that start with `#` are comments.
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
      errors: ['Nothing to import: the text is empty.'],
    };
  }

  if (trimmed.startsWith('{')) {
    return parseJsonDeck(trimmed, fallbackName);
  }

  return parseTextDeck(trimmed, fallbackName);
}

/** Parses a JSON deck (`{"name": "...", "cards": [{"front": "...", "back": "..."}]}`). */
function parseJsonDeck(text: string, fallbackName: string): ParsedDeck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      name: fallbackName,
      cards: [],
      format: 'json',
      errors: [`The deck is not valid JSON: ${messageOf(error)}`],
    };
  }

  if (!isRecord(raw)) {
    return {
      name: fallbackName,
      cards: [],
      format: 'json',
      errors: ['A JSON deck must be an object with a "cards" list.'],
    };
  }

  const name =
    typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : fallbackName;

  if (!Array.isArray(raw.cards)) {
    return {
      name,
      cards: [],
      format: 'json',
      errors: ['A JSON deck must have a "cards" list.'],
    };
  }

  const errors: string[] = [];
  const cards: ImportCard[] = [];
  const seen = new Set<string>();

  raw.cards.forEach((entry, index) => {
    const number = index + 1;

    if (!isRecord(entry)) {
      errors.push(`Card ${number}: it must be an object with a "front" and a "back".`);
      return;
    }

    const front = typeof entry.front === 'string' ? entry.front.trim() : '';
    const back = typeof entry.back === 'string' ? entry.back.trim() : '';

    if (front === '' || back === '') {
      errors.push(`Card ${number}: the front and the back are both needed.`);
      return;
    }

    const key = cardKey(front, back);
    if (seen.has(key)) {
      return;
    }

    if (cards.length >= MAX_IMPORT_CARDS) {
      return;
    }

    seen.add(key);
    cards.push({ front, back });
  });

  if (raw.cards.length > MAX_IMPORT_CARDS) {
    errors.push(`Only the first ${MAX_IMPORT_CARDS} cards were imported.`);
  }

  return { name, cards, format: 'json', errors };
}

/** Parses a deck that holds one card per line. */
function parseTextDeck(text: string, fallbackName: string): ParsedDeck {
  const errors: string[] = [];
  const cards: ImportCard[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  let format: DeckFormat = 'tsv';
  let formatKnown = false;
  let overflow = false;

  lines.forEach((rawLine, index) => {
    const number = index + 1;
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) {
      return;
    }

    const split = splitLine(line);
    if (split === null) {
      errors.push(`Line ${number}: no separator found (use a TAB, " :: " or " | ").`);
      return;
    }

    if (!formatKnown) {
      format = split.format;
      formatKnown = true;
    }

    const front = split.front.trim();
    const back = split.back.trim();

    if (front === '' || back === '') {
      errors.push(`Line ${number}: the front and the back are both needed.`);
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
    cards.push({ front, back });
  });

  if (overflow) {
    errors.push(`Only the first ${MAX_IMPORT_CARDS} cards were imported.`);
  }

  return { name: fallbackName, cards, format, errors };
}

/**
 * Splits a line into its two sides.
 *
 * The first TAB wins, then ` :: `, then ` | `; `::` and `|` without the
 * spaces are accepted too.
 */
function splitLine(line: string): { front: string; back: string; format: DeckFormat } | null {
  const tab = line.indexOf('\t');
  if (tab >= 0) {
    return { front: line.slice(0, tab), back: line.slice(tab + 1), format: 'tsv' };
  }

  const spacedColon = line.indexOf(' :: ');
  if (spacedColon >= 0) {
    return {
      front: line.slice(0, spacedColon),
      back: line.slice(spacedColon + 4),
      format: 'double-colon',
    };
  }

  const spacedPipe = line.indexOf(' | ');
  if (spacedPipe >= 0) {
    return {
      front: line.slice(0, spacedPipe),
      back: line.slice(spacedPipe + 3),
      format: 'pipe',
    };
  }

  const colon = line.indexOf('::');
  if (colon >= 0) {
    return {
      front: line.slice(0, colon),
      back: line.slice(colon + 2),
      format: 'double-colon',
    };
  }

  const pipe = line.indexOf('|');
  if (pipe >= 0) {
    return { front: line.slice(0, pipe), back: line.slice(pipe + 1), format: 'pipe' };
  }

  return null;
}

/** The key that makes two cards the same card. */
function cardKey(front: string, back: string): string {
  return `${front}\n${back}`;
}

/** `true` when the value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The message of an error, whatever threw it. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
