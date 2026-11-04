import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (!/^https?:\/\/[^/]+/.test(baseUrl) || !['local', 'staging'].includes(__ENV.TEST_ENV)) {
  throw new Error('Set BASE_URL explicitly and TEST_ENV=local or staging; never target production.');
}
const vus = Number(__ENV.VUS || 50);
if (!Number.isInteger(vus) || vus < 1) throw new Error('VUS must be a positive integer');
const endpoints = ['beaches', 'water-quality', 'ocean-risk', 'alerts'];
const invalidResponses = new Rate('invalid_responses');
const thresholds = { invalid_responses: ['rate<0.01'] };
for (const endpoint of endpoints) {
  thresholds[`http_req_duration{endpoint:${endpoint}}`] = ['p(95)<=1000'];
  thresholds[`http_req_failed{endpoint:${endpoint}}`] = ['rate<0.01'];
}

export const options = {
  vus,
  duration: __ENV.DURATION || '10m',
  thresholds,
  summaryTrendStats: ['avg', 'min', 'max', 'p(95)'],
};

function get(path, endpoint) {
  return http.get(`${baseUrl}${path}`, { tags: { endpoint, name: endpoint }, timeout: '5s' });
}

export function setup() {
  const response = get('/beaches', 'beaches');
  if (response.status !== 200) throw new Error('Cannot read the target beach catalog');
  const beaches = response.json();
  if (!Array.isArray(beaches) || beaches.length < 35) throw new Error('Seed at least 35 beaches before load testing');
  const ids = __ENV.BEACH_IDS ? __ENV.BEACH_IDS.split(',').map(id => id.trim()) : beaches.map(beach => String(beach.id));
  if (!ids.length || ids.some(id => !/^\d+$/.test(id) || !beaches.some(beach => String(beach.id) === id))) {
    throw new Error('BEACH_IDS must contain valid IDs from this target catalog');
  }
  // Preflight requires populated read paths, not just fast empty/unmapped responses.
  for (const endpoint of endpoints.slice(1)) {
    const result = get(`/conditions/${ids[0]}/${endpoint}`, endpoint);
    if (result.status !== 200 || result.json().availability === 'unavailable') {
      throw new Error(`Seed ${endpoint} data for the first selected beach`);
    }
  }
  return { ids };
}

export default function ({ ids }) {
  const id = ids[(__VU - 1 + __ITER) % ids.length];
  for (const endpoint of endpoints) {
    const path = endpoint === 'beaches' ? '/beaches' : `/conditions/${id}/${endpoint}`;
    const response = get(path, endpoint);
    let body;
    try { body = response.json(); } catch { body = null; }
    const valid = response.status === 200 && (endpoint === 'beaches'
      ? Array.isArray(body) && body.length >= 35
      : body && ['available', 'stale', 'unavailable'].includes(body.availability));
    check(response, { [`${endpoint} returns normalized data`]: () => !!valid });
    invalidResponses.add(!valid);
  }
  sleep(1);
}

export function handleSummary(data) {
  const report = {
    target: baseUrl, environment: __ENV.TEST_ENV, vus, duration: options.duration,
    generatedAt: new Date().toISOString(),
    ...data,
  };
  return {
    [__ENV.SUMMARY_PATH || '../tests/load/results/summary.json']: JSON.stringify(report, null, 2),
    stdout: `Load test complete. Results: ${__ENV.SUMMARY_PATH || '../tests/load/results/summary.json'}\n`,
  };
}
