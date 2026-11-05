import knex from 'knex';
import config from '../../knexfile';
import { runCli } from '../../scripts/export-source-health';
import { aggregateMetrics, formatMetrics, queryMetrics } from './source-health-metrics';

jest.mock('knex', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../knexfile', () => ({ __esModule: true, default: { client: 'pg', connection: 'mock-only' } }));
jest.mock('./source-health-metrics', () => ({
  ...jest.requireActual('./source-health-metrics'), queryMetrics: jest.fn(),
}));

describe('source-health exporter CLI', () => {
  const reference = new Date('2026-11-03T12:00:00Z');
  const report = aggregateMetrics([], reference);
  const db = { destroy: jest.fn() };
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    jest.resetAllMocks();
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    jest.mocked(knex).mockReturnValue(db as never);
    db.destroy.mockResolvedValue(undefined);
    jest.mocked(queryMetrics).mockResolvedValue(report);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = previousExitCode;
  });

  it.each([
    '2026-02-30T12:00:00Z', '2026-02-29T12:00:00Z', '2026-04-31T12:00:00-04:00',
    '2026-13-01T12:00:00Z', '2026-11-03T25:00:00Z', '2026-11-03T12:00:00', 'not-a-date',
  ])('rejects invalid reference %s before opening a database', async (value) => {
    await runCli(['--reference', value]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Invalid reference timestamp.'));
    expect(knex).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each([
    [['--format', 'xml'], 'Invalid format. Expected json or csv.'],
    [['--format'], 'Missing value for --format.'],
    [['--reference', '--format', 'csv'], 'Missing value for --reference.'],
    [['--format', 'json', '--format', 'csv'], 'Duplicate option: --format'],
    [['--reference', reference.toISOString(), '--reference', reference.toISOString()], 'Duplicate option: --reference'],
    [['--unknown\nsecret'], 'Unknown option. Use --help for usage.'],
    [['--format=json'], 'Unknown option. Use --help for usage.'],
  ])('reports safe argument errors for %j', async (args, message) => {
    await runCli(args);
    expect(stderr).toHaveBeenCalledWith(message + '\n');
    expect(knex).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ['2026-11-03T12:00:00Z', '2026-11-03T12:00:00.000Z'],
    ['2026-11-03T08:00:00.12-04:00', '2026-11-03T12:00:00.120Z'],
    ['2028-02-29T12:00:00.123+02:00', '2028-02-29T10:00:00.123Z'],
  ])('preserves valid reference %s and cleans up after success', async (input, utc) => {
    await runCli(['--reference', input, '--format', 'csv']);
    expect(knex).toHaveBeenCalledWith(config);
    expect(queryMetrics).toHaveBeenCalledWith(db, new Date(utc));
    expect(stdout).toHaveBeenCalledWith(formatMetrics(report, 'csv'));
    expect(stderr).not.toHaveBeenCalled();
    expect(db.destroy).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('uses current time and JSON by default', async () => {
    jest.useFakeTimers().setSystemTime(reference);
    try { await runCli([]); } finally { jest.useRealTimers(); }
    expect(queryMetrics).toHaveBeenCalledWith(db, reference);
    expect(stdout).toHaveBeenCalledWith(formatMetrics(report, 'json'));
    expect(db.destroy).toHaveBeenCalledTimes(1);
  });

  it('prints help without opening a database', async () => {
    await runCli(['--help']);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(knex).not.toHaveBeenCalled();
  });

  it.each(['query', 'connection creation', 'cleanup'])('sanitizes %s failures and closes any created client', async (stage) => {
    const error = new Error('postgres://user:secret@example.invalid/database');
    if (stage === 'query') jest.mocked(queryMetrics).mockRejectedValueOnce(error);
    else if (stage === 'connection creation') jest.mocked(knex).mockImplementationOnce(() => { throw error; });
    else db.destroy.mockRejectedValueOnce(error);
    await runCli([]);
    expect(stderr).toHaveBeenCalledWith('Source-health export failed. Check DATABASE_URL and database access.\n');
    expect(db.destroy).toHaveBeenCalledTimes(stage === 'connection creation' ? 0 : 1);
    expect(process.exitCode).toBe(1);
  });
});
