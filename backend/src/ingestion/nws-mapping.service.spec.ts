import type { Knex } from 'knex';
import type { NwsService } from '../data-sources/nws/nws.service';
import { NwsMappingService } from './nws-mapping.service';

interface BeachRow {
  id: number;
  latitude: number | null;
  longitude: number | null;
  nws_forecast_zone: string | null;
  nws_mapping_error: string | null;
}

describe('NwsMappingService', () => {
  it('maps every beach repeatedly without creating rows', async () => {
    const rows = [beach(1), beach(2)];
    const service = new NwsMappingService(nwsResolving('PRZ001'), fakeDatabase(rows));

    await expect(service.refresh()).resolves.toEqual({ mapped: 2, unsupported: 0 });
    await service.refresh();

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.nws_forecast_zone === 'PRZ001' && row.nws_mapping_error === null)).toBe(true);
  });

  it('records an unavailable point as unsupported', async () => {
    const rows = [beach(1)];
    const nws = { getForecastZoneUrl: jest.fn().mockRejectedValue(new Error('NWS point metadata returned HTTP 404')) } as unknown as NwsService;

    await expect(new NwsMappingService(nws, fakeDatabase(rows)).refresh())
      .resolves.toEqual({ mapped: 0, unsupported: 1 });
    expect(rows[0].nws_mapping_error).toBe('NWS point metadata returned HTTP 404');
  });

  it('does not let a malformed response overwrite a valid mapping', async () => {
    const rows = [beach(1, 'PRZ007')];
    const nws = { getForecastZoneUrl: jest.fn().mockRejectedValue(new Error('NWS point response has no Puerto Rico forecast zone')) } as unknown as NwsService;

    await new NwsMappingService(nws, fakeDatabase(rows)).refresh();

    expect(rows[0]).toMatchObject({ nws_forecast_zone: 'PRZ007', nws_mapping_error: null });
  });

  it('prefers an automatic land zone over a verified fallback', async () => {
    const rows = [{
      ...beach(1),
      drna_station_id: 'RW-12B',
      latitude: 17.9747944,
      longitude: -67.2129056,
    }];

    const service = new NwsMappingService(
      nwsResolving('PRZ005'),
      fakeDatabase(rows),
    );

    await expect(service.refresh()).resolves.toEqual({
      mapped: 1,
      unsupported: 0,
    });

    expect(rows[0]).toMatchObject({
      nws_forecast_zone: 'PRZ005',
      nws_mapping_method: 'automatic',
      nws_mapping_registry_version: null,
    });
  });
  it('leaves an unverified marine zone unresolved', async () => {
    const rows = [{
      ...beach(1),
      drna_station_id: 'RW-12B',
      latitude: 17.9747944,
      longitude: -67.2129056,
    }];

    const service = new NwsMappingService(
      nwsResolving('AMZ712'),
      fakeDatabase(rows),
    );

    await expect(service.refresh()).resolves.toEqual({
      mapped: 0,
      unsupported: 1,
    });

    expect(rows[0].nws_forecast_zone).toBeNull();
    expect(rows[0].nws_mapping_error).toBe(
      'No verified fallback for this marine zone',
    );
  });
});

function beach(id: number, zone: string | null = null): BeachRow {
  return { id, latitude: 18.3843639, longitude: -67.2129889, nws_forecast_zone: zone, nws_mapping_error: null };
}


function fakeDatabase(rows: BeachRow[]): Knex {
  return jest.fn(() => ({
    select: jest.fn().mockResolvedValue(rows),
    where: ({ id }: { id: number }) => {
      let onlyWithoutZone = false;
      const query = {
        whereNull: () => { onlyWithoutZone = true; return query; },
        update: async (changes: Partial<BeachRow>) => {
          const row = rows.find((item) => item.id === id);
          if (row && (!onlyWithoutZone || row.nws_forecast_zone == null)) Object.assign(row, changes);
        },
      };
      return query;
    },
  })) as unknown as Knex;
}

function nwsResolving(zone: string): NwsService {
  return {
    getForecastZoneUrl: jest.fn().mockResolvedValue(
      `https://api.weather.gov/zones/forecast/${zone}`,
    ),
  } as unknown as NwsService;
}