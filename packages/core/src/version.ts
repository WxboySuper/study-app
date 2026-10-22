/**
 * The versions of the app.
 *
 * The release feed of the game publishes tags like `v0.1.2`, and the version
 * of the app itself comes from `app.json`. The two are compared here, with
 * the rules of semver, so the update banner only shows up when the release
 * really is newer than the app that is running.
 */

/** A parsed semantic version. */
export interface SemVer {
  /** The major number (`1` in `1.2.3`). */
  major: number;
  /** The minor number (`2` in `1.2.3`). */
  minor: number;
  /** The patch number (`3` in `1.2.3`). */
  patch: number;
  /** The identifiers of the prerelease (`beta.1` in `1.2.3-beta.1`). */
  prerelease: readonly string[];
}

/**
 * Parses a semantic version.
 *
 * The version of a release tag (`v0.1.2`), of `app.json` (`0.1.1`) and of
 * the feed of the app (`1.2`) are all accepted: a leading `v` is dropped and
 * the missing numbers are zeros. `null` is returned when the text is not a
 * version at all (`latest`, `nightly`...).
 */
export function parseSemver(value: string): SemVer | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  // The build metadata (`1.2.3+build.7`) never changes the order.
  const withoutBuild = trimmed.split('+')[0] ?? trimmed;

  const dashIndex = withoutBuild.indexOf('-');
  const core = dashIndex < 0 ? withoutBuild : withoutBuild.slice(0, dashIndex);
  const prereleaseText = dashIndex < 0 ? '' : withoutBuild.slice(dashIndex + 1);

  const numbers = core.replace(/^[vV]/, '').split('.');
  if (numbers.length === 0 || numbers.length > 3) {
    return null;
  }

  const parsed: number[] = [];
  for (const part of numbers) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    parsed.push(Number.parseInt(part, 10));
  }

  while (parsed.length < 3) {
    parsed.push(0);
  }

  const prerelease = prereleaseText === '' ? [] : prereleaseText.split('.');

  return {
    major: parsed[0] ?? 0,
    minor: parsed[1] ?? 0,
    patch: parsed[2] ?? 0,
    prerelease,
  };
}

/**
 * Compares two versions.
 *
 * The result is `-1` when `a` is older than `b`, `0` when they are the same
 * and `1` when `a` is newer. A version that cannot be parsed is older than
 * everything: an unknown release never triggers an update.
 */
export function compareSemver(a: string | SemVer, b: string | SemVer): number {
  const left = typeof a === 'string' ? parseSemver(a) : a;
  const right = typeof b === 'string' ? parseSemver(b) : b;

  if (left === null || right === null) {
    if (left === null && right === null) {
      return 0;
    }
    return left === null ? -1 : 1;
  }

  if (left.major !== right.major) {
    return left.major < right.major ? -1 : 1;
  }
  if (left.minor !== right.minor) {
    return left.minor < right.minor ? -1 : 1;
  }
  if (left.patch !== right.patch) {
    return left.patch < right.patch ? -1 : 1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * Whether a version is newer than another one.
 *
 * The strings are parsed as semantic versions: when one of them cannot be
 * read, the answer is `false` (an unknown version never triggers an update).
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const left = parseSemver(candidate);
  const right = parseSemver(current);

  if (left === null || right === null) {
    return false;
  }

  return compareSemver(left, right) > 0;
}

/**
 * Compares the prerelease parts of two versions.
 *
 * A version without a prerelease is newer than the same version with one
 * (`1.0.0` is newer than `1.0.0-beta.1`).
 */
function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  if (a.length === 0) {
    return 1;
  }
  if (b.length === 0) {
    return -1;
  }

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index];
    const right = b[index];

    if (left === undefined) {
      return -1;
    }
    if (right === undefined) {
      return 1;
    }
    if (left === right) {
      continue;
    }

    const leftNumber = /^\d+$/.test(left);
    const rightNumber = /^\d+$/.test(right);

    if (leftNumber && rightNumber) {
      const leftValue = Number.parseInt(left, 10);
      const rightValue = Number.parseInt(right, 10);
      return leftValue < rightValue ? -1 : 1;
    }
    if (leftNumber) {
      // A number is always older than a word (`1.0.0-1` < `1.0.0-alpha`).
      return -1;
    }
    if (rightNumber) {
      return 1;
    }

    return left < right ? -1 : 1;
  }

  return 0;
}
