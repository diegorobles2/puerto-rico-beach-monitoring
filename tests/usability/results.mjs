import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const plan = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8'));
const columns = ['evaluatorId', 'taskId', 'outcome'];
const outcomes = new Set(['success', 'failure', 'not-attempted']);
const taskIds = plan.tasks.map(task => task.id);
if (taskIds.length !== 6 || !taskIds.every((id, index) => id === `T${index + 1}`) || plan.thresholdPercent !== 90) {
  throw new Error('The O4 plan must define six unique tasks and the proposal\'s 90% threshold.');
}

function roster(count, advisorApprovedGroup) {
  if (!Number.isInteger(count) || count < 1 || count > 99) throw new Error('Evaluator count must be an integer from 1 to 99.');
  if (count < 10 && !advisorApprovedGroup) throw new Error('Fewer than 10 evaluators requires --advisor-approved-group.');
  return Array.from({ length: count }, (_, index) => `E${String(index + 1).padStart(2, '0')}`);
}

// Strict CSV quoting: quoted commas/newlines and escaped double quotes are supported.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, closedQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closedQuote = true; }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closedQuote = false;
      if (c !== ',') {
        rows.push(row); row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else if (closedQuote) throw new Error('Unexpected character after a closing CSV quote.');
    else if (c === '"') {
      if (field) throw new Error('CSV quote must begin a field.');
      quoted = true;
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length || closedQuote) rows.push([...row, field]);
  const header = rows.shift();
  if (!header || header.length !== 3 || !header.every((value, i) => value === columns[i])) {
    throw new Error('CSV header must be exactly evaluatorId,taskId,outcome.');
  }
  return rows.map((values, index) => {
    if (values.length !== 3) throw new Error(`CSV row ${index + 2} must have exactly three fields.`);
    return Object.fromEntries(columns.map((key, i) => [key, values[i]]));
  });
}

export function parseResults(text, format) {
  if (format === 'csv') return parseCsv(text);
  if (format === 'json') {
    try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new Error('Malformed JSON results; expected an array of result records.'); }
  }
  throw new Error('Input must have a .csv or .json extension.');
}

export function summarize(records, count = plan.defaultEvaluators, advisorApprovedGroup = false) {
  const evaluators = roster(count, advisorApprovedGroup);
  if (!Array.isArray(records)) throw new Error('Results must be a JSON array or CSV records.');
  const indexed = new Map();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || Object.keys(record).length !== 3 || !columns.every(key => Object.hasOwn(record, key))) {
      throw new Error('Each result must contain only evaluatorId, taskId, and outcome; do not include personal information.');
    }
    if (!evaluators.includes(record.evaluatorId)) throw new Error('Evaluator ID is outside the planned anonymous roster (E01, E02, ...).');
    if (!taskIds.includes(record.taskId)) throw new Error('Unknown task ID; use T1 through T6 from tasks.json.');
    if (!outcomes.has(record.outcome)) throw new Error('Outcome must be success, failure, or not-attempted.');
    const key = `${record.evaluatorId}/${record.taskId}`;
    if (indexed.has(key)) throw new Error('Duplicate evaluator/task result; record exactly one scored attempt per pair.');
    indexed.set(key, record.outcome);
  }
  const slots = evaluators.flatMap(evaluatorId => taskIds.map(taskId => ({
    evaluatorId, taskId, outcome: indexed.get(`${evaluatorId}/${taskId}`) ?? 'missing',
  })));
  function metrics(entries) {
    const successful = entries.filter(entry => entry.outcome === 'success').length;
    const failed = entries.filter(entry => entry.outcome === 'failure').length;
    const notAttempted = entries.filter(entry => entry.outcome === 'not-attempted').length;
    const missing = entries.filter(entry => entry.outcome === 'missing').length;
    const complete = missing === 0 && notAttempted === 0;
    const meetsRateTarget = successful * 100 >= entries.length * plan.thresholdPercent;
    return {
      planned: entries.length, attempted: successful + failed, successful, failed, notAttempted, missing,
      successRatePercent: Math.round(successful * 10000 / entries.length) / 100,
      complete, meetsRateTarget, passed: complete && meetsRateTarget,
    };
  }
  return {
    objective: 'O4', planVersion: plan.version, evaluatorCount: count, advisorApprovedGroup,
    thresholdPercent: plan.thresholdPercent,
    scope: 'Task completion only; human participation, advisor approval, and accessibility are not verified by this tool.',
    overall: metrics(slots),
    byTask: taskIds.map(id => ({ id, ...metrics(slots.filter(slot => slot.taskId === id)) })),
    byEvaluator: evaluators.map(id => ({ id, ...metrics(slots.filter(slot => slot.evaluatorId === id)) })),
    missingAttempts: slots.filter(slot => slot.outcome === 'missing').map(({ evaluatorId, taskId }) => ({ evaluatorId, taskId })),
  };
}

export function toCsv(summary) {
  const fields = ['planned', 'attempted', 'successful', 'failed', 'notAttempted', 'missing', 'successRatePercent', 'complete', 'meetsRateTarget', 'passed'];
  return [
    ['scope', 'id', ...fields].join(','),
    ...[['overall', { id: 'O4', ...summary.overall }],
      ...summary.byTask.map(row => ['task', row]),
      ...summary.byEvaluator.map(row => ['evaluator', row])]
      .map(([scope, row]) => [scope, row.id, ...fields.map(field => row[field])].join(',')),
  ].join('\n') + '\n';
}

export function run(argv) {
  const [input, ...args] = argv;
  if (!input || input === '--help') {
    console.log('node tests/usability/results.mjs <results.csv|results.json|--template> [--evaluators N] [--advisor-approved-group] [--format json|csv]');
    return input ? 0 : 2;
  }
  let count = plan.defaultEvaluators, approved = false, format = 'json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--evaluators' && /^\d+$/.test(args[i + 1] ?? '')) count = Number(args[++i]);
    else if (args[i] === '--advisor-approved-group') approved = true;
    else if (args[i] === '--format' && ['json', 'csv'].includes(args[i + 1])) format = args[++i];
    else throw new Error('Unknown option or missing value. Use --help.');
  }
  const evaluators = roster(count, approved);
  if (input === '--template') {
    console.log([columns.join(','), ...evaluators.flatMap(id => taskIds.map(task => `${id},${task},not-attempted`))].join('\n'));
    return 0;
  }
  const extension = input.split('.').at(-1)?.toLowerCase();
  const summary = summarize(parseResults(readFileSync(input, 'utf8'), extension), count, approved);
  console.log(format === 'csv' ? toCsv(summary).trimEnd() : JSON.stringify(summary, null, 2));
  return summary.overall.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = run(process.argv.slice(2)); }
  catch (error) { console.error(`Usability results error: ${error.message}`); process.exitCode = 2; }
}
