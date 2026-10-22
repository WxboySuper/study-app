/**
 * The bearer token of the write endpoints.
 *
 * The endpoints that change something (the decks of the player) ask for the
 * `MUSE_TOKEN` secret of the Worker:
 *
 * ```
 * Authorization: Bearer <MUSE_TOKEN>
 * ```
 *
 * The comparison is **constant time**: the answer of the endpoint never
 * tells how many characters of the token were right, and how long the
 * comparison took never tells it either. A request without a token (or with
 * a wrong one) is a `401`, and a Worker that has no secret at all refuses
 * every write.
 */

/** The header that carries the token. */
export const AUTHORIZATION_HEADER = 'authorization';

/** The prefix of the header. */
const BEARER_PREFIX = 'Bearer ';

/**
 * Compares two strings without leaking where they differ.
 *
 * The loop always runs over the length of the longest string and the
 * differences are accumulated, so the time of the comparison only depends
 * on the lengths and not on the content.
 */
export function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length);

  // The lengths are part of the comparison (a token of another length is
  // never the good one), but they are not a secret of their own.
  let diff = a.length ^ b.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }

  return diff === 0;
}

/**
 * Reads the bearer token of a request.
 *
 * The header is `Bearer <token>`: the token is trimmed, so a header with
 * spaces around it still works. Anything else gives `null`.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }

  if (!header.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  return token === '' ? null : token;
}

/**
 * `true` when the request carries the good token.
 *
 * A Worker without a secret has no good token: every write is refused.
 */
export function hasMuseToken(
  header: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (typeof expected !== 'string' || expected === '') {
    return false;
  }

  const token = bearerToken(header);
  if (token === null) {
    return false;
  }

  return timingSafeEqual(token, expected);
}
