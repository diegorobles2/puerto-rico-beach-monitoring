import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { NwsService } from '../data-sources/nws/nws.service';
import {
  findVerifiedNwsFallback,
  NWS_FALLBACK_REGISTRY_VERSION,
} from './nws-fallback-registry';

export interface NwsMappingResult {
  mapped: number;
  unsupported: number;
}

@Injectable()
export class NwsMappingService {
  constructor(
    private readonly nws: NwsService,
    @Inject(DATABASE) private readonly db: Knex,
  ) {}

  async refresh(): Promise<NwsMappingResult> {
    const beaches = await this.db('beaches')
      .select('id', 'drna_station_id', 'latitude', 'longitude');

    const result = { mapped: 0, unsupported: 0 };

    for (const beach of beaches) {
      const latitude = Number(beach.latitude);
      const longitude = Number(beach.longitude);

      if (beach.latitude == null || beach.longitude == null) {
        await this.recordError(beach.id, 'Beach has no coordinates');
        result.unsupported++;
        continue;
      }

      try {
        const zoneUrl = await this.nws.getForecastZoneUrl(latitude, longitude);

        const landZone = /\/zones\/forecast\/(PRZ\d{3})\/?$/.exec(zoneUrl);
        const marineZone = /\/zones\/forecast\/(AMZ\d{3})\/?$/.exec(zoneUrl);

        let zone: string;
        let method: 'automatic' | 'verified-fallback';
        let registryVersion: string | null = null;

        if (landZone) {
          zone = landZone[1];
          method = 'automatic';
        } else if (marineZone) {
          const fallback = findVerifiedNwsFallback(
            beach.drna_station_id,
            latitude,
            longitude,
            marineZone[1],
          );

          if (!fallback) {
            throw new Error('No verified fallback for this marine zone');
          }

          zone = fallback.fallbackForecastZone;
          method = 'verified-fallback';
          registryVersion = NWS_FALLBACK_REGISTRY_VERSION;
        } else {
          throw new Error('NWS point response has no Puerto Rico forecast zone');
        }

        const updated = await this.db('beaches')
          .where({ id: beach.id, latitude, longitude })
          .update({
            nws_forecast_zone: zone,
            nws_mapping_method: method,
            nws_mapping_latitude: latitude,
            nws_mapping_longitude: longitude,
            nws_mapping_registry_version: registryVersion,
            nws_mapping_error: null,
          });

        if (updated === 0) {
          result.unsupported++;
        } else {
          result.mapped++;
        }
      } catch (error) {
        await this.recordError(
          beach.id,
          error instanceof Error ? error.message : 'NWS point lookup failed',
          latitude,
          longitude,
        );
        result.unsupported++;
      }
    }

    return result;
  }

  private async recordError(
    beachId: number,
    reason: string,
    latitude?: number,
    longitude?: number,
  ): Promise<void> {
    const conditions = latitude !== undefined && longitude !== undefined
      ? { id: beachId, latitude, longitude }
      : { id: beachId, latitude: null, longitude: null };

    await this.db('beaches')
      .where(conditions)
      .whereNull('nws_forecast_zone')
      .update({
        nws_forecast_zone: null,
        nws_mapping_method: null,
        nws_mapping_latitude: null,
        nws_mapping_longitude: null,
        nws_mapping_registry_version: null,
        nws_mapping_error: reason,
      });
  }
}