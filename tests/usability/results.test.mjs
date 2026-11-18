import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, parseCsv, parseResults, summarize, toCsv } from './results.mjs';

const results = (successful = 54) => Array.from({ length: 60 }, (_, i) => ({
  evaluatorId: `E${String(Math.floor(i / 6) + 1).padStart(2, '0')}`,
  taskId: `T${i % 6 + 1}`, outcome: i < successful ? 'success' : 'failure',
}));

test('the six tasks trace to the proposal and have explicit scoring criteria', () => {
  assert.equal(plan.objective, 'O4');
  assert.equal(plan.tasks.length, 6);
  assert.ok(plan.tasks.every(task => task.prompt && task.completionCriteria && task.beachIds.length));
});

test('54/60 passes the inclusive 90% threshold', () => {
  const summary = summarize(results());
  assert.equal(summary.overall.planned, 60);
  assert.equal(summary.overall.successRatePercent, 90);
  assert.equal(summary.overall.passed, true);
  assert.equal(summary.byTask.length, 6);
  assert.equal(summary.byEvaluator.length, 10);
  assert.ok(summary.byTask.every(row => row.planned === 10));
  assert.ok(summary.byEvaluator.every(row => row.planned === 6));
});

test('53/60 fails, without rounding up to 90%', () => {
  assert.equal(summarize(results(53)).overall.passed, false);
  assert.equal(summarize(results(53)).overall.successRatePercent, 88.33);
});

test('missing attempts keep the denominator and cannot become an accepted complete study', () => {
  const summary = summarize(results().slice(0, 54));
  assert.equal(summary.overall.planned, 60);
  assert.equal(summary.overall.successRatePercent, 90);
  assert.equal(summary.overall.meetsRateTarget, true);
  assert.equal(summary.overall.complete, false);
  assert.equal(summary.overall.passed, false);
  assert.equal(summary.overall.missing, 6);
  assert.equal(summary.missingAttempts.length, 6);
  assert.equal(summary.byEvaluator[9].attempted, 0);
});

test('not-attempted and empty records never inflate success rates', () => {
  const data = results();
  data[0].outcome = 'not-attempted';
  assert.equal(summarize(data).overall.attempted, 59);
  assert.equal(summarize(data).overall.notAttempted, 1);
  assert.equal(summarize(data).overall.passed, false);
  const empty = summarize([]);
  assert.equal(empty.overall.planned, 60);
  assert.equal(empty.overall.successRatePercent, 0);
  assert.equal(empty.overall.missing, 60);
});

test('smaller approved groups require an explicit approval declaration', () => {
  assert.throws(() => summarize([], 9), /advisor-approved/);
  const group = summarize(results().slice(0, 54), 9, true);
  assert.equal(group.overall.planned, 54);
  assert.equal(group.overall.passed, true);
  for (const count of [0, -1, 1.5, 100, NaN]) assert.throws(() => summarize([], count, true));
});

test('larger evaluator groups keep the full planned denominator', () => {
  const summary = summarize(results(60), 11);
  assert.equal(summary.overall.planned, 66);
  assert.equal(summary.overall.missing, 6);
  assert.equal(summary.overall.passed, false);
});

test('duplicates, unplanned IDs, invalid outcomes, and extra personal fields are rejected', () => {
  assert.throws(() => summarize([...results(), results()[0]]), /Duplicate/);
  for (const bad of [null, [], {}, { ...results()[0], evaluatorId: 'Diego' },
    { ...results()[0], taskId: 'T7' }, { ...results()[0], outcome: true },
    { ...results()[0], name: 'not permitted' }]) assert.throws(() => summarize([bad]));
  assert.throws(() => summarize({}));
});

test('CSV and JSON inputs give identical results, including BOM/CRLF and quoted CSV', () => {
  const csv = '\uFEFFevaluatorId,taskId,outcome\r\n' + results().map(row =>
    `"${row.evaluatorId}","${row.taskId}","${row.outcome}"`).join('\r\n') + '\r\n';
  assert.deepEqual(parseResults(csv, 'csv'), results());
  assert.deepEqual(parseResults('\uFEFF' + JSON.stringify(results()), 'json'), results());
  assert.deepEqual(parseCsv('evaluatorId,taskId,outcome\n"comma,value","line\nbreak","escaped""quote"'),
    [{ evaluatorId: 'comma,value', taskId: 'line\nbreak', outcome: 'escaped"quote' }]);
  for (const bad of ['wrong,header\n', 'evaluatorId,taskId,outcome\nE01,T1',
    'evaluatorId,taskId,outcome\n"E01"x,T1,success', 'evaluatorId,taskId,outcome\n"unclosed',
    'evaluatorId,taskId,outcome\nE"01,T1,success']) assert.throws(() => parseCsv(bad));
  assert.throws(() => parseResults('[]', 'txt'));
});

test('CSV summaries expose overall, per-task, and per-evaluator denominators', () => {
  const csv = toCsv(summarize(results()));
  assert.ok(csv.includes('overall,O4,60,60,54,6,0,0,90,true,true,true'));
  assert.equal(csv.trim().split('\n').length, 18);
});

test('CLI templates are unscored and exit codes distinguish passed, unmet, and invalid results', () => {
  const cli = fileURLToPath(new URL('./results.mjs', import.meta.url));
  const exec = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const dir = mkdtempSync(join(tmpdir(), 'capstone-usability-'));
  try {
    assert.equal(exec('--help').status, 0);
    assert.equal(exec().status, 2);
    const template = exec('--template');
    assert.equal(template.status, 0);
    assert.equal(parseCsv(template.stdout).length, 60);
    assert.ok(parseCsv(template.stdout).every(row => row.outcome === 'not-attempted'));
    const csvPath = join(dir, 'synthetic-results.csv');
    writeFileSync(csvPath, template.stdout);
    assert.equal(exec(csvPath).status, 1);
    writeFileSync(csvPath, 'evaluatorId,taskId,outcome\n' + results().map(row =>
      `${row.evaluatorId},${row.taskId},${row.outcome}`).join('\n'));
    assert.equal(exec(csvPath).status, 0);
    const path = join(dir, 'synthetic-results.json');
    writeFileSync(path, JSON.stringify(results()));
    assert.equal(exec(path).status, 0);
    assert.equal(exec(path, '--format', 'csv').status, 0);
    writeFileSync(path, JSON.stringify(results(53)));
    assert.equal(exec(path).status, 1);
    writeFileSync(path, template.stdout);
    assert.equal(exec(path).status, 2);
    assert.equal(exec(path, '--unknown').status, 2);
    assert.equal(exec('--template', '--evaluators', '9').status, 2);
    assert.equal(exec('--template', '--evaluators', '9', '--advisor-approved-group').status, 0);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    rmSync(dir, { recursive: true, force: true });
  }
});
