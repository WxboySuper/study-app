/**
 * The release feed of the game.
 *
 * The app asks the Worker for the latest release of the game and the
 * Worker reads it on GitHub: the feed of GitHub is behind a cache and a
 * rate limit, so the Worker keeps the answer for one minute and shares
 * it with every device.
 *
 * The answer of the endpoint is small and simple:
 *
 * ```json
 * {
 *   "version": "0.1.3",
 *   "url": "https://github.com/WxboySuper/study-app/releases/tag/v0.1.3",
 *   "name": "CramCritters 0.1.3",
 *   "publishedAt": "2026-10-20T18:04:11Z",
 *   "apkUrl": "https://api.cramcritters.app/api/update/apk",
 *   "apkAssetId": 123456
 * }
 * ```
 */

/** The feed of the releases of the game on GitHub. */
export const RELEASE_FEED_URL =
  'https://api.github.com/repos/WxboySuper/study-app/releases/latest';

/** The base of the assets of a release on GitHub. */
export const RELEASE_ASSET_URL =
  'https://api.github.com/repos/WxboySuper/study-app/releases/assets';

/** How long the Worker keeps the answer of the feed. */
export const RELEASE_CACHE_TTL_MS = 60 * 1000;

/** The key of the answer in the cache of the Worker. */
export const RELEASE_CACHE_KEY = 'https://cache.cramcritters.app/releases/latest';

/** The name the Worker sends to GitHub. */
export const RELEASE_USER_AGENT = 'cramcritters-api';

/** The release of the game, as the endpoint answers it. */
export interface ReleasePayload {
  /** The version of the release, without the leading `v` (`0.1.3`). */
  version: string;
  /** The page of the release on GitHub. */
  url: string;
  /** The name of the release. */
  name: string;
  /** When the release was published (`null` when GitHub does not say). */
  publishedAt: string | null;
  /** The APK of the release (`null` when the release has no APK). */
  apkUrl: string | null;
  /** The GitHub id of the APK asset (`null` when the release has no APK). */
  apkAssetId: number | null;
}

/**
 * Reads the latest release of the feed.
 *
 * The `GH_TOKEN` secret of the Worker authenticates the request: GitHub
 * answers faster (and with a bigger rate limit) to an authenticated one.
 *
 * @returns `null` when the feed does not answer or does not hold a release.
 */
export async function fetchLatestRelease(
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReleasePayload | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': RELEASE_USER_AGENT,
  };

  if (typeof token === 'string' && token !== '') {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchImpl(RELEASE_FEED_URL, { headers });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  return parseReleasePayload(payload);
}

/**
 * Reads a release of the feed of GitHub.
 *
 * The feed holds the tag of the release (`v0.1.3`), the page of the
 * release, its name, the day it was published and its files. The APK of
 * the release is the first file that ends with `.apk`.
 */
export function parseReleasePayload(payload: unknown): ReleasePayload | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const release = payload as {
    tag_name?: unknown;
    html_url?: unknown;
    name?: unknown;
    published_at?: unknown;
    assets?: unknown;
  };

  const tag = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
  const url = typeof release.html_url === 'string' ? release.html_url.trim() : '';

  if (tag === '' || url === '') {
    return null;
  }

  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const name = typeof release.name === 'string' && release.name.trim() !== '' ? release.name.trim() : tag;
  const publishedAt =
    typeof release.published_at === 'string' && release.published_at.trim() !== ''
      ? release.published_at
      : null;

  const apk = readApkAsset(release.assets);

  return {
    version,
    url,
    name,
    publishedAt,
    apkUrl: apk.url,
    apkAssetId: apk.id,
  };
}

/** The download url and the asset id of the first APK of a release. */
function readApkAsset(assets: unknown): { url: string | null; id: number | null } {
  if (!Array.isArray(assets)) {
    return { url: null, id: null };
  }

  for (const asset of assets) {
    if (typeof asset !== 'object' || asset === null) {
      continue;
    }

    const file = asset as { id?: unknown; name?: unknown; browser_download_url?: unknown };
    const name = typeof file.name === 'string' ? file.name : '';
    const url = typeof file.browser_download_url === 'string' ? file.browser_download_url : '';
    const id = typeof file.id === 'number' && Number.isFinite(file.id) ? file.id : null;

    if (name.toLowerCase().endsWith('.apk') && url !== '') {
      return { url, id };
    }
  }

  return { url: null, id: null };
}

/**
 * The latest release of the game, from the Worker cache or from GitHub.
 *
 * Both the JSON feed and the APK download read the same cached release, so
 * the APK endpoint knows which asset to stream.
 */
export async function latestRelease(
  token?: string,
  fetchImpl: typeof fetch = fetch,
  fresh = false,
): Promise<ReleasePayload | null> {
  // The cache of the Worker lives in each Cloudflare colo: a check the
  // player asked for (`?fresh=1`) skips it, so a release published a
  // minute ago is never hidden by a colo that read the feed before it.
  if (!fresh) {
    const cached = await readCachedRelease();
    if (cached !== null) {
      return cached;
    }
  }

  let release: ReleasePayload | null = null;
  try {
    release = await fetchLatestRelease(token, fetchImpl);
  } catch {
    release = null;
  }

  if (release !== null) {
    await writeCachedRelease(release);
  }

  return release;
}

/** What the Worker keeps in its cache. */
interface CachedRelease {
  /** When the release was read (epoch milliseconds). */
  fetchedAt: number;
  /** The release itself. */
  release: ReleasePayload;
}

/**
 * The cache of the Worker.
 *
 * The cache is a part of the runtime of the Workers (there is no cache in
 * a test that runs in node): `null` means "no cache", and the endpoint
 * simply reads the feed of GitHub every time.
 */
function cacheOf(): Cache | null {
  const runtime = globalThis as { caches?: { default?: Cache } };
  return runtime.caches?.default ?? null;
}

/**
 * Reads the release that the Worker kept in its cache.
 *
 * The answer is only good for ten minutes: after that the Worker reads the
 * feed of GitHub again.
 */
export async function readCachedRelease(now: number = Date.now()): Promise<ReleasePayload | null> {
  const cache = cacheOf();
  if (cache === null) {
    return null;
  }

  try {
    const hit = await cache.match(RELEASE_CACHE_KEY);
    if (hit === undefined || hit === null) {
      return null;
    }

    const payload: unknown = await hit.json();
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }

    const cached = payload as Partial<CachedRelease>;
    if (typeof cached.fetchedAt !== 'number' || cached.release === undefined) {
      return null;
    }

    if (now - cached.fetchedAt >= RELEASE_CACHE_TTL_MS) {
      return null;
    }

    return cached.release;
  } catch {
    // A broken cache entry is simply a miss.
    return null;
  }
}

/** Keeps a release in the cache of the Worker (for ten minutes). */
export async function writeCachedRelease(
  release: ReleasePayload,
  now: number = Date.now(),
): Promise<void> {
  const cache = cacheOf();
  if (cache === null) {
    return;
  }

  const body: CachedRelease = { fetchedAt: now, release };

  try {
    const response = new Response(JSON.stringify(body), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${Math.floor(RELEASE_CACHE_TTL_MS / 1000)}`,
      },
    });

    await cache.put(RELEASE_CACHE_KEY, response);
  } catch {
    // The cache is an optimisation: a Worker that cannot write in it still
    // answers the endpoint.
  }
}
