/**
 * The bindings the Worker receives on every request.
 *
 * `DB` is the D1 database that holds the whole app state (see
 * `migrations/0001_init.sql` and `migrations/0002_decks.sql`).
 *
 * The secrets are *not* written in `wrangler.jsonc`: they are set with
 * `wrangler secret put` and are optional in the type, so a Worker that
 * runs without them simply refuses the write endpoints.
 */
export interface Bindings {
  /** The D1 database of the game. */
  DB: D1Database;
  /**
   * The bearer token that guards the write endpoints.
   *
   * It is a Worker secret (`MUSE_TOKEN`): the app sends it in the
   * `Authorization` header of the requests that change something.
   */
  MUSE_TOKEN?: string;
  /**
   * The GitHub token that reads the releases of the game.
   *
   * It is a Worker secret (`GH_TOKEN`): the release feed of GitHub answers
   * faster (and with a bigger rate limit) to an authenticated request.
   */
  GH_TOKEN?: string;
  /** The static assets of the web build (the Expo export). */
  ASSETS?: Fetcher;
}
