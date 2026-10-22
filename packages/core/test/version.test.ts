import { describe, expect, it } from 'vitest';

import { compareSemver, isNewerVersion, parseSemver } from '../src/version';

describe('parseSemver', () => {
  it('reads a plain version', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it('reads the version of a release tag', () => {
    expect(parseSemver('v0.1.2')).toEqual({ major: 0, minor: 1, patch: 2, prerelease: [] });
  });

  it('reads a version with a missing number', () => {
    expect(parseSemver('1.2')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: [] });
  });

  it('reads a prerelease', () => {
    expect(parseSemver('1.2.3-beta.1')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['beta', '1'],
    });
  });

  it('ignores the build metadata', () => {
    expect(parseSemver('1.2.3+build.7')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
  });

  it('refuses a text that is not a version', () => {
    expect(parseSemver('latest')).toBeNull();
    expect(parseSemver('')).toBeNull();
    expect(parseSemver('1.2.3.4')).toBeNull();
    expect(parseSemver('1.x.3')).toBeNull();
  });
});

describe('compareSemver', () => {
  it('compares the numbers of the versions', () => {
    expect(compareSemver('0.1.1', '0.1.2')).toBe(-1);
    expect(compareSemver('0.1.2', '0.1.1')).toBe(1);
    expect(compareSemver('0.2.0', '0.1.9')).toBe(1);
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1);
  });

  it('says that two equal versions are equal', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
  });

  it('puts a prerelease before the release', () => {
    expect(compareSemver('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.0-beta.1')).toBe(1);
  });

  it('compares the prerelease identifiers', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1);
    expect(compareSemver('1.0.0-beta', '1.0.0-beta.1')).toBe(-1);
  });

  it('puts a number before a word in a prerelease', () => {
    expect(compareSemver('1.0.0-1', '1.0.0-alpha')).toBe(-1);
  });

  it('says that two broken versions are equal', () => {
    expect(compareSemver('latest', 'nightly')).toBe(0);
  });

  it('says that a broken version is older than a real one', () => {
    expect(compareSemver('latest', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', 'latest')).toBe(1);
  });
});

describe('isNewerVersion', () => {
  it('is true only for a version that is really newer', () => {
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true);
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false);
  });

  it('is false when a version cannot be read', () => {
    expect(isNewerVersion('latest', '0.1.1')).toBe(false);
    expect(isNewerVersion('0.1.2', 'latest')).toBe(false);
  });
});
