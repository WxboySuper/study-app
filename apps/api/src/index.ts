import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';

import { hasMuseToken } from './auth';
import { deleteDeck, readDeck, readDecksSince, upsertDeck } from './decks';
import { latestRelease, RELEASE_ASSET_URL, RELEASE_USER_AGENT } from './release';
import type { Bindings } from './types';

/**
 * The study app API.
 *
 * Everything the Worker needs is bound through `wrangler.jsonc`: the D1
 * database (`DB`), the static assets of the web build (`ASSETS`) and the
 * two secrets (`MUSE_TOKEN` and `GH_TOKEN`).
 *
 * The endpoints of Phase 1:
 *
 * - `POST /api/decks` pushes a deck (the bearer token of the Worker).
 * - `DELETE /api/decks/:id` deletes a deck (the bearer token).
 * - `GET /api/sync` reads the decks that changed (public, read only).
 * - `GET /api/update` reads the latest release of the game (public).
 * - `GET /api/health` says that the Worker is alive (public).
 */
const app = new Hono<{ Bindings: Bindings }>();

/**
 * The CORS of the public endpoints.
 *
 * The web build is served by the same Worker, so a browser can read the
 * sync and the release feed. The write endpoints are not in the list: they
 * are called by the app with its bearer token, never by a page.
 */
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'HEAD', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

/** The Worker is alive. */
app.get('/api/health', (c) => c.json({ ok: true as const }));

/**
 * Pushes a deck.
 *
 * The body is the deck of the app (docs/DECK-FORMAT.md): the name, the
 * class, the id and the questions. The Blooket shape (the answers and the
 * index of the right one) is read too.
 *
 * The deck is saved with its id, or with the id of the deck that has the
 * same name (a deck that is pushed twice does not become two decks), and
 * its questions are replaced by the ones of the push.
 */
app.post('/api/decks', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const body = await c.req.text();
  const meta = readMeta(body);
  const deck = readDeck(body, meta.name ?? 'Deck');

  if (deck.errors.length > 0) {
    return c.json({ error: 'invalid_deck', errors: deck.errors }, 400);
  }

  if (deck.cards.length === 0) {
    return c.json({ error: 'invalid_deck', errors: ['The deck has no questions.'] }, 400);
  }

  const name = deck.name.trim();
  if (name === '') {
    return c.json({ error: 'invalid_deck', errors: ['The deck needs a name.'] }, 400);
  }

  const result = await upsertDeck(dbOf(c), {
    id: meta.id,
    name,
    class: meta.class,
    cards: deck.cards,
  });

  return c.json(result.deck, result.created ? 201 : 200);
});

/**
 * Deletes a deck.
 *
 * The deck is only flagged: the tombstone is what the other devices read
 * to drop it.
 */
app.delete('/api/decks/:id', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const deleted = await deleteDeck(dbOf(c), id);

  if (!deleted) {
    return c.json({ error: 'not_found' }, 404);
  }

  return c.json({ ok: true as const, id, deleted: true });
});

/**
 * Reads the decks that changed after a moment in time.
 *
 * The endpoint is public and read only: the app calls it on every start to
 * know what changed since the last time.
 */
app.get('/api/sync', async (c) => {
  const since = readSince(c.req.query('since'));
  const decks = await readDecksSince(dbOf(c), since);

  return c.json({ now: Date.now(), decks });
});

/**
 * Reads the latest release of the game.
 *
 * The release is read on GitHub and kept for ten minutes: the feed of
 * GitHub is behind a rate limit, and every device asks the same question.
 */
app.get('/api/update', async (c) => {
  const release = await latestRelease(c.env?.GH_TOKEN);

  if (release === null) {
    return c.json({ error: 'update_unavailable' }, 502);
  }

  // The app downloads the APK through the Worker, which streams the GitHub
  // asset with its token: the device never needs a GitHub account.
  const origin = new URL(c.req.url).origin;
  return c.json({
    ...release,
    apkUrl: release.apkAssetId === null ? null : `${origin}/api/update/apk`,
  });
});

/**
 * Streams the APK of the latest release.
 *
 * The Worker asks the GitHub API for the asset with its token and the
 * `application/octet-stream` accept header, then pipes the body to the
 * device. The download is named after the version of the release and is
 * served with the Android package MIME.
 */
app.get('/api/update/apk', async (c) => {
  const release = await latestRelease(c.env?.GH_TOKEN);

  if (release === null || release.apkAssetId === null) {
    return c.json({ error: 'apk_unavailable' }, 502);
  }

  const headers: Record<string, string> = {
    Accept: 'application/octet-stream',
    'User-Agent': RELEASE_USER_AGENT,
  };

  const token = c.env?.GH_TOKEN;
  if (typeof token === 'string' && token !== '') {
    headers.Authorization = `Bearer ${token}`;
  }

  let asset: Response;
  try {
    asset = await fetch(`${RELEASE_ASSET_URL}/${release.apkAssetId}`, {
      headers,
      redirect: 'follow',
    });
  } catch {
    return c.json({ error: 'apk_unavailable' }, 502);
  }

  if (!asset.ok || asset.body === null) {
    return c.json({ error: 'apk_unavailable' }, 502);
  }

  const version = release.version.replace(/[^0-9A-Za-z._-]/g, '');
  const download: Record<string, string> = {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="cramcritters-${version}.apk"`,
    'Cache-Control': 'public, max-age=600',
  };

  const length = asset.headers.get('content-length');
  if (length !== null) {
    download['Content-Length'] = length;
  }

  return new Response(asset.body, { status: 200, headers: download });
});

/**
 * The routes that are not there.
 *
 * The Worker also serves the web build of the app: a path that is not an
 * API route is given to the assets, which answer with the page of the app
 * (the router of Expo takes it from there).
 */
app.notFound(async (c) => {
  const assets = c.env?.ASSETS;
  if (assets !== undefined) {
    return assets.fetch(c.req.raw);
  }

  return c.json({ error: 'not_found' }, 404);
});

/**
 * `true` when the request carries the token of the Worker.
 *
 * The comparison is constant time (see `src/auth.ts`).
 */
function isMuse(c: Context<{ Bindings: Bindings }>): boolean {
  return hasMuseToken(c.req.header('authorization'), c.env?.MUSE_TOKEN);
}

/** The database of the request. */
function dbOf(c: Context<{ Bindings: Bindings }>): D1Database {
  return c.env?.DB as D1Database;
}

/** The little extras of a deck that the parser of the core does not read. */
interface DeckMeta {
  /** The id of the deck (`null` when the deck is new). */
  id: string | null;
  /** The name of the deck (`null` when it has none). */
  name: string | null;
  /** The class of the deck (`null` when it has none). */
  class: string | null;
}

/**
 * Reads the id, the name and the class of a deck.
 *
 * They are the fields of the JSON deck that the parser of the core does
 * not need: a body that is not JSON simply has none of them.
 */
function readMeta(body: string): DeckMeta {
  const empty: DeckMeta = { id: null, name: null, class: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return empty;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return empty;
  }

  const record = parsed as Record<string, unknown>;

  return {
    id: readText(record.id),
    name: readText(record.name),
    class: readText(record.class),
  };
}

/** Reads a field of the deck that is a non empty text. */
function readText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Reads the moment of the last sync.
 *
 * A missing (or a broken) moment means "everything": the client asks for
 * the whole library.
 */
function readSince(value: string | undefined): number {
  if (typeof value !== 'string') {
    return 0;
  }

  const since = Number.parseInt(value, 10);
  if (!Number.isFinite(since) || since < 0) {
    return 0;
  }

  return since;
}

export default app;
