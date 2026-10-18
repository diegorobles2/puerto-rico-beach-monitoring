import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import type { AlertsResponseDto, BeachAlertDto } from './dto/alerts-response.dto';
import type {
  NwsAvailability,
  OceanRisk,
  OceanRiskResponseDto,
} from './dto/ocean-risk-response.dto';

const HOUR_MS = 60 * 60 * 1000;

// NWS data is planned to refresh every 30 minutes. Allow missed refreshes
// before the stored data stops counting as current.
export const OCEAN_RISK_RETRIEVAL_STALE_AFTER_MS = 6 * HOUR_MS;
// A forecast keeps being retrieved even if NWS stops issuing new ones.
export const OCEAN_RISK_ISSUANCE_STALE_AFTER_MS = 36 * HOUR_MS;
// An old alert check cannot rule out alerts issued since then.
export const ALERTS_STALE_AFTER_MS = HOUR_MS;

@Injectable()
export class NwsConditionsService {
  constructor(@Inject(DATABASE) private readonly db: Knex) {}

  async getOceanRisk(beachId: number): Promise<OceanRiskResponseDto> {
    const zoneId = await this.findForecastZone(beachId);

    const unavailable = (
      unavailableReason: OceanRiskResponseDto['unavailableReason'],
    ): OceanRiskResponseDto => ({
      beachId,
      zoneId,
      status: 'unknown',
      summary: 'NWS rip-current risk is unavailable for this beach.',
      forecastPeriod: null,
      source: 'NWS',
      observedAt: null,
      retrievedAt: null,
      availability: 'unavailable',
      unavailableReason,
    });

    if (!zoneId) return unavailable('beach-not-mapped');

    const condition = await this.db('nws_conditions')
      .where({ zone_id: zoneId })
      .first(
        'forecast_period',
        'risk',
        'summary',
        'source_url',
        'observed_at',
        'retrieved_at',
      );

    if (!condition) return unavailable('no-data');

    const observedAt = toIsoStringOrNull(condition.observed_at);
    const retrievedAt = toIsoStringOrNull(condition.retrieved_at)!;
    const provenance = {
      sourceUrl: condition.source_url ?? undefined,
      observedAt,
      retrievedAt,
    };

    if (condition.risk === 'unknown') {
      return { ...unavailable('risk-not-published'), ...provenance };
    }

    const stale =
      isOlderThan(retrievedAt, OCEAN_RISK_RETRIEVAL_STALE_AFTER_MS) ||
      isOlderThan(observedAt, OCEAN_RISK_ISSUANCE_STALE_AFTER_MS);

    if (stale) {
      return {
        beachId,
        zoneId,
        status: 'unknown',
        lastKnownStatus: condition.risk as OceanRisk,
        summary: 'NWS rip-current risk data is out of date.',
        forecastPeriod: condition.forecast_period,
        source: 'NWS',
        ...provenance,
        availability: 'stale',
      };
    }

    return {
      beachId,
      zoneId,
      status: condition.risk as OceanRisk,
      summary: condition.summary,
      forecastPeriod: condition.forecast_period,
      source: 'NWS',
      ...provenance,
      availability: 'available',
    };
  }

  async getAlerts(beachId: number): Promise<AlertsResponseDto> {
    const zoneId = await this.findForecastZone(beachId);

    const unavailable = (
      unavailableReason: AlertsResponseDto['unavailableReason'],
    ): AlertsResponseDto => ({
      beachId,
      zoneId,
      status: 'unknown',
      source: 'NWS',
      retrievedAt: null,
      availability: 'unavailable',
      unavailableReason,
      alerts: null,
    });

    if (!zoneId) return unavailable('beach-not-mapped');

    // The snapshot records the last successful alert check, including checks
    // that found no alerts, which is what separates "none" from "unknown".
    const snapshot = await this.db('nws_alert_snapshots')
      .where({ zone_id: zoneId })
      .first('retrieved_at');

    if (!snapshot) return unavailable('no-data');

    const rows = await this.db('nws_alerts as a')
      .join('nws_alert_zones as az', 'a.id', 'az.alert_id')
      .where('az.zone_id', zoneId)
      .where('az.is_active', true)
      .where('a.expires_at', '>', new Date().toISOString())
      .orderBy('a.expires_at', 'asc')
      .select(
        'a.id',
        'a.title',
        'a.description',
        'a.instruction',
        'a.severity',
        'a.certainty',
        'a.urgency',
        'a.effective_at',
        'a.expires_at',
        'a.source_url',
        'a.observed_at',
        'a.retrieved_at',
      );

    const alerts = rows.map(toAlertDto);
    const retrievedAt = toIsoStringOrNull(snapshot.retrieved_at)!;
    const availability: NwsAvailability = isOlderThan(
      retrievedAt,
      ALERTS_STALE_AFTER_MS,
    )
      ? 'stale'
      : 'available';

    return {
      beachId,
      zoneId,
      status:
        alerts.length > 0
          ? 'active-alerts'
          : availability === 'available'
            ? 'no-active-alerts'
            : 'unknown',
      source: 'NWS',
      retrievedAt,
      availability,
      alerts,
    };
  }

  private async findForecastZone(beachId: number): Promise<string | null> {
    const beach = await this.db('beaches')
      .where({ id: beachId })
      .first('id', 'nws_forecast_zone');

    if (!beach) {
      throw new NotFoundException(
        `Beach with identifier "${beachId}" was not found`,
      );
    }

    return beach.nws_forecast_zone ?? null;
  }
}

function toAlertDto(row: Record<string, unknown>): BeachAlertDto {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    instruction: (row.instruction as string | null) ?? null,
    severity: row.severity as string,
    certainty: row.certainty as string,
    urgency: row.urgency as string,
    effectiveAt: toIsoStringOrNull(row.effective_at)!,
    expiresAt: toIsoStringOrNull(row.expires_at)!,
    observedAt: toIsoStringOrNull(row.observed_at),
    retrievedAt: toIsoStringOrNull(row.retrieved_at)!,
    sourceUrl: (row.source_url as string | null) ?? undefined,
  };
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Missing or unparseable times count as old so they can never look current.
function isOlderThan(isoTime: string | null, maxAgeMs: number): boolean {
  if (!isoTime) return true;
  return Date.now() - new Date(isoTime).getTime() > maxAgeMs;
}
