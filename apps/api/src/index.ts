import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';

import { hasMuseToken } from './auth';
import {
  addQuestion,
  DeckError,
  deleteDeck,
  editQuestion,
  getDeck,
  listDecks,
  patchDeck,
  readDeck,
  readDecksSince,
  retireQuestion,
  upsertDeck,
  type QuestionBody,
} from './decks';
import {
  authDevice,
  claimPairing,
  listDevices,
  pullEvents,
  pushEvents,
  registerDevice,
  revokeDevice,
  startPairing,
} from './progress';
import { createQuiz, getQuiz, listQuizzes, quizResults, withdrawQuiz } from './quizzes';
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
 * - `GET /api/decks`, `GET|PATCH /api/decks/:id` and
 *   `POST|PATCH|DELETE /api/decks/:id/questions[/:qid]` let Muse read and
 *   edit the decks one piece at a time (docs/API.md "For Muse").
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
 * its questions are matched with the ones it already has (by `id`, then by
 * text): they keep their id and the progress of the player. The questions
 * the push leaves out are retired (hidden from play, history kept).
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

  try {
    const result = await upsertDeck(dbOf(c), {
      id: meta.id,
      name,
      class: meta.class,
      cards: deck.cards,
    });

    return c.json(
      { ...result.deck, class: meta.class, changes: result.changes },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return deckError(c, error);
  }
});

/** Lists the decks with their ids (Muse). */
app.get('/api/decks', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  return c.json({ decks: await listDecks(dbOf(c)) });
});

/** One deck with its questions and their ids (Muse); `?retired=1` adds the retired ones. */
app.get('/api/decks/:id', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const deck = await getDeck(dbOf(c), c.req.param('id'), c.req.query('retired') === '1');
  return deck === null ? c.json({ error: 'not_found' }, 404) : c.json(deck);
});

/** Renames a deck and/or moves it to a class (Muse): `{name?, class?}`. */
app.patch('/api/decks/:id', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const body = await readBody(c);
  if (body === null) {
    return c.json({ error: 'bad_request', detail: 'The body must be a JSON object.' }, 400);
  }

  const patch: { name?: string; class?: string | null } = {};
  if ('name' in body) {
    if (typeof body.name !== 'string') {
      return c.json({ error: 'bad_request', detail: '"name" must be a string.' }, 400);
    }
    patch.name = body.name;
  }
  if ('class' in body) {
    if (body.class !== null && typeof body.class !== 'string') {
      return c.json({ error: 'bad_request', detail: '"class" must be a string or null.' }, 400);
    }
    patch.class = body.class;
  }

  try {
    return c.json(await patchDeck(dbOf(c), c.req.param('id'), patch));
  } catch (error) {
    return deckError(c, error);
  }
});

/** Adds one question at the end of a deck (Muse). */
app.post('/api/decks/:id/questions', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const body = await readBody(c);
  if (body === null) {
    return c.json({ error: 'bad_request', detail: 'The body must be a JSON object.' }, 400);
  }

  try {
    const result = await addQuestion(dbOf(c), c.req.param('id'), body);
    return c.json({ ...result.question, restored: result.restored }, result.restored ? 200 : 201);
  } catch (error) {
    return deckError(c, error);
  }
});

/** Edits one question; its id and the progress of the player stay (Muse). */
app.patch('/api/decks/:id/questions/:qid', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const body = await readBody(c);
  if (body === null) {
    return c.json({ error: 'bad_request', detail: 'The body must be a JSON object.' }, 400);
  }

  try {
    return c.json(await editQuestion(dbOf(c), c.req.param('id'), c.req.param('qid'), body));
  } catch (error) {
    return deckError(c, error);
  }
});

/** Retires one question: hidden from play, history kept (Muse). */
app.delete('/api/decks/:id/questions/:qid', async (c) => {
  if (!isMuse(c)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const id = c.req.param('qid');
  const retired = await retireQuestion(dbOf(c), c.req.param('id'), id);
  return retired ? c.json({ ok: true as const, id, retired: true }) : c.json({ error: 'not_found' }, 404);
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
  // The apps from v0.1.17 on ask for the retired questions too (`retired=1`)
  // and hide them; an older app is only sent the questions in play.
  const decks = await readDecksSince(dbOf(c), since, c.req.query('retired') === '1');

  return c.json({ now: Date.now(), decks });
});

/*
 * Phone <-> web progress sync (docs/design/sync.md, docs/API.md).
 * The device routes authenticate with the device token, not MUSE_TOKEN.
 */
app.post('/api/devices/register', (c) => registerDevice(c));
app.post('/api/pair/claim', (c) => claimPairing(c));

app.post('/api/pair/start', async (c) => {
  const device = await authDevice(c);
  return device === null ? c.json({ error: 'unauthorized' }, 401) : startPairing(c, device);
});

app.get('/api/devices', async (c) => {
  const device = await authDevice(c);
  return device === null ? c.json({ error: 'unauthorized' }, 401) : listDevices(c, device);
});

app.delete('/api/devices/:id', async (c) => {
  const device = await authDevice(c);
  return device === null ? c.json({ error: 'unauthorized' }, 401) : revokeDevice(c, device, c.req.param('id'));
});

app.post('/api/sync/push', async (c) => {
  const device = await authDevice(c);
  return device === null ? c.json({ error: 'unauthorized' }, 401) : pushEvents(c, device);
});

app.get('/api/sync/pull', async (c) => {
  const device = await authDevice(c);
  return device === null ? c.json({ error: 'unauthorized' }, 401) : pullEvents(c, device);
});

/**
 * Reads the latest release of the game.
 *
 * The release is read on GitHub and kept for ten minutes: the feed of
 * GitHub is behind a rate limit, and every device asks the same question.
 */
/** `true` for the Muse token or a live device token. */
async function museOrDevice(c: Context<{ Bindings: Bindings }>): Promise<boolean> {
  return isMuse(c) || (await authDevice(c)) !== null;
}

app.post('/api/quizzes', async (c) => (isMuse(c) ? createQuiz(c) : c.json({ error: 'unauthorized' }, 401)));
app.get('/api/quizzes', async (c) =>
  (await museOrDevice(c)) ? listQuizzes(c) : c.json({ error: 'unauthorized' }, 401),
);
app.get('/api/quizzes/:id', async (c) =>
  (await museOrDevice(c)) ? getQuiz(c, c.req.param('id')) : c.json({ error: 'unauthorized' }, 401),
);
app.get('/api/quizzes/:id/results', async (c) =>
  isMuse(c) ? quizResults(c, c.req.param('id')) : c.json({ error: 'unauthorized' }, 401),
);
app.delete('/api/quizzes/:id', async (c) =>
  isMuse(c) ? withdrawQuiz(c, c.req.param('id')) : c.json({ error: 'unauthorized' }, 401),
);

app.get('/api/update', async (c) => {
  const fresh = c.req.query('fresh') === '1';
  const release = await latestRelease(c.env?.GH_TOKEN, fetch, fresh);
  c.header('Cache-Control', 'no-store');

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
/** Reads a JSON object body (`null` when the body is not one). */
async function readBody(c: Context<{ Bindings: Bindings }>): Promise<QuestionBody | null> {
  try {
    const parsed: unknown = await c.req.json();
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as QuestionBody)
      : null;
  } catch {
    return null;
  }
}

/** Answers a {@link DeckError} (anything else is rethrown). */
function deckError(c: Context<{ Bindings: Bindings }>, error: unknown): Response {
  if (error instanceof DeckError) {
    return c.json({ error: error.code, errors: [error.message] }, error.status);
  }
  throw error;
}

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
