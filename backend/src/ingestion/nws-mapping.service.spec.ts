import type { Knex } from 'knex';
import type { NwsService } from '../data-sources/nws/nws.service';
import { NwsHttpError, NwsInvalidCoordinatesError, NwsInvalidResponseError, NwsInvalidZoneError, NwsMarinePointError, NwsTransportError } from '../data-sources/nws/nws.errors';
import { NWS_FALLBACK_REGISTRY_VERSION, NWS_FALLBACK_REVIEWS, type NwsFallbackReview } from './nws-fallback-registry';
import { findVerifiedNwsFallback } from './nws-fallback-selection';
import { NwsMappingService } from './nws-mapping.service';

const url = 'https://api.weather.gov/points/17.9747944,-67.2129056';
function beach(id = 1, changes: Record<string, unknown> = {}) {
  return { id, drna_station_id: 'RW-12B', latitude: 17.9747944, longitude: -67.2129056,
    nws_forecast_zone: null as string | null, nws_mapping_method: null as string | null,
    nws_mapping_latitude: null as number | null, nws_mapping_longitude: null as number | null,
    nws_mapping_registry_version: null as string | null, nws_mapping_error: null as string | null, ...changes };
}
type Row = ReturnType<typeof beach>;
const automatic = { nws_forecast_zone: 'PRZ007', nws_mapping_method: 'automatic', nws_mapping_latitude: 17.9747944, nws_mapping_longitude: -67.2129056 };
const previousFallback = { ...automatic, nws_forecast_zone: 'PRZ011', nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION };
const marine = (zone = 'AMZ745') => new NwsMarinePointError(zone, 17.9747944, -67.2129056, url);
const counters = (changes: Partial<Awaited<ReturnType<NwsMappingService['refresh']>>> = {}) =>
  ({ automatic: 0, verifiedFallbacks: 0, preserved: 0, unresolved: 0, lookupFailures: 0, ...changes });
function nwsWith(fn: jest.Mock): NwsService { return { getForecastZone: fn } as unknown as NwsService; }
function database(rows: Row[], beforeUpdate?: () => void): Knex {
  const db = jest.fn(() => {
    let criteria: Record<string, unknown> = {};
    const matches = (row: Row) => Object.entries(criteria).every(([key, value]) => (row[key as keyof Row] === value || Object.is(row[key as keyof Row], value)));
    const query = {
      select: async () => rows.map(row => ({ ...row })),
      where: (values: Record<string, unknown>) => { criteria = { ...criteria, ...values }; return query; },
      forUpdate: () => query,
      first: async () => { const row = rows.find(matches); return row ? { ...row } : undefined; },
      update: async (changes: Partial<Row>) => {
        beforeUpdate?.();
        const found = rows.filter(matches);
        found.forEach(row => Object.assign(row, changes));
        return found.length;
      },
    };
    return query;
  });
  Object.assign(db, { transaction: async (fn: (trx: Knex) => unknown) => fn(db as unknown as Knex) });
  return db as unknown as Knex;
}

describe('NwsMappingService', () => {
  it('attempts automatic mapping first and records exact coordinates instead of applying an eligible fallback', async () => {
    const rows = [beach()]; const get = jest.fn().mockResolvedValue('PRZ001');
    expect(await new NwsMappingService(nwsWith(get), database(rows)).refresh()).toEqual(counters({ automatic: 1 }));
    expect(get).toHaveBeenCalledWith(rows[0].latitude, rows[0].longitude);
    expect(rows[0]).toMatchObject({ nws_forecast_zone: 'PRZ001', nws_mapping_method: 'automatic',
      nws_mapping_latitude: rows[0].latitude, nws_mapping_longitude: rows[0].longitude, nws_mapping_registry_version: null });
  });
  it('repeated automatic refreshes leave identical mapping state', async () => {
    const rows = [beach()]; const service = new NwsMappingService(nwsWith(jest.fn().mockResolvedValue('PRZ001')), database(rows));
    expect(await service.refresh()).toEqual(counters({ automatic: 1 })); const before = structuredClone(rows);
    expect(await service.refresh()).toEqual(counters({ automatic: 1 })); expect(rows).toEqual(before);
  });
  it('upgrades an existing fallback to automatic', async () => {
    const rows = [beach(1, previousFallback)];
    await new NwsMappingService(nwsWith(jest.fn().mockResolvedValue('PRZ002')), database(rows)).refresh();
    expect(rows[0]).toMatchObject({ nws_mapping_method: 'automatic', nws_forecast_zone: 'PRZ002', nws_mapping_registry_version: null });
  });
  it('applies the verified fallback idempotently after a recognized marine result', async () => {
    const rows = [beach(1, { nws_mapping_error: 'Old error' })];
    const service = new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(marine())), database(rows));
    expect(await service.refresh()).toEqual(counters({ verifiedFallbacks: 1 }));
    const first = structuredClone(rows);
    expect(await service.refresh()).toEqual(counters({ verifiedFallbacks: 1 }));
    expect(rows).toEqual(first);
    expect(rows[0]).toMatchObject({ nws_mapping_method: 'verified-fallback', nws_forecast_zone: 'PRZ011',
      nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION, nws_mapping_latitude: rows[0].latitude,
      nws_mapping_longitude: rows[0].longitude, nws_mapping_error: null });
  });
  it.each([
    ['unknown station', { drna_station_id: 'unknown' }, marine()],
    ['changed latitude', { latitude: 17.974794400001 }, new NwsMarinePointError('AMZ745', 17.974794400001, -67.2129056, url)],
    ['changed longitude', { longitude: -67.212905600001 }, new NwsMarinePointError('AMZ745', 17.9747944, -67.212905600001, url)],
    ['different marine zone', {}, marine('AMZ712')],
    ['error for different coordinates', {}, new NwsMarinePointError('AMZ745', 18, -67, url)],
  ] as const)('does not infer a fallback for %s', async (_name, changes, failure) => {
    const rows = [beach(1, changes)];
    const result = await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(failure)), database(rows)).refresh();
    expect(result.unresolved).toBe(1); expect(result.verifiedFallbacks).toBe(0);
    expect(rows[0].nws_forecast_zone).toBeNull(); expect(rows[0].nws_mapping_error).toBeTruthy();
  });
  it.each([new NwsHttpError(404, 'point metadata', url), new NwsHttpError(429, 'point metadata', url),
    new NwsHttpError(503, 'point metadata', url), new NwsTransportError('timeout', 'point metadata', url),
    new NwsTransportError('network', 'point metadata', url), new NwsInvalidResponseError('Malformed', url)])(
    'never activates a fallback after %s', async error => {
      const rows = [beach()];
      expect(await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(error)), database(rows)).refresh())
        .toEqual(counters({ unresolved: 1, lookupFailures: 1 }));
      expect(rows[0].nws_forecast_zone).toBeNull();
    },
  );
  it.each([automatic, previousFallback])('preserves a current proven mapping on failure: %j', async mapping => {
    const rows = [beach(1, mapping)]; const before = structuredClone(rows);
    expect(await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(new NwsTransportError('network', 'point metadata', url))), database(rows)).refresh())
      .toEqual(counters({ preserved: 1, lookupFailures: 1 }));
    expect(rows).toEqual(before);
  });
  it('keeps a current automatic mapping preferred over a marine fallback', async () => {
    const rows = [beach(1, automatic)];
    expect(await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(marine())), database(rows)).refresh()).toEqual(counters({ preserved: 1 }));
    expect(rows[0].nws_forecast_zone).toBe('PRZ007');
  });
  it.each([automatic, previousFallback])('invalidates stale mapping before a failed lookup: %j', async mapping => {
    const rows = [beach(1, { ...mapping, latitude: 18 })];
    const get = jest.fn().mockImplementation(async () => { expect(rows[0].nws_forecast_zone).toBeNull(); throw new NwsTransportError('timeout', 'point metadata', url); });
    expect(await new NwsMappingService(nwsWith(get), database(rows)).refresh()).toEqual(counters({ unresolved: 1, lookupFailures: 1 }));
    expect(rows[0]).toMatchObject({ nws_forecast_zone: null, nws_mapping_method: null, nws_mapping_latitude: null, nws_mapping_registry_version: null });
  });
  it.each([null, NaN, 91])('invalidates unusable coordinates %s without invoking NWS', async latitude => {
    const rows = [beach(1, { ...automatic, latitude })]; const get = jest.fn();
    expect(await new NwsMappingService(nwsWith(get), database(rows)).refresh()).toEqual(counters({ unresolved: 1, lookupFailures: 1 }));
    expect(get).not.toHaveBeenCalled(); expect(rows[0].nws_forecast_zone).toBeNull();
  });
  it('preserves legacy on temporary failure without inventing provenance, then upgrades on success', async () => {
    const rows = [beach(1, { nws_forecast_zone: 'PRZ001', nws_mapping_method: 'legacy' })];
    const get = jest.fn().mockRejectedValueOnce(new NwsHttpError(503, 'point metadata', url)).mockResolvedValue('PRZ011');
    const service = new NwsMappingService(nwsWith(get), database(rows));
    expect(await service.refresh()).toEqual(counters({ preserved: 1, lookupFailures: 1 }));
    expect(rows[0].nws_mapping_latitude).toBeNull(); expect(rows[0].nws_mapping_method).toBe('legacy');
    expect(await service.refresh()).toEqual(counters({ automatic: 1 }));
    expect(rows[0]).toMatchObject({ nws_mapping_method: 'automatic', nws_mapping_latitude: rows[0].latitude });
  });
  it('retains unverifiable legacy history on 404 without promoting it', async () => {
    const rows = [beach(1, { nws_forecast_zone: 'PRZ001', nws_mapping_method: 'legacy' })];
    expect(await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(new NwsHttpError(404, 'point metadata', url))), database(rows)).refresh())
      .toEqual(counters({ preserved: 1, lookupFailures: 1 }));
    expect(rows[0]).toMatchObject({ nws_forecast_zone: 'PRZ001', nws_mapping_method: 'legacy', nws_mapping_latitude: null });
  });
  it('rejects lookup results after concurrent coordinate edits', async () => {
    const rows = [beach()];
    const get = jest.fn().mockImplementation(async () => { rows[0].latitude = 18; return 'PRZ011'; });
    expect(await new NwsMappingService(nwsWith(get), database(rows)).refresh()).toEqual(counters({ unresolved: 1 }));
    expect(rows[0].nws_forecast_zone).toBeNull();
  });
  it.each([automatic, previousFallback, { nws_forecast_zone: 'PRZ001', nws_mapping_method: 'legacy' }])(
    'also clears an observed mid-lookup coordinate mismatch if a writer bypassed the trigger: %j', async mapping => {
      const rows = [beach(1, mapping)];
      const get = jest.fn().mockImplementation(async () => { rows[0].longitude = -66; throw new NwsTransportError('timeout', 'point metadata', url); });
      expect(await new NwsMappingService(nwsWith(get), database(rows)).refresh()).toEqual(counters({ unresolved: 1, lookupFailures: 1 }));
      expect(rows[0].nws_forecast_zone).toBeNull();
    },
  );
  it('guards the actual update with coordinates and does not report a rejected write as mapped', async () => {
    const rows = [beach()]; const db = database(rows, () => { rows[0].latitude = 18; });
    expect(await new NwsMappingService(nwsWith(jest.fn().mockResolvedValue('PRZ011')), db).refresh()).toEqual(counters({ unresolved: 1 }));
    expect(rows[0].nws_forecast_zone).toBeNull();
  });
  it('does not convert database write errors into lookup failures or fallback attempts', async () => {
    const rows = [beach()]; const db = database(rows, () => { throw new Error('Database unavailable'); });
    await expect(new NwsMappingService(nwsWith(jest.fn().mockResolvedValue('PRZ011')), db).refresh()).rejects.toThrow('Database unavailable');
  });
  it('reports mutually exclusive outcomes and overlapping lookup-failure counts', async () => {
    const rows = [beach(1), beach(2), beach(3, automatic), beach(4, { drna_station_id: 'RW-1A', latitude: 18.3855917, longitude: -65.7294722 }),
      beach(5, { drna_station_id: 'unknown' }), beach(6, { nws_forecast_zone: 'PRZ001', nws_mapping_method: 'legacy' })];
    const get = jest.fn().mockResolvedValueOnce('PRZ001').mockRejectedValueOnce(marine())
      .mockRejectedValueOnce(new NwsTransportError('network', 'point metadata', url))
      .mockRejectedValueOnce(new NwsMarinePointError('AMZ712', 18.3855917, -65.7294722, url))
      .mockRejectedValueOnce(new NwsHttpError(404, 'point metadata', url)).mockRejectedValueOnce(new NwsTransportError('timeout', 'point metadata', url));
    expect(await new NwsMappingService(nwsWith(get), database(rows)).refresh())
      .toEqual(counters({ automatic: 1, verifiedFallbacks: 2, preserved: 2, unresolved: 1, lookupFailures: 3 }));
  });
});

describe('verified fallback eligibility', () => {
  const review = NWS_FALLBACK_REVIEWS.find(r => r.stationId === 'RW-12B')!;
  const eligible = (reviews: readonly NwsFallbackReview[]) => findVerifiedNwsFallback('RW-12B', 17.9747944, -67.2129056, 'AMZ745', reviews);
  it('accepts complete reviewed metadata and fails closed on duplicate stations', () => {
    expect(eligible([review])).toEqual(review); expect(eligible([review, review])).toBeUndefined();
  });
  it.each(['verificationCsv', 'verificationDocument', 'stationId'] as const)(
    'rejects missing %s evidence', field => {
      expect(eligible([{ ...review, evidence: { ...review.evidence, [field]: '' } }])).toBeUndefined();
    },
  );
  it('rejects incomplete geographic evidence and cross-station references', () => {
    expect(eligible([{ ...review, evidence: { ...review.evidence, nearestPolygonMetres: NaN } }])).toBeUndefined();
    expect(eligible([{ ...review, evidence: { ...review.evidence, stationId: 'RW-13' } }])).toBeUndefined();
    expect(eligible([{ ...review, evidence: { ...review.evidence, verificationDocument: 'unreviewed.md' } }])).toBeUndefined();
  });
});

describe('legacy historical mapping retention', () => {
  it.each([
    ['HTTP 404', new NwsHttpError(404, 'point metadata', url), 1],
    ['HTTP 429', new NwsHttpError(429, 'point metadata', url), 1],
    ['HTTP 503', new NwsHttpError(503, 'point metadata', url), 1],
    ['other HTTP failure', new NwsHttpError(403, 'point metadata', url), 1],
    ['timeout', new NwsTransportError('timeout', 'point metadata', url), 1],
    ['network', new NwsTransportError('network', 'point metadata', url), 1],
    ['malformed JSON', new NwsInvalidResponseError('Malformed JSON', url), 1],
    ['invalid payload', new NwsInvalidResponseError('Invalid point payload', url), 1],
    ['marine zone without approved fallback', marine('AMZ712'), 0],
    ['coordinate validation error', new NwsInvalidCoordinatesError(18, -67), 1],
    ['zone validation error', new NwsInvalidZoneError('invalid'), 1],
    ['unclassified failure', new Error('Unknown upstream failure'), 1],
  ] as const)('preserves unchanged legacy history on %s', async (_name, error, lookupFailures) => {
    const rows = [beach(1, { nws_forecast_zone: 'PRZ007', nws_mapping_method: 'legacy' })]; const before = structuredClone(rows);
    expect(await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(error)), database(rows)).refresh())
      .toEqual(counters({ preserved: 1, lookupFailures }));
    expect(rows).toEqual(before);
  });
  it('replaces legacy history with a reviewed fallback only after a matching marine result', async () => {
    const rows = [beach(1, { nws_forecast_zone: 'PRZ007', nws_mapping_method: 'legacy' })];
    expect(await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(marine())), database(rows)).refresh())
      .toEqual(counters({ verifiedFallbacks: 1 }));
    expect(rows[0]).toMatchObject({ nws_forecast_zone: 'PRZ011', nws_mapping_method: 'verified-fallback',
      nws_mapping_latitude: rows[0].latitude, nws_mapping_longitude: rows[0].longitude, nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION });
  });
});

describe('legacy history without coordinates', () => {
  it('retains history without inventing provenance or attempting an invalid lookup', async () => {
    const rows = [beach(1, { nws_forecast_zone: 'PRZ007', nws_mapping_method: 'legacy', latitude: null, longitude: null })];
    const get = jest.fn(); const before = structuredClone(rows);
    expect(await new NwsMappingService(nwsWith(get), database(rows)).refresh()).toEqual(counters({ preserved: 1, lookupFailures: 1 }));
    expect(rows).toEqual(before); expect(get).not.toHaveBeenCalled();
  });
});

describe('mapping write idempotency', () => {
  it.each(['automatic', 'verified-fallback'] as const)('does not issue redundant UPDATEs for identical %s results', async method => {
    const rows = [beach()]; const writes = jest.fn(); const db = database(rows, writes);
    const get = method === 'automatic' ? jest.fn().mockResolvedValue('PRZ011') : jest.fn().mockRejectedValue(marine());
    const service = new NwsMappingService(nwsWith(get), db);
    const expected = counters(method === 'automatic' ? { automatic: 1 } : { verifiedFallbacks: 1 });
    expect(await service.refresh()).toEqual(expected); expect(writes).toHaveBeenCalledTimes(1);
    expect(await service.refresh()).toEqual(expected); expect(writes).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('writes changed zone assignments and same-zone provenance upgrades', async () => {
    const rows = [beach(1, previousFallback)]; const writes = jest.fn();
    const get = jest.fn().mockResolvedValueOnce('PRZ011').mockResolvedValue('PRZ001');
    const service = new NwsMappingService(nwsWith(get), database(rows, writes));
    expect(await service.refresh()).toEqual(counters({ automatic: 1 }));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ nws_mapping_method: 'automatic', nws_mapping_registry_version: null });
    expect(await service.refresh()).toEqual(counters({ automatic: 1 })); expect(writes).toHaveBeenCalledTimes(2);
    expect(rows[0].nws_forecast_zone).toBe('PRZ001');
    expect(await service.refresh()).toEqual(counters({ automatic: 1 })); expect(writes).toHaveBeenCalledTimes(2);
  });
  it('writes changed fallback registry provenance even when the zone is unchanged', async () => {
    const rows = [beach(1, { ...previousFallback, nws_mapping_registry_version: 'older-review' })];
    const writes = jest.fn();
    await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(marine())), database(rows, writes)).refresh();
    expect(writes).toHaveBeenCalledTimes(1); expect(rows[0].nws_mapping_registry_version).toBe(NWS_FALLBACK_REGISTRY_VERSION);
  });
  it('updates changed errors, skips identical errors, and clears errors on success', async () => {
    const rows = [beach(1, { nws_mapping_error: 'Old failure' })]; const writes = jest.fn();
    const get = jest.fn().mockRejectedValueOnce(new NwsHttpError(404, 'point metadata', url))
      .mockRejectedValueOnce(new NwsHttpError(404, 'point metadata', url))
      .mockRejectedValueOnce(new NwsTransportError('network', 'point metadata', url)).mockResolvedValue('PRZ011');
    const service = new NwsMappingService(nwsWith(get), database(rows, writes));
    expect(await service.refresh()).toEqual(counters({ unresolved: 1, lookupFailures: 1 })); expect(writes).toHaveBeenCalledTimes(1);
    expect(await service.refresh()).toEqual(counters({ unresolved: 1, lookupFailures: 1 })); expect(writes).toHaveBeenCalledTimes(1);
    expect(await service.refresh()).toEqual(counters({ unresolved: 1, lookupFailures: 1 })); expect(writes).toHaveBeenCalledTimes(2);
    expect(rows[0].nws_mapping_error).toBe('Unable to retrieve NWS point metadata');
    expect(await service.refresh()).toEqual(counters({ automatic: 1 })); expect(writes).toHaveBeenCalledTimes(3);
    expect(rows[0].nws_mapping_error).toBeNull();
  });
  it('does not mistake an old identical result for a no-op after a coordinate edit', async () => {
    const rows = [beach(1, automatic)]; const writes = jest.fn();
    const get = jest.fn(async () => { rows[0].latitude = 18; return 'PRZ007'; });
    expect(await new NwsMappingService(nwsWith(get), database(rows, writes)).refresh()).toEqual(counters({ unresolved: 1 }));
    expect(rows[0].nws_forecast_zone).toBeNull(); expect(writes).toHaveBeenCalledTimes(1);
  });
});


describe('RW-1A verified containment fallback', () => {
  it('applies PRZ002 on AMZ712 while retaining verified-fallback provenance', async () => {
    const rows = [beach(1, { drna_station_id: 'RW-1A', latitude: 18.3855917, longitude: -65.7294722 })];
    const error = new NwsMarinePointError('AMZ712', 18.3855917, -65.7294722, url);
    expect(await new NwsMappingService(nwsWith(jest.fn().mockRejectedValue(error)), database(rows)).refresh())
      .toEqual(counters({ verifiedFallbacks: 1 }));
    expect(rows[0]).toMatchObject({ nws_forecast_zone: 'PRZ002', nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION });
  });
  it('continues preferring an automatic result at the same coordinates', async () => {
    const rows = [beach(1, { drna_station_id: 'RW-1A', latitude: 18.3855917, longitude: -65.7294722 })];
    expect(await new NwsMappingService(nwsWith(jest.fn().mockResolvedValue('PRZ002')), database(rows)).refresh())
      .toEqual(counters({ automatic: 1 }));
    expect(rows[0]).toMatchObject({ nws_forecast_zone: 'PRZ002', nws_mapping_method: 'automatic', nws_mapping_registry_version: null });
  });
});
