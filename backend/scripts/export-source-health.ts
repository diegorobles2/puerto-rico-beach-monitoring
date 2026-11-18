import knex from 'knex';
import { formatMetrics, queryMetrics } from '../src/source-health/source-health-metrics';

class ArgumentError extends Error {}

async function main(args: string[]) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: npm run metrics:export -- [--reference ISO_TIMESTAMP_WITH_TIMEZONE] [--format json|csv]\n');
    return;
  }
  let reference = new Date();
  let format: 'json' | 'csv' = 'json';
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag !== '--reference' && flag !== '--format') throw new ArgumentError('Unknown option. Use --help for usage.');
    if (seen.has(flag)) throw new ArgumentError(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (!value || value.startsWith('--')) throw new ArgumentError(`Missing value for ${flag}.`);
    if (flag === '--reference') {
      const validFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
      const calendarDate = new Date(value.slice(0, 10) + 'T00:00:00Z');
      // Date.parse normalizes some impossible dates; round-trip the calendar date separately.
      if (!validFormat || !Number.isFinite(Date.parse(value))
        || !Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)) {
        throw new ArgumentError('Invalid reference timestamp. Use a valid calendar date and ISO timestamp with Z or a numeric timezone offset.');
      }
      reference = new Date(value);
    } else {
      if (value !== 'json' && value !== 'csv') throw new ArgumentError('Invalid format. Expected json or csv.');
      format = value;
    }
  }
  // Load the existing dotenv/Knex configuration only after validating CLI options.
  const { default: config } = await import('../knexfile');
  const db = knex(config);
  try {
    process.stdout.write(formatMetrics(await queryMetrics(db, reference), format));
  } finally {
    await db.destroy();
  }
}

export async function runCli(args = process.argv.slice(2)) {
  try {
    await main(args);
  } catch (error) {
    // Only controlled argument messages are safe to expose; internal errors may contain credentials.
    process.stderr.write((error instanceof ArgumentError ? error.message
      : 'Source-health export failed. Check DATABASE_URL and database access.') + '\n');
    process.exitCode = 1;
  }
}

if (require.main === module) void runCli();
