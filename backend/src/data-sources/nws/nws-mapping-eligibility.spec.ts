import type { Knex } from 'knex';
import { NWS_FALLBACK_REGISTRY_VERSION } from '../../ingestion/nws-fallback-registry';
import { operationalNwsZone, operationalNwsZones, type NwsMappingProvenance } from './nws-mapping-eligibility';

const automatic = { nws_forecast_zone: 'PRZ011', nws_mapping_method: 'automatic', latitude: 18.4, longitude: -67.1,
  nws_mapping_latitude: 18.4, nws_mapping_longitude: -67.1, nws_mapping_registry_version: null };
const fallback = { ...automatic, nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION };

describe('operational NWS mapping eligibility', () => {
  it.each([automatic, fallback])('accepts proven matching mapping %j', mapping => {
    expect(operationalNwsZone(mapping)).toBe('PRZ011');
  });
  it.each([
    ['legacy', { ...automatic, nws_mapping_method: 'legacy', nws_mapping_latitude: null, nws_mapping_longitude: null }],
    ['legacy with fabricated coordinates', { ...automatic, nws_mapping_method: 'legacy' }],
    ['missing provenance', { nws_forecast_zone: 'PRZ011' }],
    ['unknown method', { ...automatic, nws_mapping_method: 'guessed' }],
    ['missing coordinates', { ...automatic, latitude: null }],
    ['missing mapping latitude', { ...automatic, nws_mapping_latitude: null }],
    ['different latitude', { ...automatic, latitude: 18.4000000001 }],
    ['different longitude', { ...fallback, longitude: -67.1000000001 }],
    ['NaN', { ...automatic, latitude: NaN, nws_mapping_latitude: NaN }],
    ['infinity', { ...automatic, longitude: Infinity, nws_mapping_longitude: Infinity }],
    ['outside latitude range', { ...automatic, latitude: 91, nws_mapping_latitude: 91 }],
    ['outside longitude range', { ...automatic, longitude: -181, nws_mapping_longitude: -181 }],
    ['invalid zone', { ...automatic, nws_forecast_zone: 'AMZ745' }],
    ['fallback with missing registry revision', { ...fallback, nws_mapping_registry_version: null }],
    ['fallback with blank registry revision', { ...fallback, nws_mapping_registry_version: ' \t' }],
    ['fallback with previous registry revision', { ...fallback, nws_mapping_registry_version: '2026-10-25.v1' }],
    ['fallback with unknown future revision', { ...fallback, nws_mapping_registry_version: '2099-01-01.v99' }],
    ['fallback with padded current revision', { ...fallback, nws_mapping_registry_version: ` ${NWS_FALLBACK_REGISTRY_VERSION} ` }],
    ['automatic with fallback provenance', { ...automatic, nws_mapping_registry_version: 'v1' }],
  ] satisfies Array<[string, NwsMappingProvenance]>)('excludes %s', (_name, mapping) => {
    expect(operationalNwsZone(mapping)).toBeNull();
  });
  it('selects only operational zones for ingestion and deduplicates shared zones', async () => {
    const rows = [automatic, fallback, { ...automatic, nws_forecast_zone: 'PRZ002' },
      { ...automatic, nws_forecast_zone: 'PRZ003', nws_mapping_method: 'legacy' },
      { ...fallback, nws_forecast_zone: 'PRZ004', nws_mapping_registry_version: '2026-10-25.v1' },
      { ...automatic, nws_forecast_zone: 'PRZ005', nws_mapping_latitude: 18 }];
    const db = jest.fn(() => ({ select: jest.fn().mockResolvedValue(rows) })) as unknown as Knex;
    expect(await operationalNwsZones(db)).toEqual(['PRZ011', 'PRZ002']);
  });
});
