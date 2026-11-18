import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { evaluate, format, validateAllowlist, parseAuditResult } from './audit-gate.mjs';

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
    vulnerabilities[a.name] = { name: a.name, severity: a.severity, via: [a], nodes: [`node_modules/${a.name}`] };
    vulnerabilities[`depends-on-${a.name}`] = { name: `depends-on-${a.name}`, severity: a.severity, via: [a.name], nodes: [`node_modules/depends-on-${a.name}`] };
  }
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const entry of Object.values(vulnerabilities)) counts[entry.severity]++;
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
}

const devLock = { lockfileVersion: 3, packages: {
  'node_modules/picomatch': { dev: true }, 'node_modules/depends-on-picomatch': { dev: true },
} };

const allowlist = [{ id: PICOMATCH, package: 'picomatch', reason: 'development tools only', revisitBy: '2026-12-15' }];
const today = '2026-11-18';

test('passes when the only high advisory is allowlisted', () => {
  const result = evaluate(report(advisory(PICOMATCH, 'picomatch', 'high')), allowlist, today, devLock);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.expired.length, 0);
  assert.deepEqual(result.allowed.map((a) => a.id), [PICOMATCH]);
  assert.match(format(result), /Audit gate passed/);
});

test('fails on any other high or critical advisory', () => {
  for (const severity of ['high', 'critical']) {
    const result = evaluate(report(advisory(PICOMATCH, 'picomatch', 'high'), advisory(OTHER, 'vite', severity)), allowlist, today, devLock);
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
  const result = evaluate(report(advisory(PICOMATCH, 'picomatch', 'high')), allowlist, '2026-12-16', devLock);
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

test('the exception fails for production, mixed, missing, linked, or unknown dependency paths', () => {
  const data = report(advisory(PICOMATCH, 'picomatch', 'high'));
  for (const node of ['node_modules/picomatch', 'node_modules/depends-on-picomatch']) {
    for (const entry of [{ dev: false }, {}, { dev: true, link: true }, undefined]) {
      const lock = structuredClone(devLock);
      if (entry) lock.packages[node] = entry;
      else delete lock.packages[node];
      const result = evaluate(data, allowlist, today, lock);
      assert.equal(result.allowed.length, 0);
      assert.equal(result.blocking.length, 1);
      assert.match(format(result), /Production or unverified/);
    }
  }
  assert.equal(evaluate(data, allowlist, today).blocking.length, 1);
});

test('every affected nested package path must remain development-only', () => {
  const data = report(advisory(PICOMATCH, 'picomatch', 'high'));
  data.vulnerabilities.picomatch.nodes.push('node_modules/tool/node_modules/picomatch');
  const lock = structuredClone(devLock);
  assert.equal(evaluate(data, allowlist, today, lock).blocking.length, 1);
  lock.packages['node_modules/tool/node_modules/picomatch'] = { dev: true };
  assert.equal(evaluate(data, allowlist, today, lock).allowed.length, 1);
});

test('the same GHSA on another package is not hidden by deduplication', () => {
  const data = report(advisory(PICOMATCH, 'micromatch', 'high'), advisory(PICOMATCH, 'picomatch', 'high'));
  assert.deepEqual(evaluate(data, allowlist, today, devLock).blocking.map(a => a.package), ['micromatch']);
});

test('dependency cycles resolve to their advisory without hiding rootless cycles', () => {
  const data = report(advisory(PICOMATCH, 'picomatch', 'high'));
  data.vulnerabilities.picomatch.via.push('depends-on-picomatch');
  assert.equal(evaluate(data, allowlist, today, devLock).allowed.length, 1);
  data.vulnerabilities.picomatch.via = ['depends-on-picomatch'];
  assert.throws(() => evaluate(data, allowlist, today, devLock), /No resolved advisory/);
});

test('malformed, unresolved, or inconsistent reports fail closed', () => {
  const data = report(advisory(PICOMATCH, 'picomatch', 'high'));
  const badReports = [
    { ...data, vulnerabilities: [] }, { ...data, vulnerabilities: null }, { ...data, auditReportVersion: 1 },
    { ...data, metadata: undefined }, { ...data, vulnerabilities: {} },
  ];
  for (const bad of badReports) assert.throws(() => evaluate(bad, allowlist, today, devLock));
  for (const via of [[], ['missing-package'], [null], [{}], [{ ...advisory(PICOMATCH, 'picomatch', 'high'), severity: 'unknown' }]]) {
    const bad = structuredClone(data);
    bad.vulnerabilities.picomatch.via = via;
    assert.throws(() => evaluate(bad, allowlist, today, devLock));
  }
});

test('impossible calendar dates are rejected', () => {
  assert.throws(() => validateAllowlist([{ ...allowlist[0], revisitBy: '2026-02-30' }]), /revisitBy/);
});

test('npm subprocess errors, signals, bad JSON, and unexpected exit codes fail closed', () => {
  for (const status of [2, 127, null]) assert.throws(() => parseAuditResult({ status, stdout: JSON.stringify(report()) }), /npm audit failed/);
  assert.throws(() => parseAuditResult({ status: 0, signal: 'SIGTERM', stdout: JSON.stringify(report()) }), /npm audit failed/);
  assert.throws(() => parseAuditResult({ error: new Error('spawn failed') }), /spawn failed/);
  assert.throws(() => parseAuditResult({ status: 0, stdout: 'not-json', stderr: 'private-data' }), error => !error.message.includes('private-data'));
  assert.deepEqual(parseAuditResult({ status: 0, stdout: JSON.stringify(report()) }), report());
  const vulnerable = report(advisory(PICOMATCH, 'picomatch', 'high'));
  assert.deepEqual(parseAuditResult({ status: 1, stdout: JSON.stringify(vulnerable) }), vulnerable);
});

test('committed lockfiles mark all reported picomatch copies as development-only', () => {
  for (const app of ['frontend', 'backend']) {
    const lock = JSON.parse(readFileSync(new URL(`../${app}/package-lock.json`, import.meta.url), 'utf8'));
    const nodes = Object.keys(lock.packages).filter(path => /(?:^|\/)node_modules\/picomatch$/.test(path));
    assert.ok(nodes.length > 0);
    const data = report(advisory(PICOMATCH, 'picomatch', 'high'));
    data.vulnerabilities.picomatch.nodes = nodes;
    delete data.vulnerabilities['depends-on-picomatch'];
    data.metadata.vulnerabilities.high = 1;
    assert.equal(evaluate(data, allowlist, today, lock).allowed.length, 1);
  }
});

test('CLI enforces subprocess status and production scope even with omit=dev configured', () => {
  const directory = mkdtempSync(join(tmpdir(), 'capstone-audit-gate-'));
  const gate = fileURLToPath(new URL('./audit-gate.mjs', import.meta.url));
  const fakeNpm = join(directory, 'fake-npm.js');
  const listPath = join(directory, 'allowlist.json');
  const lockPath = join(directory, 'package-lock.json');
  const unexpiredList = allowlist.map(entry => ({ ...entry,
    revisitBy: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }));
  writeFileSync(listPath, JSON.stringify(unexpiredList));
  const execute = (data, status, lock = devLock) => {
    writeFileSync(lockPath, JSON.stringify(lock));
    writeFileSync(fakeNpm, `if (!process.argv.includes('--include=dev')) process.exit(99); console.log(${JSON.stringify(JSON.stringify(data))}); process.exitCode=${status};`);
    return spawnSync(process.execPath, [gate, listPath], { cwd: directory, encoding: 'utf8',
      env: { ...process.env, npm_execpath: fakeNpm, npm_config_omit: 'dev' } });
  };
  try {
    assert.equal(execute(report(), 2).status, 1);
    assert.equal(execute(report(), 0).status, 0);
    assert.equal(execute({ error: { code: 'ENOTFOUND' } }, 1).status, 1);
    const data = report(advisory(PICOMATCH, 'picomatch', 'high'));
    assert.equal(execute(data, 1).status, 0);
    const productionLock = structuredClone(devLock);
    productionLock.packages['node_modules/picomatch'] = {};
    assert.equal(execute(data, 1, productionLock).status, 1);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
