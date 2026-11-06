import { Injectable } from '@nestjs/common';
import { NwsService } from '../data-sources/nws/nws.service';
import { NwsPersistenceService } from './nws-persistence.service';

@Injectable()
export class NwsIngestionService {
  constructor(
    private readonly nws: NwsService,
    private readonly persistence: NwsPersistenceService,
  ) {}

  async refreshConditions(zoneId: string): Promise<string | null> {
    const attemptedAt = new Date().toISOString();
    let publishedAt: string | null = null;

    try {
      const condition = await this.nws.getConditions(zoneId);
      await this.persistence.saveCondition(condition);
      publishedAt = condition.source?.observedAt ?? null;
    } catch (error) {
      await this.persistence.recordRetrieval(
        'conditions',
        zoneId,
        false,
        attemptedAt,
      );
      throw error;
    }

    await this.persistence.recordRetrieval(
      'conditions',
      zoneId,
      true,
      attemptedAt,
    );
    return publishedAt;
  }

  async refreshAlerts(zoneId: string): Promise<void> {
    const attemptedAt = new Date().toISOString();

    try {
      const alerts = await this.nws.getActiveAlerts(zoneId);
      await this.persistence.saveAlerts(zoneId, alerts, attemptedAt);
    } catch (error) {
      await this.persistence.recordRetrieval(
        'alerts',
        zoneId,
        false,
        attemptedAt,
      );
      throw error;
    }

    await this.persistence.recordRetrieval(
      'alerts',
      zoneId,
      true,
      attemptedAt,
    );
  }

  async refreshZones(zoneIds: string[]): Promise<{ attempted: number; failed: number; publishedAt: string | null }> {
    let attempted = 0;
    let failed = 0;
    const publications: number[] = [];
    const zones = new Set(zoneIds);
    for (const zoneId of zones) {
      for (const refresh of [this.refreshConditions.bind(this), this.refreshAlerts.bind(this)]) {
        attempted++;
        try {
          const publication = await refresh(zoneId);
          if (typeof publication === 'string') publications.push(Date.parse(publication));
        } catch {
          failed++;
        }
      }
    }
    // The oldest forecast must be current; never let one fresh zone hide an old/missing issuance.
    const complete = publications.length === zones.size && publications.length > 0
      && publications.every(time => Number.isFinite(time));
    return { attempted, failed, publishedAt: complete ? new Date(Math.min(...publications)).toISOString() : null };
  }
}
