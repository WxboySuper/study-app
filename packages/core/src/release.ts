import { parseSemver } from './version';

/**
 * The releases of the game.
 *
 * The app asks the API for the latest release of the game
 * (`GET /api/update`), and the API answers with a small payload:
 *
 * ```json
 * {
 *   "version": "0.1.3",
 *   "url": "https://github.com/WxboySuper/study-app/releases/tag/v0.1.3",
 *   "name": "CramCritters 0.1.3",
 *   "publishedAt": "2026-10-20T18:04:11Z",
 *   "apkUrl": "https://github.com/WxboySuper/study-app/releases/download/v0.1.3/app.apk"
 * }
 * ```
 *
 * The reading of the payload is pure, so it can be tested without a network.
 * The old shape of the GitHub mirror (the tag and the page of the release)
 * is still accepted, which keeps the tests and the older feeds working.
 */

/** A release of the feed. */
export interface ReleaseInfo {
  /** The version of the release, without the leading `v` (`0.1.3`). */
  version: string;
  /** The page of the release. */
  url: string;
  /** The name of the release. */
  name: string;
  /** When the release was published (`null` when the feed does not say). */
  publishedAt: string | null;
  /** The APK of the release (`null` when the release has no APK). */
  apkUrl: string | null;
}

/**
 * Reads a release of a feed.
 *
 * Both the payload of `GET /api/update` (`version`, `url`, `name`,
 * `publishedAt`, `apkUrl`) and the payload of the GitHub mirror
 * (`tag_name`, `html_url`) are read. Anything else is ignored, and a feed
 * that does not hold a real version gives `null` (the app then says
 * nothing).
 */
export function parseRelease(payload: unknown): ReleaseInfo | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const feed = payload as {
    version?: unknown;
    url?: unknown;
    name?: unknown;
    publishedAt?: unknown;
    apkUrl?: unknown;
    tag_name?: unknown;
    html_url?: unknown;
  };

  const tag =
    typeof feed.version === 'string'
      ? feed.version
      : typeof feed.tag_name === 'string'
        ? feed.tag_name
        : null;
  const url = nonEmptyText(feed.url) ?? nonEmptyText(feed.html_url);

  if (tag === null || url === null) {
    return null;
  }

  const version = parseSemver(tag);
  if (version === null) {
    return null;
  }

  const tagVersion = `${version.major}.${version.minor}.${version.patch}`;

  return {
    version: tagVersion,
    url,
    name: nonEmptyText(feed.name) ?? `CramCritters ${tagVersion}`,
    publishedAt: nonEmptyText(feed.publishedAt),
    apkUrl: nonEmptyText(feed.apkUrl),
  };
}

/** A text that is there, or `null` when it is empty or not a string. */
function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();
  return text === '' ? null : text;
}
