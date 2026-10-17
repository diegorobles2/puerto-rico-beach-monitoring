import { Injectable } from '@nestjs/common';
import { NwsService } from '../data-sources/nws/nws.service';
import { NwsPersistenceService } from './nws-persistence.service';

@Injectable()
export class NwsIngestionService {
  constructor(
    private readonly nws: NwsService,
    private readonly persistence: NwsPersistenceService,
  ) {}

  async refreshConditions(zoneId: string): Promise<void> {
    const attemptedAt = new Date().toISOString();

    try {
      const condition = await this.nws.getConditions(zoneId);

      await this.persistence.saveCondition(condition);

      await this.persistence.recordRetrieval(
        'conditions',
        zoneId,
        true,
        attemptedAt,
      );
    } catch (error) {
      await this.persistence.recordRetrieval(
        'conditions',
        zoneId,
        false,
        attemptedAt,
      );

      throw error;
    }
  }

  async refreshAlerts(zoneId: string): Promise<void> {
    const attemptedAt = new Date().toISOString();

    try {
      const alerts = await this.nws.getActiveAlerts(zoneId);

      await this.persistence.saveAlerts(
        zoneId,
        alerts,
        attemptedAt,
      );

      await this.persistence.recordRetrieval(
        'alerts',
        zoneId,
        true,
        attemptedAt,
      );
    } catch (error) {
      await this.persistence.recordRetrieval(
        'alerts',
        zoneId,
        false,
        attemptedAt,
      );

      throw error;
    }
  }

  async refreshZones(zoneIds: string[]): Promise<{ attempted: number; failed: number }> {
    let attempted = 0;
    let failed = 0;
    for (const zoneId of new Set(zoneIds)) {
      for (const refresh of [this.refreshConditions.bind(this), this.refreshAlerts.bind(this)]) {
        attempted++;
        try {
          await refresh(zoneId);
        } catch {
          failed++;
        }
      }
    }
    return { attempted, failed };
  }
}
