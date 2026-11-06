import type { Knex } from 'knex';
import { DRNA_REFRESH_INTERVAL_MS, NWS_REFRESH_INTERVAL_MS } from '../ingestion/refresh-intervals';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCES = ['drna', 'nws'] as const;

export interface RefreshHistoryRow {
  source: string;
  source_key: string;
  started_at?: Date | string | null;
  succeeded: boolean;
  duration_ms?: number | null;
}

export function reportingWindow(reference = new Date()) {
  if (!Number.isFinite(reference.getTime())) throw new Error('Invalid reference timestamp');
  return {
    windowStart: new Date(reference.getTime() - WEEK_MS).toISOString(),
    windowEnd: reference.toISOString(),
  };
}

export function aggregateMetrics(rows: RefreshHistoryRow[], reference = new Date()) {
  const window = reportingWindow(reference);
  const start = Date.parse(window.windowStart);
  const end = Date.parse(window.windowEnd);
  const metrics = SOURCES.map((source) => {
    const attempts = rows.filter((row) => {
      const time = row.started_at == null ? NaN : new Date(row.started_at).getTime();
      return row.source === source && row.source_key === 'scheduled-run'
        && time >= start && time < end;
    });
    const successes = attempts.filter((row) => row.succeeded);
    const interval = source === 'nws' ? NWS_REFRESH_INTERVAL_MS : DRNA_REFRESH_INTERVAL_MS;
    const expectedRuns = WEEK_MS / interval;
    const coveredSlots = new Set(attempts.map(row =>
      Math.floor((new Date(row.started_at!).getTime() - start) / interval))).size;
    const durations = attempts.map((row) => row.duration_ms)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    const latest = (entries: RefreshHistoryRow[]) => entries.length
      ? new Date(entries.reduce((latestTime, row) => Math.max(latestTime, new Date(row.started_at!).getTime()), -Infinity)).toISOString()
      : null;
    const round = (value: number) => Number(value.toFixed(2));
    return {
      source,
      totalAttempts: attempts.length,
      successfulAttempts: successes.length,
      failedAttempts: attempts.length - successes.length,
      expectedRuns,
      coveredSlots,
      missingRuns: expectedRuns - coveredSlots,
      scheduleCoveragePercentage: round(100 * coveredSlots / expectedRuns),
      successPercentage: attempts.length ? round(successes.length / attempts.length * 100) : null,
      averageDurationMs: durations.length ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      lastAttemptAt: latest(attempts),
      lastSuccessAt: latest(successes),
    };
  });
  return { ...window, metrics };
}

export async function queryMetrics(db: Knex, reference = new Date()) {
  const window = reportingWindow(reference);
  const rows = await db<RefreshHistoryRow>('public.source_refresh_history')
    .select('source', 'source_key', 'started_at', 'succeeded', 'duration_ms')
    .where({ source_key: 'scheduled-run' })
    .whereIn('source', [...SOURCES])
    .where('started_at', '>=', window.windowStart)
    .where('started_at', '<', window.windowEnd);
  return aggregateMetrics(rows, reference);
}

export function formatMetrics(report: ReturnType<typeof aggregateMetrics>, format: 'json' | 'csv') {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  const header = 'windowStart,windowEnd,source,totalAttempts,successfulAttempts,failedAttempts,successPercentage,averageDurationMs,lastAttemptAt,lastSuccessAt,expectedRuns,coveredSlots,missingRuns,scheduleCoveragePercentage';
  const rows = report.metrics.map((metric) => [
    report.windowStart, report.windowEnd, metric.source,
    metric.totalAttempts, metric.successfulAttempts, metric.failedAttempts,
    metric.successPercentage?.toFixed(2) ?? '', metric.averageDurationMs?.toFixed(2) ?? '',
    metric.lastAttemptAt ?? '', metric.lastSuccessAt ?? '',
    metric.expectedRuns, metric.coveredSlots, metric.missingRuns, metric.scheduleCoveragePercentage.toFixed(2),
  ].join(','));
  return [header, ...rows].join('\n') + '\n';
}
