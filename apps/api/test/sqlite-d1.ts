/**
 * A real SQLite behind the D1 interface, for the sync tests.
 *
 * The sync service speaks more SQL than the strict fake of `fake-d1.ts`
 * knows, so these tests run the real migrations on `node:sqlite` (in
 * memory). Only the parts of D1 the service uses are implemented.
 */

interface Stmt {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
}

const sqliteModule = "node:sqlite";
const fsModule = "node:fs";
/** The migrations folder (vitest runs from apps/api). */
const MIGRATIONS = new URL(
  "../migrations/",
  (import.meta as unknown as { url: string }).url,
);

export async function sqliteDatabase(): Promise<{
  db: D1Database;
  raw: SqliteDb;
}> {
  const { DatabaseSync } = (await import(/* @vite-ignore */ sqliteModule)) as {
    DatabaseSync: new (path: string) => SqliteDb;
  };
  const raw = new DatabaseSync(":memory:");
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readdirSync(path: URL): string[];
    readFileSync(path: URL, encoding: "utf8"): string;
  };
  for (const file of fs
    .readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith(".sql"))
    .sort()) {
    raw.exec(fs.readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }

  const statement = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    bind: (...next: unknown[]) => statement(sql, next),
    first: async <T>(): Promise<T | null> =>
      (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    all: async <T>() => ({
      results: raw.prepare(sql).all(...params) as T[],
      success: true,
      meta: {},
    }),
    run: async () => {
      const r = raw.prepare(sql).run(...params);
      return {
        success: true,
        results: [],
        meta: {
          changes: Number(r.changes),
          last_row_id: Number(r.lastInsertRowid),
        },
      };
    },
  });

  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      raw.exec("BEGIN");
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        raw.exec("COMMIT");
        return out;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db: db as unknown as D1Database, raw };
}
