import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const objectives = ['O1', 'O2', 'O3', 'O4'];
const statuses = new Set(['pending', 'partial', 'passed', 'failed']);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const evidenceRoot = fileURLToPath(new URL('../public/evidence/', import.meta.url));

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safePath(value) {
  return typeof value === 'string' && value.split('/').every(segment =>
    /^[a-z\d_.-]+$/i.test(segment) &&
    !segment.endsWith('.') &&
    !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment)
  );
}

function isInside(root, target) {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function checkTarget(root, path, label, kind, fixedRoot = false) {
  const target = resolve(root, path);
  requireValid(isInside(root, target), `${label} escapes its root`);

  let actualRoot;
  let actualTarget;
  try {
    actualRoot = await realpath(root);
    actualTarget = await realpath(target);
  } catch (error) {
    throw new Error(`${label} could not be resolved (${error.code}): ${path}`, { cause: error });
  }
  requireValid((!fixedRoot || relative(root, actualRoot) === '') && isInside(actualRoot, actualTarget),
    `${label} resolves outside its root: ${path}`);
  const info = await stat(actualTarget);
  requireValid(kind === 'file' ? info.isFile() : info.isDirectory(), `${label} must be a regular ${kind}: ${path}`);
}

export async function validateEvidence(manifest, { repoRoot = repositoryRoot, artifactRoot = evidenceRoot } = {}) {
  requireValid(Array.isArray(manifest), 'Evidence manifest must be an array of objectives');
  const seen = new Set();

  for (const entry of manifest) {
    requireValid(isRecord(entry) && objectives.includes(entry.id), 'Each objective must have an ID from O1 to O4');
    const { id, title, status, statusLabel, summary, testCommands, references, artifacts, verification } = entry;
    requireValid(!seen.has(id), `Duplicate objective ${id}`);
    seen.add(id);
    requireValid(statuses.has(status), `${id}.status must be pending, partial, passed, or failed`);

    for (const [field, value] of Object.entries({ title, statusLabel, summary })) {
      requireValid(hasText(value), `${id}.${field} must be a nonempty string`);
    }

    requireValid(Array.isArray(testCommands), `${id}.testCommands must be an array`);
    for (const [index, command] of testCommands.entries()) {
      const label = `${id}.testCommands[${index}]`;
      requireValid(isRecord(command) && (command.cwd === '.' || safePath(command.cwd)) &&
        hasText(command.command) && !/[\x00-\x1f\x7f\u2028\u2029]/u.test(command.command),
      `${label} must have a repository-relative cwd and a nonempty single-line command`);
      await checkTarget(resolve(repoRoot), command.cwd, `${label}.cwd`, 'directory');
    }

    requireValid(Array.isArray(references), `${id}.references must be an array`);
    for (const [index, path] of references.entries()) {
      const label = `${id}.references[${index}]`;
      requireValid(safePath(path) && /\.md$/i.test(path), `${label} must be a safe repository-relative Markdown path`);
      await checkTarget(resolve(repoRoot), path, label, 'file');
    }

    requireValid(Array.isArray(artifacts), `${id}.artifacts must be an array`);
    for (const [index, artifact] of artifacts.entries()) {
      const label = `${id}.artifacts[${index}]`;
      requireValid(isRecord(artifact) && hasText(artifact.label) &&
        (artifact.description === undefined || hasText(artifact.description)),
      `${label} must have a nonempty label and optional nonempty description`);
      requireValid(safePath(artifact.path), `${label}.path must be a safe evidence-relative file path`);
      await checkTarget(resolve(artifactRoot), artifact.path, `${label}.path`, 'file', true);
    }

    if (status === 'partial') {
      requireValid(references.length || artifacts.length, `${id} partial status requires documented evidence`);
    }
    if (verification !== undefined || status === 'passed' || status === 'failed') {
      requireValid(isRecord(verification) && hasText(verification.explanation),
        `${id} ${status} status requires a verification explanation`);
      const { evidence = [] } = verification;
      requireValid(Array.isArray(evidence) && evidence.every(path =>
        references.includes(path) || artifacts.some(artifact => artifact.path === path)
      ), `${id}.verification.evidence must cite declared references or artifacts`);
      requireValid(status !== 'passed' || evidence.length > 0,
        `${id} passed status requires supporting evidence for the completed acceptance criteria`);
    }
  }

  const missing = objectives.filter(id => !seen.has(id));
  requireValid(!missing.length, `Missing objectives: ${missing.join(', ')}`);
}

export async function validateEvidenceFile(path, roots) {
  const content = await readFile(path, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    throw new Error(`Evidence manifest contains invalid JSON: ${error.message}`, { cause: error });
  }
  await validateEvidence(manifest, roots);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await validateEvidenceFile(new URL('../src/evidence.json', import.meta.url));
    console.log('Validated O1–O4 evidence manifest and local file references.');
  } catch (error) {
    console.error(`Evidence validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
