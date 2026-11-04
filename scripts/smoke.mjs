import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export async function smoke(baseUrl, fetcher = fetch) {
  const origin = new URL(baseUrl).origin;
  async function get(path, json = true) {
    const response = await fetcher(`${origin}${path}`, { signal: AbortSignal.timeout(10000) });
    assert(response.ok, `${path}: HTTP ${response.status}`);
    assert(response.headers.get('content-type')?.includes(json ? 'application/json' : 'text/html'),
      `${path}: unexpected content type (check frontend API routing)`);
    return json ? response.json() : response.text();
  }
  assert((await get('/', false)).includes('<html'), 'Frontend HTML is missing');
  assert.equal((await get('/api/health/live')).status, 'ok');
  assert.equal((await get('/api/health/ready')).status, 'ready');
  const beaches = await get('/api/beaches');
  assert(Array.isArray(beaches) && beaches.length > 0, 'Import the beach catalog before smoke testing');
  const id = beaches[0].id;
  assert(/^[1-9]\d*$/.test(String(id)), 'Invalid beach identifier');
  for (const kind of ['water-quality', 'ocean-risk', 'alerts']) {
    const condition = await get(`/api/conditions/${id}/${kind}`);
    assert(['available', 'stale', 'unavailable'].includes(condition.availability), `${kind}: missing availability`);
    assert.equal(typeof condition.status, 'string', `${kind}: missing status`);
  }
  return `Smoke passed: frontend, API routing, database, beach ${id}, and all three condition endpoints`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  smoke(process.argv[2] || 'http://localhost:8080')
    .then(console.log)
    .catch(error => { console.error(`Smoke failed: ${error.message}`); process.exitCode = 1; });
}
