/**
 * The bindings the Worker receives on every request.
 *
 * `DB` is the D1 database that holds the whole app state (see
 * `migrations/0001_init.sql`).
 */
export interface Bindings {
  DB: D1Database;
}
