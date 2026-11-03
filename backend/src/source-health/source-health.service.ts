import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { DRNA_REFRESH_INTERVAL_MS, NWS_REFRESH_INTERVAL_MS } from '../ingestion/ingestion.scheduler';

export interface SourceHealthStatus {
  lastAttemptAt: string | null;
  lastAttemptSucceeded: boolean | null;
  lastSuccessAt: string | null;
  state: 'no-history' | 'succeeded' | 'failed' | 'stale';
}

interface RefreshAttempt {
  id: string;
  source: 'nws' | 'drna';
  source_key: string;
  started_at: Date | string;
  succeeded: boolean;
}

@Injectable()
export class SourceHealthService {
  constructor(@Inject(DATABASE) private readonly db: Knex) {}

  async getStatus(): Promise<Record<'nws' | 'drna', SourceHealthStatus>> {
    const now = Date.now();
    const [nws, drna] = await Promise.all([
      this.getSourceStatus('nws', NWS_REFRESH_INTERVAL_MS, now),
      this.getSourceStatus('drna', DRNA_REFRESH_INTERVAL_MS, now),
    ]);
    return { nws, drna };
  }

  private async getSourceStatus(
    source: 'nws' | 'drna', intervalMs: number, now: number,
  ): Promise<SourceHealthStatus> {
    const scheduledRuns = () => this.db<RefreshAttempt>('source_refresh_history')
      .where({ source, source_key: 'scheduled-run' })
      .orderBy('started_at', 'desc')
      .orderBy('id', 'desc');
    const [latest, success] = await Promise.all([
      scheduledRuns().first('started_at', 'succeeded'),
      scheduledRuns().where({ succeeded: true }).first('started_at'),
    ]);
    const lastSuccessAt = success ? new Date(success.started_at).toISOString() : null;
    // Allow one missed cycle. Execution recency does not imply upstream data freshness.
    // Stale takes precedence; lastAttemptSucceeded still exposes a latest failure.
    const stale = lastSuccessAt !== null && now - Date.parse(lastSuccessAt) > 2 * intervalMs;
    return {
      lastAttemptAt: latest ? new Date(latest.started_at).toISOString() : null,
      lastAttemptSucceeded: latest?.succeeded ?? null,
      lastSuccessAt,
      state: !latest ? 'no-history' : stale ? 'stale' : latest.succeeded ? 'succeeded' : 'failed',
    };
  }
}
