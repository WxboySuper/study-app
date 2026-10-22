/**
 * A D1 database of the tests.
 *
 * The tests never talk to a real database (and never to the network): the
 * routes are called with a small in-memory D1 that speaks the handful of
 * statements of the deck service.
 *
 * The fake is strict on purpose: a statement it does not know throws, so a
 * change of the SQL of the service breaks the tests instead of silently
 * doing nothing.
 */

/** A deck of the fake database. */
export interface FakeDeck {
  id: string;
  name: string;
  class_name: string | null;
  updated_at: number;
  deleted: number;
}

/** A question of the fake database. */
export interface FakeQuestion {
  id: string;
  deck_id: string;
  position: number;
  question: string;
  correct: string;
  wrong_json: string;
  updated_at: number;
}

/** A row of the fake database. */
type Row = Record<string, unknown>;

/** The result of a statement. */
interface Outcome {
  rows: Row[];
  changes: number;
}

/** A statement of the fake database. */
class FakeStatement {
  constructor(
    private readonly db: FakeD1,
    /** The SQL of the statement. */
    readonly sql: string,
    /** The values of the statement. */
    readonly params: unknown[],
  ) {}

  /** Binds the values of the statement. */
  bind(...values: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, values);
  }

  /** The first row of the statement (`null` when there is none). */
  async first<T>(): Promise<T | null> {
    const outcome = this.db.execute(this.sql, this.params);
    return (outcome.rows[0] as T | undefined) ?? null;
  }

  /** Every row of the statement. */
  async all<T>(): Promise<{ results: T[]; success: boolean }> {
    const outcome = this.db.execute(this.sql, this.params);
    return { results: outcome.rows as T[], success: true };
  }

  /** Runs the statement (it writes something). */
  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const outcome = this.db.execute(this.sql, this.params);
    return { success: true, meta: { changes: outcome.changes } };
  }
}

/** The in-memory D1 database of the tests. */
export class FakeD1 {
  /** The decks of the database. */
  readonly decks: FakeDeck[] = [];

  /** The questions of the database. */
  questions: FakeQuestion[] = [];
  /** Prepares a statement. */
  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql, []);
  }

  /** Runs a list of statements (one after the other). */
  async batch(statements: readonly FakeStatement[]): Promise<
    { results: Row[]; success: boolean }[]
  > {
    const results: { results: Row[]; success: boolean }[] = [];

    for (const statement of statements) {
      const outcome = this.execute(statement.sql, statement.params);
      results.push({ results: outcome.rows, success: true });
    }

    return results;
  }

  /** Runs a statement and returns its rows. */
  execute(sql: string, params: readonly unknown[]): Outcome {
    const text = sql.replace(/\s+/g, ' ').trim();

    // SELECT id FROM decks WHERE name = ? LIMIT 1
    if (text === 'SELECT id FROM decks WHERE name = ? LIMIT 1') {
      const deck = this.decks.find((entry) => entry.name === params[0]);
      return { rows: deck === undefined ? [] : [{ id: deck.id }], changes: 0 };
    }

    // SELECT id FROM decks WHERE id = ?
    if (text === 'SELECT id FROM decks WHERE id = ?') {
      const deck = this.decks.find((entry) => entry.id === params[0]);
      return { rows: deck === undefined ? [] : [{ id: deck.id }], changes: 0 };
    }

    // SELECT id FROM questions WHERE deck_id = ? ORDER BY position ASC
    if (text === 'SELECT id FROM questions WHERE deck_id = ? ORDER BY position ASC') {
      const rows = this.questions
        .filter((entry) => entry.deck_id === params[0])
        .sort((left, right) => left.position - right.position)
        .map((entry) => ({ id: entry.id }));
      return { rows, changes: 0 };
    }

    // SELECT id, name, class_name, updated_at, deleted FROM decks WHERE updated_at > ?
    if (
      text ===
      'SELECT id, name, class_name, updated_at, deleted FROM decks WHERE updated_at > ? ORDER BY updated_at ASC, id ASC'
    ) {
      const since = Number(params[0]);
      const rows = this.decks
        .filter((entry) => entry.updated_at > since)
        .sort((left, right) => left.updated_at - right.updated_at || left.id.localeCompare(right.id))
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          class_name: entry.class_name,
          updated_at: entry.updated_at,
          deleted: entry.deleted,
        }));
      return { rows, changes: 0 };
    }

    // SELECT id, position, question, correct, wrong_json FROM questions WHERE deck_id = ?
    if (
      text ===
      'SELECT id, position, question, correct, wrong_json FROM questions WHERE deck_id = ? ORDER BY position ASC'
    ) {
      const rows = this.questions
        .filter((entry) => entry.deck_id === params[0])
        .sort((left, right) => left.position - right.position)
        .map((entry) => ({
          id: entry.id,
          position: entry.position,
          question: entry.question,
          correct: entry.correct,
          wrong_json: entry.wrong_json,
        }));
      return { rows, changes: 0 };
    }

    // UPDATE decks SET deleted = 1, updated_at = ? WHERE id = ?
    if (text === 'UPDATE decks SET deleted = 1, updated_at = ? WHERE id = ?') {
      const deck = this.decks.find((entry) => entry.id === params[1]);
      if (deck === undefined) {
        return { rows: [], changes: 0 };
      }

      deck.deleted = 1;
      deck.updated_at = Number(params[0]);
      return { rows: [], changes: 1 };
    }

    // DELETE FROM questions WHERE deck_id = ?
    if (text === 'DELETE FROM questions WHERE deck_id = ?') {
      const before = this.questions.length;
      this.questions = this.questions.filter((entry) => entry.deck_id !== params[0]);
      return { rows: [], changes: before - this.questions.length };
    }

    // INSERT INTO decks ... ON CONFLICT(id) DO UPDATE ...
    if (
      text ===
      'INSERT INTO decks (id, name, class_name, updated_at, deleted) VALUES (?, ?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET name = excluded.name, class_name = excluded.class_name, updated_at = excluded.updated_at, deleted = 0'
    ) {
      const id = String(params[0]);
      const existing = this.decks.find((entry) => entry.id === id);

      if (existing === undefined) {
        this.decks.push({
          id,
          name: String(params[1]),
          class_name: (params[2] as string | null) ?? null,
          updated_at: Number(params[3]),
          deleted: 0,
        });
        return { rows: [], changes: 1 };
      }

      existing.name = String(params[1]);
      existing.class_name = (params[2] as string | null) ?? null;
      existing.updated_at = Number(params[3]);
      existing.deleted = 0;
      return { rows: [], changes: 1 };
    }

    // INSERT INTO questions ...
    if (
      text ===
      'INSERT INTO questions (id, deck_id, position, question, correct, wrong_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ) {
      this.questions.push({
        id: String(params[0]),
        deck_id: String(params[1]),
        position: Number(params[2]),
        question: String(params[3]),
        correct: String(params[4]),
        wrong_json: String(params[5]),
        updated_at: Number(params[6]),
      });
      return { rows: [], changes: 1 };
    }

    throw new Error(`The fake database does not know this statement: ${text}`);
  }
}

/** The fake database and the D1 that the Worker sees. */
export function fakeDatabase(): { db: D1Database; fake: FakeD1 } {
  const fake = new FakeD1();
  return { db: fake as unknown as D1Database, fake };
}
