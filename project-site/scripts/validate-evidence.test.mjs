import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateEvidence, validateEvidenceFile } from './validate-evidence.mjs';

const reference = 'docs/verification.md';
const artifact = { label: 'Fixture evidence', path: 'o1/result.json' };

async function fixture(t) {
  const repoRoot = await mkdtemp(join(tmpdir(), 'beach-evidence-'));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const artifactRoot = join(repoRoot, 'project-site', 'public', 'evidence');
  await mkdir(join(repoRoot, 'docs'));
  await mkdir(join(artifactRoot, 'o1'), { recursive: true });
  await writeFile(join(repoRoot, reference), 'Fixture record of an acceptance check.');

  const manifest = ['O1', 'O2', 'O3', 'O4'].map(id => ({
    id,
    title: 'Objective title',
    status: 'partial',
    statusLabel: 'Partially verified',
    summary: 'Fixture verification summary.',
    testCommands: [{ cwd: '.', command: 'npm test' }],
    references: [reference],
    artifacts: [],
  }));
  return { manifest, repoRoot, artifactRoot };
}

test('valid manifest file with documented partial verification and no artifacts', async t => {
  const { manifest, ...roots } = await fixture(t);
  const path = join(roots.repoRoot, 'evidence.json');
  await writeFile(path, JSON.stringify(manifest));
  await validateEvidenceFile(path, roots);
});

test('rejects invalid JSON', async t => {
  const { repoRoot } = await fixture(t);
  const path = join(repoRoot, 'evidence.json');
  await writeFile(path, '{invalid');
  await assert.rejects(validateEvidenceFile(path), /invalid JSON/);
});

const invalidStructures = [
  ['incorrect top-level structure', entries => ({ entries }), /must be an array/],
  ['missing objective', entries => entries.slice(0, 3), /Missing objectives: O4/],
  ['duplicate objective', ([first, ...rest]) => [first, first, ...rest], /Duplicate objective O1/],
];

for (const [label, change, message] of invalidStructures) {
  test(`rejects ${label}`, async t => {
    const { manifest, ...roots } = await fixture(t);
    await assert.rejects(validateEvidence(change(manifest), roots), message);
  });
}

const invalidEntries = [
  ['invalid status', () => ({ status: 'complete' }), /O1\.status/],
  ['missing required field', () => ({ artifacts: undefined }), /O1\.artifacts/],
  ['blank title', () => ({ title: ' ' }), /O1\.title/],
  ['invalid test command', () => ({ testCommands: [{ cwd: '.', command: '  ' }] }), /O1\.testCommands\[0\]/],
  ['test command with invalid working directory', () => ({
    testCommands: [{ cwd: '../outside', command: 'npm test' }],
  }), /O1\.testCommands\[0\]/],
  ['malformed repository reference', () => ({ references: ['https://example.test/evidence.md'] }), /O1\.references\[0\]/],
  ['missing repository reference', () => ({ references: ['docs/missing.md'] }), /O1\.references\[0\].*ENOENT/],
  ['malformed artifact entry', () => ({ artifacts: [{ path: artifact.path }] }), /nonempty label/],
  ['missing local artifact', () => ({ artifacts: [artifact] }), /O1\.artifacts\[0\]\.path.*ENOENT/],
  ['directory instead of artifact file', () => ({ artifacts: [{ ...artifact, path: 'o1' }] }), /must be a regular file/],
  ['partial objective with only a test command', () => ({ references: [] }), /partial status requires documented evidence/],
  ['passed objective without acceptance record', () => ({ status: 'passed' }), /requires a verification explanation/],
  ['passed objective without supporting evidence', () => ({
    status: 'passed', verification: { explanation: 'Ran a check.' },
  }), /requires supporting evidence/],
  ['passed objective citing an undeclared source', () => ({
    status: 'passed', verification: { explanation: 'Ran a check.', evidence: ['docs/other.md'] },
  }), /must cite declared references or artifacts/],
  ['failed objective without an explanation', () => ({ status: 'failed' }), /requires a verification explanation/],
];

for (const [label, change, message] of invalidEntries) {
  test(`rejects ${label}`, async t => {
    const { manifest, ...roots } = await fixture(t);
    Object.assign(manifest[0], change());
    await assert.rejects(validateEvidence(manifest, roots), message);
  });
}

for (const path of ['/report.json', 'C:/report.json', 'C:report.json', '../report.json',
  'o1/../report.json', 'o1//report.json', 'o1/report.json?raw=1', 'o1/report.json#top',
  'https://example.test/report.json', 'o1\\report.json', 'o1/%2e%2e/report.json', 'o1/report.json\n']) {
  test(`rejects unsafe artifact path ${JSON.stringify(path)}`, async t => {
    const { manifest, ...roots } = await fixture(t);
    manifest[0].artifacts = [{ ...artifact, path }];
    await assert.rejects(validateEvidence(manifest, roots), /safe evidence-relative file path/);
  });
}

test('accepts pending objective with no artifacts or references', async t => {
  const { manifest, ...roots } = await fixture(t);
  Object.assign(manifest[0], { status: 'pending', references: [] });
  await validateEvidence(manifest, roots);
});

test('accepts passed objective with a cited Markdown acceptance record', async t => {
  const { manifest, ...roots } = await fixture(t);
  Object.assign(manifest[0], {
    status: 'passed',
    verification: { explanation: 'All fixture acceptance criteria were verified.', evidence: [reference] },
  });
  await validateEvidence(manifest, roots);
});

test('accepts failed objective with an explanation', async t => {
  const { manifest, ...roots } = await fixture(t);
  Object.assign(manifest[0], {
    status: 'failed',
    verification: { explanation: 'Required check exceeded the maximum error rate.' },
  });
  await validateEvidence(manifest, roots);
});

test('accepts an existing local artifact', async t => {
  const { manifest, ...roots } = await fixture(t);
  await writeFile(join(roots.artifactRoot, artifact.path), '{}');
  manifest[0].artifacts = [artifact];
  await validateEvidence(manifest, roots);
});

test('rejects a symlink or junction escaping the evidence root', async t => {
  const { manifest, ...roots } = await fixture(t);
  const outside = join(roots.repoRoot, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'result.json'), '{}');
  try {
    await symlink(outside, join(roots.artifactRoot, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error.code)) {
      t.skip(`Links unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  manifest[0].artifacts = [{ ...artifact, path: 'escape/result.json' }];
  await assert.rejects(validateEvidence(manifest, roots), /resolves outside its root/);
});
