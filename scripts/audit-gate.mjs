// Dependency audit gate used by `npm run audit:security` in frontend/ and backend/.
// Runs `npm audit --json` over all dependencies (including development tools) and fails on any
// high or critical advisory, except advisories listed in security/audit-allowlist.json whose
// revisit date has not passed. See docs/testing/security-checks.md.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BLOCKING = new Set(['high', 'critical']);
const DEFAULT_ALLOWLIST = fileURLToPath(new URL('../security/audit-allowlist.json', import.meta.url));

export function validateAllowlist(entries) {
  if (!Array.isArray(entries)) throw new Error('Allowlist must be a JSON array');
  for (const entry of entries) {
    const label = entry?.id ?? JSON.stringify(entry);
    if (!/^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/.test(entry?.id ?? '')) throw new Error(`Allowlist entry ${label}: id must be a GHSA identifier`);
    for (const field of ['package', 'reason']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) throw new Error(`Allowlist entry ${label}: missing ${field}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.revisitBy ?? '') || Number.isNaN(Date.parse(entry.revisitBy))) {
      throw new Error(`Allowlist entry ${label}: revisitBy must be a YYYY-MM-DD date`);
    }
  }
  return entries;
}

// Collect the distinct advisories in an `npm audit --json` report. Packages that are only
// flagged because they depend on a vulnerable package list names (strings) in `via`; the
// advisories themselves are the object entries.
export function advisoriesIn(report) {
  if (report?.error) throw new Error(`npm audit failed: ${report.error.summary ?? report.error.code ?? 'unknown error'}`);
  if (!report || typeof report.vulnerabilities !== 'object') throw new Error('npm audit output has no vulnerabilities section');
  const advisories = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object') continue;
      const id = String(via.url ?? '').split('/').pop() || `npm-${via.source}`;
      advisories.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url, range: via.range });
    }
  }
  return [...advisories.values()];
}

export function evaluate(report, allowlist, today = new Date().toISOString().slice(0, 10)) {
  validateAllowlist(allowlist);
  const allowed = new Map(allowlist.map((entry) => [entry.id, entry]));
  const result = { blocking: [], allowed: [], expired: [], unused: [] };
  const advisories = advisoriesIn(report);
  for (const advisory of advisories) {
    if (!BLOCKING.has(advisory.severity)) continue;
    const entry = allowed.get(advisory.id);
    // An allowlist entry only covers the advisory on the package it names.
    if (entry && entry.package === advisory.package) result.allowed.push({ ...advisory, entry });
    else result.blocking.push(advisory);
  }
  for (const entry of allowlist) {
    if (entry.revisitBy < today) result.expired.push(entry);
    if (!advisories.some((advisory) => advisory.id === entry.id)) result.unused.push(entry);
  }
  return result;
}

export function format(result, metadata) {
  const lines = [];
  const counts = metadata?.vulnerabilities;
  if (counts) lines.push(`npm audit (all dependencies): ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low package entries`);
  for (const a of result.allowed) lines.push(`ALLOWED  ${a.id} ${a.severity} ${a.package} ${a.range ?? ''} — revisit by ${a.entry.revisitBy}\n         ${a.entry.reason}`);
  for (const a of result.blocking) lines.push(`BLOCKING ${a.id} ${a.severity} ${a.package} ${a.range ?? ''} — ${a.title ?? ''} ${a.url ?? ''}`);
  for (const e of result.expired) lines.push(`EXPIRED  ${e.id} (${e.package}) passed its revisit date ${e.revisitBy}: re-check the advisory, then update or remove the allowlist entry`);
  for (const e of result.unused) lines.push(`NOTICE   ${e.id} (${e.package}) no longer appears in this audit; remove it from the allowlist once no app needs it`);
  lines.push(result.blocking.length || result.expired.length ? 'Audit gate FAILED' : 'Audit gate passed');
  return lines.join('\n');
}

export function runNpmAudit(cwd = process.cwd()) {
  const options = { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  // Under `npm run`, reuse the npm that launched us (no shell). Run directly, npm.cmd on
  // Windows needs a shell; the command is a fixed string.
  const npmCli = process.env.npm_execpath;
  const child = npmCli?.endsWith('.js')
    ? spawnSync(process.execPath, [npmCli, 'audit', '--json'], options)
    : process.platform === 'win32'
      ? spawnSync('npm audit --json', { ...options, shell: true })
      : spawnSync('npm', ['audit', '--json'], options);
  if (child.error) throw child.error;
  try {
    return JSON.parse(child.stdout);
  } catch {
    throw new Error(`npm audit did not return JSON (exit ${child.status}): ${child.stderr || child.stdout}`.trim());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const allowlist = JSON.parse(readFileSync(process.argv[2] ?? DEFAULT_ALLOWLIST, 'utf8'));
    const report = runNpmAudit();
    const result = evaluate(report, allowlist);
    console.log(format(result, report.metadata));
    if (result.blocking.length || result.expired.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Audit gate FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
