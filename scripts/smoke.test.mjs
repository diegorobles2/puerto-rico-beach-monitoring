import assert from 'node:assert/strict';
import test from 'node:test';
import { smoke } from './smoke.mjs';

function fetcher(overrides = {}) {
  return async url => {
    const path = new URL(url).pathname;
    if (overrides[path]) return overrides[path]();
    if (path === '/') return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
    const body = path.endsWith('/live') ? { status: 'ok' }
      : path.endsWith('/ready') ? { status: 'ready' }
      : path.endsWith('/beaches') ? [{ id: '1' }]
      : { status: 'unknown', availability: 'unavailable' };
    return Response.json(body);
  };
}

test('accepts truthful unavailable conditions when the application works', async () => {
  assert.match(await smoke('http://localhost:8080', fetcher()), /Smoke passed/);
});
test('rejects an HTML fallback masquerading as a successful API response', async () => {
  await assert.rejects(smoke('http://localhost', fetcher({
    '/api/beaches': () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
  })), /content type/);
});
test('rejects an unavailable dependency', async () => {
  await assert.rejects(smoke('http://localhost', fetcher({
    '/api/health/ready': () => Response.json({}, { status: 503 }),
  })), /503/);
});
test('rejects an empty catalog', async () => {
  await assert.rejects(smoke('http://localhost', fetcher({
    '/api/beaches': () => Response.json([]),
  })), /catalog/);
});
