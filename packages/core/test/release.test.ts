import { describe, expect, it } from 'vitest';

import { parseRelease } from '../src/release';

describe('parseRelease', () => {
  it('reads the release of the API', () => {
    const release = parseRelease({
      version: '0.1.3',
      url: 'https://github.com/WxboySuper/study-app/releases/tag/v0.1.3',
      name: 'CramCritters 0.1.3',
      publishedAt: '2026-10-20T18:04:11Z',
      apkUrl: 'https://github.com/WxboySuper/study-app/releases/download/v0.1.3/app.apk',
    });

    expect(release).toEqual({
      version: '0.1.3',
      url: 'https://github.com/WxboySuper/study-app/releases/tag/v0.1.3',
      name: 'CramCritters 0.1.3',
      publishedAt: '2026-10-20T18:04:11Z',
      apkUrl: 'https://github.com/WxboySuper/study-app/releases/download/v0.1.3/app.apk',
    });
  });

  it('reads a release of the old GitHub mirror', () => {
    const release = parseRelease({
      tag_name: 'v0.1.2',
      html_url: 'https://github.com/WxboySuper/cramcritters-releases/releases/tag/v0.1.2',
      name: 'CramCritters 0.1.2',
    });

    expect(release).toEqual({
      version: '0.1.2',
      url: 'https://github.com/WxboySuper/cramcritters-releases/releases/tag/v0.1.2',
      name: 'CramCritters 0.1.2',
      publishedAt: null,
      apkUrl: null,
    });
  });

  it('reads a release without the leading v', () => {
    expect(parseRelease({ version: '0.1.2', url: 'https://example.com' })?.version).toBe('0.1.2');
    expect(
      parseRelease({ tag_name: '0.1.2', html_url: 'https://example.com' })?.version,
    ).toBe('0.1.2');
  });

  it('keeps the name of the app when the release has no name', () => {
    expect(parseRelease({ version: '0.1.2', url: 'https://example.com' })?.name).toBe(
      'CramCritters 0.1.2',
    );
  });

  it('reads empty extras as null', () => {
    const release = parseRelease({
      version: '0.1.2',
      url: 'https://example.com',
      name: '   ',
      publishedAt: '',
      apkUrl: '  ',
    });

    expect(release?.name).toBe('CramCritters 0.1.2');
    expect(release?.publishedAt).toBeNull();
    expect(release?.apkUrl).toBeNull();
  });

  it('refuses a feed without a version or without a page', () => {
    expect(parseRelease({ url: 'https://example.com' })).toBeNull();
    expect(parseRelease({ version: '0.1.2' })).toBeNull();
    expect(parseRelease({ html_url: 'https://example.com' })).toBeNull();
    expect(parseRelease({ tag_name: 'v0.1.2' })).toBeNull();
    expect(parseRelease({ version: '0.1.2', url: '   ' })).toBeNull();
  });

  it('refuses a version that is not a version', () => {
    expect(parseRelease({ version: 'nightly', url: 'https://example.com' })).toBeNull();
    expect(parseRelease({ tag_name: 'nightly', html_url: 'https://example.com' })).toBeNull();
  });

  it('refuses something that is not a feed at all', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease('nope')).toBeNull();
    expect(parseRelease(undefined)).toBeNull();
  });
});
