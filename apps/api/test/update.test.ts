import { afterEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import type { Bindings } from '../src/types';
import { fakeDatabase } from './fake-d1';

/**
 * The tests of the release feed.
 *
 * The feed of GitHub is mocked: the test never touches the network.
 */

/** The token of the Worker of the tests. */
const GH_TOKEN = 'gh-token-of-the-tests';

/** A release of the feed of GitHub. */
const RELEASE = {
  tag_name: 'v0.1.3',
  html_url: 'https://github.com/WxboySuper/study-app/releases/tag/v0.1.3',
  name: 'CramCritters 0.1.3',
  published_at: '2026-10-20T18:04:11Z',
  assets: [
    { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
    {
      id: 42,
      name: 'study-app-0.1.3.apk',
      browser_download_url: 'https://example.com/app.apk',
    },
  ],
};

/** A Worker of the tests. */
function setup(): Bindings {
  const { db } = fakeDatabase();
  return { DB: db, GH_TOKEN };
}

/** Calls the Worker. */
async function call(env: Bindings, path: string): Promise<Response> {
  return app.fetch(new Request(`https://api.cramcritters.test${path}`), env);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/update', () => {
  it('answers with the latest release', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(RELEASE), { status: 200 })),
    );

    const response = await call(setup(), '/api/update');
    expect(response.status).toBe(200);

    const answer = (await response.json()) as {
      version: string;
      url: string;
      name: string;
      publishedAt: string | null;
      apkUrl: string | null;
      apkAssetId: number | null;
    };

    expect(answer.version).toBe('0.1.3');
    expect(answer.url).toBe(RELEASE.html_url);
    expect(answer.name).toBe('CramCritters 0.1.3');
    expect(answer.publishedAt).toBe('2026-10-20T18:04:11Z');
    expect(answer.apkUrl).toBe('https://api.cramcritters.test/api/update/apk');
    expect(answer.apkAssetId).toBe(42);
  });

  it('reads the feed of GitHub with the token and the name of the Worker', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(RELEASE), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await call(setup(), '/api/update');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/WxboySuper/study-app/releases/latest');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${GH_TOKEN}`);
    expect(headers['User-Agent']).toBe('cramcritters-api');
  });

  it('answers 502 when the feed does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    const response = await call(setup(), '/api/update');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'update_unavailable' });
  });

  it('answers 502 when there is no network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    const response = await call(setup(), '/api/update');
    expect(response.status).toBe(502);
  });

  it('answers 502 when the feed holds no release', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    const response = await call(setup(), '/api/update');
    expect(response.status).toBe(502);
  });
});


describe('GET /api/update/apk', () => {
  /** A feed plus an APK asset, served by the same mocked fetch. */
  function mockReleaseAndAsset(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://api.github.com/repos/WxboySuper/study-app/releases/latest') {
        return new Response(JSON.stringify(RELEASE), { status: 200 });
      }
      if (url === 'https://api.github.com/repos/WxboySuper/study-app/releases/assets/42') {
        return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
          status: 200,
          headers: { 'content-length': '4' },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('streams the first APK of the latest release', async () => {
    const fetchMock = mockReleaseAndAsset();

    const response = await call(setup(), '/api/update/apk');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="cramcritters-0.1.3.apk"',
    );
    expect(response.headers.get('content-length')).toBe('4');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/WxboySuper/study-app/releases/assets/42');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${GH_TOKEN}`);
    expect(headers.Accept).toBe('application/octet-stream');
    expect(headers['User-Agent']).toBe('cramcritters-api');
    expect(init.redirect).toBe('follow');
  });

  it('answers 502 when the release has no APK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ...RELEASE, assets: [] }), { status: 200 }),
      ),
    );

    const response = await call(setup(), '/api/update/apk');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'apk_unavailable' });
  });

  it('answers 502 when the asset does not answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith('/releases/latest')) {
          return new Response(JSON.stringify(RELEASE), { status: 200 });
        }
        return new Response('nope', { status: 500 });
      }),
    );

    const response = await call(setup(), '/api/update/apk');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'apk_unavailable' });
  });

  it('answers 502 when the asset download throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith('/releases/latest')) {
          return new Response(JSON.stringify(RELEASE), { status: 200 });
        }
        throw new Error('offline');
      }),
    );

    const response = await call(setup(), '/api/update/apk');
    expect(response.status).toBe(502);
  });
});
