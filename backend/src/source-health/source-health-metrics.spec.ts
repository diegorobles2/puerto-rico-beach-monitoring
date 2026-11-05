import { aggregateMetrics, formatMetrics, queryMetrics, RefreshHistoryRow, reportingWindow } from './source-health-metrics';

const reference = new Date('2026-11-03T12:00:00Z');
const row = (overrides: Partial<RefreshHistoryRow> = {}): RefreshHistoryRow => ({
  source: 'drna', source_key: 'scheduled-run', started_at: '2026-11-02T12:00:00Z',
  succeeded: true, duration_ms: 100, ...overrides,
});

describe('seven-day source-health metrics', () => {
  it('counts successes/failures separately per source and averages all known durations', () => {
    const report = aggregateMetrics([
      row(), row({ succeeded: false, duration_ms: 200, started_at: '2026-11-02T12:00:00Z' }),
      row({ duration_ms: null, started_at: '2026-11-01T12:00:00Z' }),
      row({ source: 'nws', duration_ms: 0 }),
      row({ source: 'nws', source_key: 'conditions' }),
      row({ source: 'nws', source_key: 'alerts' }),
    ], reference);
    expect(report.metrics[0]).toEqual({
      source: 'drna', totalAttempts: 3, successfulAttempts: 2, failedAttempts: 1,
      successPercentage: 66.67, averageDurationMs: 150,
      lastAttemptAt: '2026-11-02T12:00:00.000Z', lastSuccessAt: '2026-11-02T12:00:00.000Z',
    });
    expect(report.metrics[1]).toMatchObject({ source: 'nws', totalAttempts: 1, successPercentage: 100, averageDurationMs: 0 });
  });

  it('includes the lower boundary, excludes the upper boundary, and ignores invalid/missing times', () => {
    const rows = [
      row({ started_at: new Date('2026-10-27T12:00:00Z') }),
      row({ started_at: '2026-10-27T11:59:59.999Z' }),
      row({ started_at: reference }), row({ started_at: '2026-11-04T00:00:00Z' }),
      row({ started_at: null }), row({ started_at: undefined }), row({ started_at: 'invalid' }),
      row({ started_at: '2026-10-27T08:00:00-04:00' }),
    ];
    expect(aggregateMetrics(rows, reference).metrics[0].totalAttempts).toBe(2);
    expect(reportingWindow(reference)).toEqual({ windowStart: '2026-10-27T12:00:00.000Z', windowEnd: '2026-11-03T12:00:00.000Z' });
  });

  it('uses the current time by default', () => {
    jest.useFakeTimers().setSystemTime(reference);
    try { expect(aggregateMetrics([])).toEqual(aggregateMetrics([], reference)); }
    finally { jest.useRealTimers(); }
  });

  it('returns null metrics for empty histories and excludes unknown sources', () => {
    const report = aggregateMetrics([row({ source: 'other' })], reference);
    for (const metric of report.metrics) expect(metric).toMatchObject({
      totalAttempts: 0, successfulAttempts: 0, failedAttempts: 0,
      successPercentage: null, averageDurationMs: null, lastAttemptAt: null, lastSuccessAt: null,
    });
    expect(aggregateMetrics([], reference)).toEqual(report);
    expect(formatMetrics(report, 'csv').split('\n')[1]).toBe('2026-10-27T12:00:00.000Z,2026-11-03T12:00:00.000Z,drna,0,0,0,,,,');
  });

  it('ignores missing/invalid durations while retaining attempts and latest failure', () => {
    const rows = [null, undefined, NaN, -1, Infinity].map((duration_ms) => row({ duration_ms }));
    rows.push(row({ succeeded: false, started_at: '2026-11-03T11:00:00Z', duration_ms: null }));
    expect(aggregateMetrics(rows, reference).metrics[0]).toMatchObject({
      totalAttempts: 6, failedAttempts: 1, averageDurationMs: null,
      lastAttemptAt: '2026-11-03T11:00:00.000Z', lastSuccessAt: '2026-11-02T12:00:00.000Z',
    });
    expect(aggregateMetrics([row({ succeeded: false })], reference).metrics[0].lastSuccessAt).toBeNull();
  });

  it('produces deterministic JSON/CSV with rounded numeric values', () => {
    const rows = [row({ duration_ms: 1 }), row({ duration_ms: 2 }), row({ succeeded: false, duration_ms: 2 })];
    const report = aggregateMetrics(rows, reference);
    const reversed = aggregateMetrics([...rows].reverse(), reference);
    expect(formatMetrics(report, 'json')).toBe(JSON.stringify(report, null, 2) + '\n');
    expect(JSON.parse(formatMetrics(report, 'json'))).toEqual(report);
    expect(formatMetrics(report, 'json')).toBe(formatMetrics(reversed, 'json'));
    expect(formatMetrics(report, 'csv')).toBe(formatMetrics(reversed, 'csv'));
    expect(formatMetrics(report, 'csv')).toBe([
      'windowStart,windowEnd,source,totalAttempts,successfulAttempts,failedAttempts,successPercentage,averageDurationMs,lastAttemptAt,lastSuccessAt',
      '2026-10-27T12:00:00.000Z,2026-11-03T12:00:00.000Z,drna,3,2,1,66.67,1.67,2026-11-02T12:00:00.000Z,2026-11-02T12:00:00.000Z',
      '2026-10-27T12:00:00.000Z,2026-11-03T12:00:00.000Z,nws,0,0,0,,,,', '',
    ].join('\n'));
  });

  it('queries only scheduled rows in the half-open window without a live database', async () => {
    const query = {
      select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
    };
    query.where.mockReturnValueOnce(query).mockReturnValueOnce(query).mockResolvedValueOnce([row()]);
    const db = jest.fn(() => query);
    expect(await queryMetrics(db as never, reference)).toEqual(aggregateMetrics([row()], reference));
    expect(db).toHaveBeenCalledWith('public.source_refresh_history');
    expect(query.where.mock.calls).toEqual([
      [{ source_key: 'scheduled-run' }], ['started_at', '>=', '2026-10-27T12:00:00.000Z'],
      ['started_at', '<', '2026-11-03T12:00:00.000Z'],
    ]);
    expect(query.whereIn).toHaveBeenCalledWith('source', ['drna', 'nws']);
    query.where.mockReturnValueOnce(query).mockReturnValueOnce(query).mockRejectedValueOnce(new Error('unavailable'));
    await expect(queryMetrics(db as never, reference)).rejects.toThrow('unavailable');
  });

  it('rejects invalid reference dates', () => {
    expect(() => aggregateMetrics([], new Date('invalid'))).toThrow('Invalid reference timestamp');
  });
});
