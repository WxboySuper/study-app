import { Hono } from 'hono';

import type { Bindings } from './types';

/**
 * The study app API.
 *
 * Everything the Worker needs is bound through `wrangler.jsonc`; today that is
 * only the D1 database (`DB`). Authentication (bearer tokens in `api_tokens`),
 * the session endpoints and the server side re-validation of the FSRS
 * schedule (with `@study-app/core`) land in Phase 1.
 */
const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ ok: true as const }));

/**
 * Phase 2: the MCP server lives on the same Worker.
 *
 * It uses `createMcpHandler` from `agents/mcp/server` (stateless Streamable
 * HTTP, *not* the deprecated `McpAgent`) and is protected by a bearer token
 * stored as a Worker secret:
 *
 * ```ts
 * import { createMcpHandler } from 'agents/mcp/server';
 *
 * const handler = createMcpHandler(server, { transport: 'http-stream' });
 *
 * app.all('/mcp', async (c) => {
 *   if (c.req.header('authorization') !== `Bearer ${c.env.MCP_TOKEN}`) {
 *     return c.json({ error: 'unauthorized' }, 401);
 *   }
 *   return handler.fetch(c.req.raw, c.env, c.executionCtx);
 * });
 * ```
 */
app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
