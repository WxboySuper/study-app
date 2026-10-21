import { describe, expect, it } from 'vitest';

import app from '../src/index';

describe('GET /api/health', () => {
  it('reports that the worker is alive', async () => {
    const response = await app.fetch(new Request('https://study-app.example/api/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('answers with json', async () => {
    const response = await app.fetch(new Request('https://study-app.example/api/health'));

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('returns 404 for unknown routes', async () => {
    const response = await app.fetch(new Request('https://study-app.example/api/nope'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});
