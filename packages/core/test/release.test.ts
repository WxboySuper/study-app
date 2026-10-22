import { describe, expect, it } from 'vitest';

import { parseRelease } from '../src/release';

describe('parseRelease', () => {
  it('reads the version and the page of a release', () => {
    const release = parseRelease({
      tag_name: 'v0.1.2',
      html_url: 'https://github.com/WxboySuper/cramcritters-releases/releases/tag/v0.1.2',
      name: 'CramCritters 0.1.2',
    });

    expect(release).toEqual({
      version: '0.1.2',
      url: 'https://github.com/WxboySuper/cramcritters-releases/releases/tag/v0.1.2',
    });
  });

  it('reads a release without the leading v', () => {
    expect(parseRelease({ tag_name: '0.1.2', html_url: 'https://example.com' })?.version).toBe(
      '0.1.2',
    );
  });

  it('refuses a feed without a tag or without a page', () => {
    expect(parseRelease({ html_url: 'https://example.com' })).toBeNull();
    expect(parseRelease({ tag_name: 'v0.1.2' })).toBeNull();
  });

  it('refuses a tag that is not a version', () => {
    expect(parseRelease({ tag_name: 'nightly', html_url: 'https://example.com' })).toBeNull();
  });

  it('refuses something that is not a feed at all', () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease('nope')).toBeNull();
    expect(parseRelease(undefined)).toBeNull();
  });
});
