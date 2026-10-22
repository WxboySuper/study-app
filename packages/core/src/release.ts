import { parseSemver } from './version';

/**
 * The releases of the game.
 *
 * The releases live in a public feed: the app reads the latest one and
 * compares its version with the version of the app. The reading of the feed
 * is pure, so it can be tested without a network.
 */

/** A release of the feed. */
export interface ReleaseInfo {
  /** The version of the release, without the leading `v` (`0.1.2`). */
  version: string;
  /** The page of the release. */
  url: string;
}

/**
 * Reads a release of a feed.
 *
 * The feed of the game holds the tag of the release (`v0.1.2`) and the page
 * of the release. Anything else is ignored, and a feed that does not hold a
 * real version gives `null` (the app then says nothing).
 */
export function parseRelease(payload: unknown): ReleaseInfo | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const feed = payload as { tag_name?: unknown; html_url?: unknown };
  const tag = typeof feed.tag_name === 'string' ? feed.tag_name : null;
  const url = typeof feed.html_url === 'string' ? feed.html_url : null;

  if (tag === null || url === null) {
    return null;
  }

  const version = parseSemver(tag);
  if (version === null) {
    return null;
  }

  return {
    version: `${version.major}.${version.minor}.${version.patch}`,
    url,
  };
}
