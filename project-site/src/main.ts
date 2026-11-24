import manifest from './evidence.json';
import './style.css';

interface Objective {
  id: string;
  title: string;
  status: 'pending' | 'partial' | 'passed' | 'failed';
  statusLabel: string;
  summary: string;
  testCommands: { cwd: string; command: string }[];
  references: string[];
  artifacts: { label: string; path: string; description?: string }[];
  verification?: { explanation: string };
}

function appendGroup(parent: HTMLElement, title: string, content: HTMLElement) {
  const heading = document.createElement('h4');
  heading.textContent = title;
  parent.append(heading, content);
}

const objectives = document.querySelector<HTMLUListElement>('#objectives')!;
const repository = document.querySelector<HTMLAnchorElement>('#repository')!;
// This published revision contains every Markdown reference in the index.
const evidenceRevision = '6a7f79113c0b6d7845652e9d914750e3f873a310';

for (const objective of manifest as Objective[]) {
  const item = document.createElement('li');
  const heading = document.createElement('h3');
  heading.textContent = `${objective.id} · ${objective.title}`;
  const status = document.createElement('p');
  status.className = 'evidence-status';
  status.dataset.status = objective.status;
  status.textContent = objective.statusLabel;
  const summary = document.createElement('p');
  summary.textContent = objective.summary;
  item.append(heading, status, summary);

  if (objective.verification) {
    const explanation = document.createElement('p');
    explanation.textContent = objective.verification.explanation;
    item.append(explanation);
  }

  if (objective.testCommands.length) {
    const commands = document.createElement('ul');
    commands.className = 'references';
    for (const { cwd, command } of objective.testCommands) {
      const row = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = command;
      row.append(`From ${cwd === '.' ? 'the repository root' : cwd}, run `, code);
      commands.append(row);
    }
    appendGroup(item, 'Test commands', commands);
  }

  const references = document.createElement('ul');
  references.className = 'references';

  for (const path of objective.references) {
    const reference = document.createElement('li');
    const link = document.createElement('a');
    link.href = `${repository.href}/blob/${evidenceRevision}/${path}`;
    link.textContent = path;
    reference.append(link);
    references.append(reference);
  }

  if (references.childElementCount) appendGroup(item, 'Repository documentation', references);

  if (objective.artifacts.length) {
    const artifacts = document.createElement('ul');
    artifacts.className = 'references';
    for (const { label, path, description } of objective.artifacts) {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = `${import.meta.env.BASE_URL}evidence/${path}`;
      link.textContent = label;
      row.append(link);
      if (description) row.append(` — ${description}`);
      artifacts.append(row);
    }
    appendGroup(item, 'Generated artifacts', artifacts);
  } else {
    const empty = document.createElement('p');
    empty.className = 'artifact-empty';
    empty.textContent = 'No generated artifacts are published for this objective.';
    appendGroup(item, 'Generated artifacts', empty);
  }

  objectives.append(item);
}
