/**
 * A D1 database of the deck tests.
 *
 * The tests never talk to a real database (and never to the network): the
 * routes are called with an in-memory SQLite (`node:sqlite`) that runs the
 * real migrations, so the SQL of the service is the SQL that runs in
 * production. The fake also exposes the rows of the decks and of the
 * questions in play, for the assertions.
 */

/** A deck of the database. */
export interface FakeDeck {
  id: string;
  name: string;
  class_name: string | null;
  updated_at: number;
  deleted: number;
}

/** A question of the database. */
export interface FakeQuestion {
  id: string;
  deck_id: string;
  position: number;
  question: string;
  correct: string;
  wrong_json: string;
  updated_at: number;
  retired: number;
}

interface Stmt {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
}

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
}

interface Fs {
  readdirSync(path: URL): string[];
  readFileSync(path: URL, encoding: 'utf8'): string;
}

const getBuiltin = (process as unknown as { getBuiltinModule(name: string): unknown })
  .getBuiltinModule;

/** The migrations folder (vitest runs from apps/api). */
const MIGRATIONS = new URL('../migrations/', (import.meta as unknown as { url: string }).url);

/** The in-memory database of the tests. */
export class FakeD1 {
  readonly raw: SqliteDb;

  constructor() {
    const { DatabaseSync } = getBuiltin('node:sqlite') as {
      DatabaseSync: new (path: string) => SqliteDb;
    };
    const fs = getBuiltin('node:fs') as Fs;
    this.raw = new DatabaseSync(':memory:');
    for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      this.raw.exec(fs.readFileSync(new URL(file, MIGRATIONS), 'utf8'));
    }
  }

  /** The decks, in the order they were created. */
  get decks(): FakeDeck[] {
    return this.raw.prepare('SELECT * FROM decks ORDER BY rowid').all() as FakeDeck[];
  }

  /** The questions in play, deck by deck, in their order. */
  get questions(): FakeQuestion[] {
    return this.raw
      .prepare('SELECT * FROM questions WHERE retired = 0 ORDER BY deck_id, position')
      .all() as FakeQuestion[];
  }

  /** Every question, the retired ones too. */
  get allQuestions(): FakeQuestion[] {
    return this.raw
      .prepare('SELECT * FROM questions ORDER BY deck_id, retired, position')
      .all() as FakeQuestion[];
  }

  /** The D1 that the Worker sees. */
  d1(): D1Database {
    const raw = this.raw;
    const statement = (sql: string, params: unknown[] = []) => ({
      sql,
      params,
      bind: (...next: unknown[]) => statement(sql, next),
      first: async <T>(): Promise<T | null> =>
        (raw.prepare(sql).get(...params) as T | undefined) ?? null,
      all: async <T>() => ({ results: raw.prepare(sql).all(...params) as T[], success: true }),
      run: async () => ({
        success: true,
        meta: { changes: Number(raw.prepare(sql).run(...params).changes) },
      }),
    });

    return {
      prepare: (sql: string) => statement(sql),
      batch: async (list: ReturnType<typeof statement>[]) => {
        raw.exec('BEGIN');
        try {
          const out = [];
          for (const s of list) {
            out.push(
              /^\s*SELECT/i.test(s.sql) ? await s.all() : { ...(await s.run()), results: [] },
            );
          }
          raw.exec('COMMIT');
          return out;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      },
    } as unknown as D1Database;
  }
}

/** The fake database and the D1 that the Worker sees. */
export function fakeDatabase(): { db: D1Database; fake: FakeD1 } {
  const fake = new FakeD1();
  return { db: fake.d1(), fake };
}
