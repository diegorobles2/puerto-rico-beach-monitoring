import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { NwsIngestionService } from './nws-ingestion.service';
import { IngestionService } from './ingestion.service';

export const NWS_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
export const DRNA_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class IngestionScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(IngestionScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  // shortcut: one scheduler-enabled process; add distributed locking before enabling multiple replicas.
  private running = false;
  private drnaTimer?: ReturnType<typeof setInterval>;
  private drnaRunning = false;

  constructor(
    @Inject(DATABASE) private readonly db: Knex,
    private readonly nws: NwsIngestionService,
    private readonly drna: IngestionService,
  ) {}

  start(): void {
    if (process.env.NWS_SCHEDULER_ENABLED !== 'false' && !this.timer) {
      this.timer = setInterval(() => { void this.tick(); }, NWS_REFRESH_INTERVAL_MS);
      void this.tick();
    }
    if (process.env.DRNA_SCHEDULER_ENABLED !== 'false' && !this.drnaTimer) {
      this.drnaTimer = setInterval(() => { void this.tickDrna(); }, DRNA_REFRESH_INTERVAL_MS);
      void this.tickDrna();
    }
  }

  async tickDrna(): Promise<void> {
    if (this.drnaRunning) {
      this.logger.warn('Skipping overlapping DRNA refresh');
      return;
    }
    this.drnaRunning = true;
    try {
      await this.drna.refresh();
      this.logger.log('DRNA refresh complete');
    } catch {
      this.logger.error('DRNA refresh failed; retrying on the next scheduled tick');
    } finally {
      this.drnaRunning = false;
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping NWS refresh');
      return;
    }
    this.running = true;
    try {
      const zones = await this.db('beaches').distinct('nws_forecast_zone').whereNotNull('nws_forecast_zone');
      const result = await this.nws.refreshZones(zones.map(row => row.nws_forecast_zone));
      this.logger.log(`NWS refresh: ${result.attempted - result.failed}/${result.attempted} requests saved`);
      if (result.failed) this.logger.warn(`${result.failed} NWS refresh requests failed`);
    } catch {
      this.logger.error('NWS refresh failed; retrying on the next scheduled tick');
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.drnaTimer) clearInterval(this.drnaTimer);
    this.drnaTimer = undefined;
  }
}
