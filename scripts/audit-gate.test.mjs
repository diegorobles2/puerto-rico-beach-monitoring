import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluate, format, validateAllowlist } from './audit-gate.mjs';

const PICOMATCH = 'GHSA-fc5q-39xc-vjpf';
const OTHER = 'GHSA-xxxx-xxxx-xxxx';

function advisory(id, name, severity) {
  return { source: 1, name, dependency: name, title: `${name} issue`, url: `https://github.com/advisories/${id}`, severity, range: '<=9.9.9' };
}

// Shape of `npm audit --json`: one entry per affected package; only the vulnerable package
// carries the advisory object, dependents reference it by name.
function report(...advisories) {
  const vulnerabilities = {};
  for (const a of advisories) {
    vulnerabilities[a.name] = { name: a.name, severity: a.severity, via: [a] };
    vulnerabilities[`depends-on-${a.name}`] = { name: `depends-on-${a.name}`, severity: a.severity, via: [a.name] };
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: { critical: 0, high: 2, moderate: 0, low: 0 } } };
}

const allowlist = [{ id: PICOMATCH, package: 'picomatch', reason: 'development tools only', revisitBy: '2026-12-15' }];
const today = '2026-11-18';

test('passes when the only high advisory is allowlisted', () => {
  const result = evaluate(report(advisory(PICOMATCH, 'picomatch', 'high')), allowlist, today);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.expired.length, 0);
  assert.deepEqual(result.allowed.map((a) => a.id), [PICOMATCH]);
  assert.match(format(result), /Audit gate passed/);
});

test('fails on any other high or critical advisory', () => {
  for (const severity of ['high', 'critical']) {
    const result = evaluate(report(advisory(PICOMATCH, 'picomatch', 'high'), advisory(OTHER, 'vite', severity)), allowlist, today);
    assert.deepEqual(result.blocking.map((a) => a.id), [OTHER]);
    assert.match(format(result), /BLOCKING GHSA-xxxx-xxxx-xxxx[\s\S]*Audit gate FAILED/);
  }
});

test('moderate and low advisories stay visible in npm output but do not block', () => {
  const result = evaluate(report(advisory(OTHER, 'glob', 'moderate')), allowlist, today);
  assert.equal(result.blocking.length, 0);
});

test('an allowlisted id does not cover a different package', () => {
  const result = evaluate(report(advisory(PICOMATCH, 'micromatch', 'high')), allowlist, today);
  assert.deepEqual(result.blocking.map((a) => a.package), ['micromatch']);
});

test('fails once an entry passes its revisit date', () => {
  const result = evaluate(report(advisory(PICOMATCH, 'picomatch', 'high')), allowlist, '2026-12-16');
  assert.deepEqual(result.expired.map((e) => e.id), [PICOMATCH]);
  assert.match(format(result), /EXPIRED[\s\S]*Audit gate FAILED/);
});

test('notes entries that are no longer needed without failing', () => {
  const result = evaluate(report(), allowlist, today);
  assert.deepEqual(result.unused.map((e) => e.id), [PICOMATCH]);
  assert.match(format(result), /NOTICE[\s\S]*Audit gate passed/);
});

test('fails when npm audit reports an error such as a registry outage', () => {
  assert.throws(() => evaluate({ error: { code: 'ENOTFOUND', summary: 'request to registry failed' } }, allowlist, today), /registry failed/);
  assert.throws(() => evaluate({}, allowlist, today), /no vulnerabilities section/);
});

test('rejects incomplete allowlist entries', () => {
  assert.throws(() => validateAllowlist([{ id: PICOMATCH, package: 'picomatch', revisitBy: '2026-12-15' }]), /missing reason/);
  assert.throws(() => validateAllowlist([{ id: PICOMATCH, package: 'picomatch', reason: 'x', revisitBy: 'soon' }]), /revisitBy/);
  assert.throws(() => validateAllowlist([{ id: 'CVE-2026-1', package: 'picomatch', reason: 'x', revisitBy: '2026-12-15' }]), /GHSA/);
});

test('the committed allowlist is valid', () => {
  const committed = JSON.parse(readFileSync(new URL('../security/audit-allowlist.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateAllowlist(committed));
});
