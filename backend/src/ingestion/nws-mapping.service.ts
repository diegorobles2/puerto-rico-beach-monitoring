import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { NwsService } from '../data-sources/nws/nws.service';
import { NwsInvalidCoordinatesError, NwsInvalidResponseError, NwsMarinePointError } from '../data-sources/nws/nws.errors';
import { NWS_FALLBACK_REGISTRY_VERSION } from './nws-fallback-registry';
import { findVerifiedNwsFallback } from './nws-fallback-selection';

export interface NwsMappingResult {
  automatic: number;
  verifiedFallbacks: number;
  preserved: number;
  unresolved: number;
  /** Overlaps preserved/unresolved: failed lookups, excluding recognized marine results. */
  lookupFailures: number;
}
interface BeachMapping {
  id: number | string;
  drna_station_id: string;
  latitude: number | null;
  longitude: number | null;
  nws_forecast_zone: string | null;
  nws_mapping_method: 'automatic' | 'verified-fallback' | 'legacy' | null;
  nws_mapping_latitude: number | null;
  nws_mapping_longitude: number | null;
  nws_mapping_registry_version: string | null;
  nws_mapping_error: string | null;
}
const columns = ['id', 'drna_station_id', 'latitude', 'longitude', 'nws_forecast_zone',
  'nws_mapping_method', 'nws_mapping_latitude', 'nws_mapping_longitude', 'nws_mapping_registry_version', 'nws_mapping_error'];
const cleared = { nws_forecast_zone: null, nws_mapping_method: null, nws_mapping_latitude: null,
  nws_mapping_longitude: null, nws_mapping_registry_version: null };
type Outcome = 'automatic' | 'verifiedFallbacks' | 'preserved' | 'unresolved';

@Injectable()
export class NwsMappingService {
  constructor(private readonly nws: NwsService, @Inject(DATABASE) private readonly db: Knex) {}

  async refresh(): Promise<NwsMappingResult> {
    const beaches = await this.db('beaches').select('id');
    const result: NwsMappingResult = { automatic: 0, verifiedFallbacks: 0, preserved: 0, unresolved: 0, lookupFailures: 0 };
    for (const { id } of beaches) {
      // Never keep a DB lock open across an external request. Clear known stale mappings first.
      const beach = await this.db.transaction(async trx => {
        const current = await trx('beaches').where({ id }).forUpdate().first<BeachMapping>(columns);
        if (current) await this.invalidateStale(trx, current);
        return current;
      });
      if (!beach) { result.unresolved++; continue; }
      let zone: string | undefined;
      let failure: unknown;
      try {
        if (!validCoordinates(beach)) throw new NwsInvalidCoordinatesError(Number(beach.latitude), Number(beach.longitude));
        zone = await this.nws.getForecastZone(beach.latitude!, beach.longitude!);
        if (!/^PRZ\d{3}$/.test(zone)) throw new NwsInvalidResponseError('NWS returned an invalid Puerto Rico forecast zone', 'https://api.weather.gov');
      } catch (error) {
        failure = error instanceof NwsMarinePointError
          && (error.latitude !== beach.latitude || error.longitude !== beach.longitude)
          ? new NwsInvalidResponseError('NWS marine result belongs to different coordinates', error.sourceUrl ?? 'https://api.weather.gov')
          : error;
        if (!(failure instanceof NwsMarinePointError)) result.lookupFailures++;
      }
      const outcome = await this.db.transaction(async trx => {
        const current = await trx('beaches').where({ id }).forUpdate().first<BeachMapping>(columns);
        if (!current) return 'unresolved' as const;
        await this.invalidateStale(trx, current);
        // A station/coordinate edit during lookup defers this beach to a new run.
        const coordinatesChanged = current.latitude !== beach.latitude || current.longitude !== beach.longitude;
        if (coordinatesChanged || current.drna_station_id !== beach.drna_station_id) {
          // Defense in depth if an older writer bypassed the coordinate-change trigger.
          if (coordinatesChanged && current.nws_forecast_zone && current.nws_mapping_method === 'legacy') {
            await this.save(trx, current, { ...cleared, nws_mapping_error: 'NWS mapping invalidated because beach coordinates changed' });
          }
          return 'unresolved' as const;
        }
        if (zone && !failure) {
          return await this.save(trx, current, { nws_forecast_zone: zone, nws_mapping_method: 'automatic',
            nws_mapping_latitude: current.latitude, nws_mapping_longitude: current.longitude,
            nws_mapping_registry_version: null, nws_mapping_error: null }) ? 'automatic' as const : 'unresolved' as const;
        }
        if (failure instanceof NwsMarinePointError && failure.latitude === current.latitude && failure.longitude === current.longitude) {
          // An automatic mapping already verified for these coordinates remains preferred.
          if (current.nws_forecast_zone && current.nws_mapping_method === 'automatic') return 'preserved' as const;
          const fallback = findVerifiedNwsFallback(current.drna_station_id, current.latitude!, current.longitude!, failure.marineZone);
          if (fallback) {
            return await this.save(trx, current, { nws_forecast_zone: fallback.fallbackForecastZone,
              nws_mapping_method: 'verified-fallback', nws_mapping_latitude: current.latitude,
              nws_mapping_longitude: current.longitude, nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION,
              nws_mapping_error: null }) ? 'verifiedFallbacks' as const : 'unresolved' as const;
          }
        }
        // Retain unchanged legacy assignments as history for every failed lookup,
        // including unsupported marine points. Operational readers exclude legacy.
        if (current.nws_forecast_zone && (current.nws_mapping_method === 'legacy'
          || !(failure instanceof NwsMarinePointError))) return 'preserved' as const;
        await this.save(trx, current, { ...cleared,
          nws_mapping_error: failure instanceof NwsMarinePointError
            ? `${failure.message}; no complete verified fallback matches this station, coordinates and marine zone`
            : failure instanceof Error ? failure.message : 'NWS point lookup failed' });
        return 'unresolved' as const;
      });
      result[outcome as Outcome]++;
    }
    return result;
  }

  private async invalidateStale(trx: Knex.Transaction, beach: BeachMapping): Promise<void> {
    if (!beach.nws_forecast_zone) return;
    // Legacy has no historical coordinate provenance. Only the coordinate-change trigger can
    // establish that it moved; failed lookups preserve its history without claiming verification.
    if (beach.nws_mapping_method === 'legacy') return;
    if (validCoordinates(beach) && (beach.nws_mapping_method === 'automatic' || beach.nws_mapping_method === 'verified-fallback')
      && beach.nws_mapping_latitude === beach.latitude && beach.nws_mapping_longitude === beach.longitude) return;
    await this.save(trx, beach, { ...cleared, nws_mapping_error: 'NWS mapping is stale for current beach coordinates' });
  }

  private async save(trx: Knex.Transaction, beach: BeachMapping, changes: Partial<BeachMapping>): Promise<boolean> {
    // Every caller holds this row FOR UPDATE. Compare the freshly locked state,
    // never the snapshot taken before the NWS request. A no-op still succeeds.
    if (Object.entries(changes).every(([key, value]) => beach[key as keyof BeachMapping] === value)) return true;
    const affected = await trx('beaches').where({ id: beach.id, drna_station_id: beach.drna_station_id,
      latitude: beach.latitude, longitude: beach.longitude }).update(changes);
    if (affected !== 1) return false;
    Object.assign(beach, changes);
    return true;
  }
}

function validCoordinates(beach: BeachMapping): boolean {
  return beach.latitude !== null && Number.isFinite(beach.latitude) && beach.latitude >= -90 && beach.latitude <= 90
    && beach.longitude !== null && Number.isFinite(beach.longitude) && beach.longitude >= -180 && beach.longitude <= 180;
}
