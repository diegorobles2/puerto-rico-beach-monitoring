import type { Knex } from 'knex';
import { NWS_FALLBACK_REGISTRY_VERSION } from '../../ingestion/nws-fallback-registry';

/** The same provenance fields must accompany every operational zone read. */
export const NWS_OPERATIONAL_MAPPING_COLUMNS = [
  'nws_forecast_zone', 'nws_mapping_method', 'latitude', 'longitude',
  'nws_mapping_latitude', 'nws_mapping_longitude', 'nws_mapping_registry_version',
] as const;

export interface NwsMappingProvenance {
  nws_forecast_zone?: unknown;
  nws_mapping_method?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  nws_mapping_latitude?: unknown;
  nws_mapping_longitude?: unknown;
  nws_mapping_registry_version?: unknown;
}

/** Retained history is not authorization to return zone-based forecasts or alerts. */
export function operationalNwsZone(mapping: NwsMappingProvenance): string | null {
  const zone = mapping.nws_forecast_zone;
  if (typeof zone !== 'string' || !/^PRZ\d{3}$/.test(zone)
    || (mapping.nws_mapping_method !== 'automatic' && mapping.nws_mapping_method !== 'verified-fallback')
    || typeof mapping.latitude !== 'number' || !Number.isFinite(mapping.latitude) || mapping.latitude < -90 || mapping.latitude > 90
    || typeof mapping.longitude !== 'number' || !Number.isFinite(mapping.longitude) || mapping.longitude < -180 || mapping.longitude > 180
    || mapping.nws_mapping_latitude !== mapping.latitude || mapping.nws_mapping_longitude !== mapping.longitude) return null;
  if (mapping.nws_mapping_method === 'automatic') {
    if (mapping.nws_mapping_registry_version !== null) return null;
  } else {
    // A superseded review may have changed or withdrawn an assignment. Keep its
    // history, but require mapping revalidation before operational use.
    if (mapping.nws_mapping_registry_version !== NWS_FALLBACK_REGISTRY_VERSION) return null;
  }
  return zone;
}

/** Ingestion may share a zone across beaches, but legacy history cannot authorize it. */
export async function operationalNwsZones(db: Knex): Promise<string[]> {
  const beaches: NwsMappingProvenance[] = await db('beaches').select(...NWS_OPERATIONAL_MAPPING_COLUMNS);
  return [...new Set(beaches.flatMap(beach => {
    const zone = operationalNwsZone(beach);
    return zone ? [zone] : [];
  }))];
}
