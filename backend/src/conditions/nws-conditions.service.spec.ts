import { NWS_FALLBACK_REGISTRY_VERSION } from '../ingestion/nws-fallback-registry';
import type { NwsMappingProvenance } from '../data-sources/nws/nws-mapping-eligibility';
import { NotFoundException } from '@nestjs/common';
import {
  ALERTS_STALE_AFTER_MS,
  NwsConditionsService,
  OCEAN_RISK_ISSUANCE_STALE_AFTER_MS,
  OCEAN_RISK_RETRIEVAL_STALE_AFTER_MS,
} from './nws-conditions.service';

const MINUTE_MS = 60 * 1000;

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

function fromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}

interface Tables {
  beach?: { id: number; nws_forecast_zone: string | null } & NwsMappingProvenance;
  condition?: Record<string, unknown>;
  snapshot?: { retrieved_at: Date | string };
  health?: { last_attempt_at: Date | string; last_attempt_succeeded: boolean };
  alerts?: Record<string, unknown>[];
}

function createNwsDbMock(tables: Tables) {
  const calls: { table: string; where: unknown[][] }[] = [];

  const db = jest.fn((table: string) => {
    const call = { table, where: [] as unknown[][] };
    calls.push(call);

    const query: Record<string, jest.Mock> = {
      where: jest.fn((...args: unknown[]) => {
        call.where.push(args);
        return query;
      }),
      join: jest.fn(() => query),
      orderBy: jest.fn(() => query),
      first: jest.fn(async () => {
        if (table === 'beaches') return tables.beach;
        if (table === 'nws_conditions') return tables.condition;
        if (table === 'nws_alert_snapshots') return tables.snapshot;
        if (table === 'nws_source_health') return tables.health;
        throw new Error(`Unexpected first() on ${table}`);
      }),
      select: jest.fn(async () => {
        if (table === 'nws_alerts as a') return tables.alerts ?? [];
        throw new Error(`Unexpected select() on ${table}`);
      }),
    };

    return query;
  });

  return Object.assign(db, { calls });
}

const MAPPED_BEACH = { id: 7, nws_forecast_zone: 'PRZ001', nws_mapping_method: 'automatic',
  latitude: 18.4, longitude: -66.1, nws_mapping_latitude: 18.4, nws_mapping_longitude: -66.1, nws_mapping_registry_version: null };
const SOURCE_URL = 'https://api.weather.gov/products/srf-1';

function conditionRow(overrides: Record<string, unknown> = {}) {
  return {
    forecast_period: 'TODAY',
    risk: 'moderate',
    summary: 'Moderate rip-current risk.',
    source_url: SOURCE_URL,
    observed_at: ago(3 * 60 * MINUTE_MS),
    retrieved_at: ago(10 * MINUTE_MS),
    ...overrides,
  };
}

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'urn:oid:alert-1',
    title: 'High Rip Current Risk',
    description: 'Dangerous rip currents.',
    instruction: 'Swim near a lifeguard.',
    severity: 'Moderate',
    certainty: 'Likely',
    urgency: 'Expected',
    effective_at: ago(60 * MINUTE_MS),
    expires_at: fromNow(12 * 60 * MINUTE_MS),
    source_url: 'https://api.weather.gov/alerts/urn:oid:alert-1',
    observed_at: ago(60 * MINUTE_MS),
    retrieved_at: ago(5 * MINUTE_MS),
    ...overrides,
  };
}

describe('NwsConditionsService', () => {
  describe('getOceanRisk', () => {
    it('returns the current normalized risk with provenance', async () => {
      const row = conditionRow();
      const service = new NwsConditionsService(
        createNwsDbMock({ beach: MAPPED_BEACH, condition: row }) as never,
      );

      await expect(service.getOceanRisk(7)).resolves.toEqual({
        beachId: 7,
        zoneId: 'PRZ001',
        status: 'moderate',
        summary: 'Moderate rip-current risk.',
        forecastPeriod: 'TODAY',
        source: 'NWS',
        sourceUrl: SOURCE_URL,
        observedAt: (row.observed_at as Date).toISOString(),
        retrievedAt: (row.retrieved_at as Date).toISOString(),
        availability: 'available',
      });
    });

    it('queries the condition for the beach forecast zone', async () => {
      const db = createNwsDbMock({ beach: MAPPED_BEACH, condition: conditionRow() });
      await new NwsConditionsService(db as never).getOceanRisk(7);

      expect(db.calls.find((c) => c.table === 'beaches')?.where).toEqual([[{ id: 7 }]]);
      expect(db.calls.find((c) => c.table === 'nws_conditions')?.where).toEqual([
        [{ zone_id: 'PRZ001' }],
      ]);
    });

    it('throws NotFoundException for an unknown beach', async () => {
      const service = new NwsConditionsService(createNwsDbMock({}) as never);

      await expect(service.getOceanRisk(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports a beach without a forecast zone as unavailable and unknown', async () => {
      const db = createNwsDbMock({ beach: { id: 7, nws_forecast_zone: null } });
      const result = await new NwsConditionsService(db as never).getOceanRisk(7);

      expect(result).toMatchObject({
        zoneId: null,
        status: 'unknown',
        availability: 'unavailable',
        unavailableReason: 'beach-not-mapped',
        retrievedAt: null,
      });
      expect(db.calls.map((c) => c.table)).toEqual(['beaches']);
    });

    it('reports a mapped zone with no stored forecast as unavailable and unknown', async () => {
      const service = new NwsConditionsService(
        createNwsDbMock({ beach: MAPPED_BEACH }) as never,
      );

      await expect(service.getOceanRisk(7)).resolves.toMatchObject({
        zoneId: 'PRZ001',
        status: 'unknown',
        availability: 'unavailable',
        unavailableReason: 'no-data',
      });
    });

    it('reports a forecast without a published risk as unavailable but keeps provenance', async () => {
      const row = conditionRow({ risk: 'unknown', forecast_period: null });
      const service = new NwsConditionsService(
        createNwsDbMock({ beach: MAPPED_BEACH, condition: row }) as never,
      );

      await expect(service.getOceanRisk(7)).resolves.toMatchObject({
        status: 'unknown',
        availability: 'unavailable',
        unavailableReason: 'risk-not-published',
        sourceUrl: SOURCE_URL,
        retrievedAt: (row.retrieved_at as Date).toISOString(),
      });
    });

    it.each([
      ['retrieved too long ago', { retrieved_at: ago(OCEAN_RISK_RETRIEVAL_STALE_AFTER_MS + MINUTE_MS) }],
      ['issued too long ago', { observed_at: ago(OCEAN_RISK_ISSUANCE_STALE_AFTER_MS + MINUTE_MS) }],
      ['missing an issuance time', { observed_at: null }],
    ])('does not report a low risk as current when the forecast was %s', async (_, overrides) => {
      const service = new NwsConditionsService(
        createNwsDbMock({
          beach: MAPPED_BEACH,
          condition: conditionRow({ risk: 'low', ...overrides }),
        }) as never,
      );

      const result = await service.getOceanRisk(7);

      expect(result).toMatchObject({
        status: 'unknown',
        lastKnownStatus: 'low',
        availability: 'stale',
      });
      expect(result.unavailableReason).toBeUndefined();
    });

    it('applies the retrieval and issuance freshness limits at their exact boundaries', async () => {
      const now = new Date('2026-10-18T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      const atLimit = new NwsConditionsService(createNwsDbMock({
        beach: MAPPED_BEACH,
        condition: conditionRow({
          risk: 'moderate',
          retrieved_at: new Date(now.getTime() - OCEAN_RISK_RETRIEVAL_STALE_AFTER_MS),
          observed_at: new Date(now.getTime() - OCEAN_RISK_ISSUANCE_STALE_AFTER_MS),
        }),
      }) as never);
      const pastLimit = new NwsConditionsService(createNwsDbMock({
        beach: MAPPED_BEACH,
        condition: conditionRow({
          risk: 'moderate',
          retrieved_at: new Date(now.getTime() - OCEAN_RISK_RETRIEVAL_STALE_AFTER_MS - 1),
          observed_at: new Date(now.getTime() - OCEAN_RISK_ISSUANCE_STALE_AFTER_MS),
        }),
      }) as never);

      try {
        await expect(atLimit.getOceanRisk(7)).resolves.toMatchObject({ status: 'moderate', availability: 'available' });
        await expect(pastLimit.getOceanRisk(7)).resolves.toMatchObject({
          status: 'unknown',
          lastKnownStatus: 'moderate',
          availability: 'stale',
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('marks a fresh stored risk as stale after a newer failed refresh', async () => {
      const row = conditionRow({ risk: 'low' });
      const service = new NwsConditionsService(createNwsDbMock({
        beach: MAPPED_BEACH,
        condition: row,
        health: { last_attempt_at: new Date(), last_attempt_succeeded: false },
      }) as never);

      await expect(service.getOceanRisk(7)).resolves.toMatchObject({
        status: 'unknown',
        lastKnownStatus: 'low',
        availability: 'stale',
      });
    });
  });

  describe('getAlerts', () => {
    it('returns active alerts from a current check', async () => {
      const snapshot = { retrieved_at: ago(5 * MINUTE_MS) };
      const row = alertRow();
      const service = new NwsConditionsService(
        createNwsDbMock({ beach: MAPPED_BEACH, snapshot, alerts: [row] }) as never,
      );

      await expect(service.getAlerts(7)).resolves.toEqual({
        beachId: 7,
        zoneId: 'PRZ001',
        status: 'active-alerts',
        source: 'NWS',
        retrievedAt: snapshot.retrieved_at.toISOString(),
        availability: 'available',
        alerts: [
          {
            id: 'urn:oid:alert-1',
            title: 'High Rip Current Risk',
            description: 'Dangerous rip currents.',
            instruction: 'Swim near a lifeguard.',
            severity: 'Moderate',
            certainty: 'Likely',
            urgency: 'Expected',
            effectiveAt: (row.effective_at as Date).toISOString(),
            expiresAt: (row.expires_at as Date).toISOString(),
            observedAt: (row.observed_at as Date).toISOString(),
            retrievedAt: (row.retrieved_at as Date).toISOString(),
            sourceUrl: 'https://api.weather.gov/alerts/urn:oid:alert-1',
          },
        ],
      });
    });

    it('filters to active, unexpired alerts in the beach zone', async () => {
      const db = createNwsDbMock({
        beach: MAPPED_BEACH,
        snapshot: { retrieved_at: ago(5 * MINUTE_MS) },
      });
      await new NwsConditionsService(db as never).getAlerts(7);

      const where = db.calls.find((c) => c.table === 'nws_alerts as a')?.where ?? [];
      expect(where).toContainEqual(['az.zone_id', 'PRZ001']);
      expect(where).toContainEqual(['az.is_active', true]);
      expect(where).toContainEqual(['a.expires_at', '>', expect.any(String)]);
    });

    it('reports an empty current check as no active alerts', async () => {
      const service = new NwsConditionsService(
        createNwsDbMock({
          beach: MAPPED_BEACH,
          snapshot: { retrieved_at: ago(5 * MINUTE_MS) },
          alerts: [],
        }) as never,
      );

      await expect(service.getAlerts(7)).resolves.toMatchObject({
        status: 'no-active-alerts',
        availability: 'available',
        alerts: [],
      });
    });

    it('reports an empty stale check as unknown rather than no alerts', async () => {
      const service = new NwsConditionsService(
        createNwsDbMock({
          beach: MAPPED_BEACH,
          snapshot: { retrieved_at: ago(ALERTS_STALE_AFTER_MS + MINUTE_MS) },
          alerts: [],
        }) as never,
      );

      await expect(service.getAlerts(7)).resolves.toMatchObject({
        status: 'unknown',
        availability: 'stale',
        alerts: [],
      });
    });

    it('filters expired alerts at the database query boundary', async () => {
      const db = createNwsDbMock({
        beach: MAPPED_BEACH,
        snapshot: { retrieved_at: ago(5 * MINUTE_MS) },
        alerts: [],
      });

      await new NwsConditionsService(db as never).getAlerts(7);
      expect(db.calls.find((call) => call.table === 'nws_alerts as a')?.where)
        .toContainEqual(['a.expires_at', '>', expect.any(String)]);
    });

    it('does not report no alerts after a newer failed refresh', async () => {
      const service = new NwsConditionsService(createNwsDbMock({
        beach: MAPPED_BEACH,
        snapshot: { retrieved_at: ago(5 * MINUTE_MS) },
        health: { last_attempt_at: new Date(), last_attempt_succeeded: false },
        alerts: [],
      }) as never);

      await expect(service.getAlerts(7)).resolves.toMatchObject({
        status: 'unknown',
        availability: 'stale',
        alerts: [],
      });
    });

    it('still returns last-known unexpired alerts when the check is stale', async () => {
      const service = new NwsConditionsService(
        createNwsDbMock({
          beach: MAPPED_BEACH,
          snapshot: { retrieved_at: ago(ALERTS_STALE_AFTER_MS + MINUTE_MS) },
          alerts: [alertRow()],
        }) as never,
      );

      const result = await service.getAlerts(7);

      expect(result).toMatchObject({ status: 'active-alerts', availability: 'stale' });
      expect(result.alerts).toHaveLength(1);
    });

    it('reports a zone that was never checked as unavailable with null alerts', async () => {
      const db = createNwsDbMock({ beach: MAPPED_BEACH });
      const result = await new NwsConditionsService(db as never).getAlerts(7);

      expect(result).toEqual({
        beachId: 7,
        zoneId: 'PRZ001',
        status: 'unknown',
        source: 'NWS',
        retrievedAt: null,
        availability: 'unavailable',
        unavailableReason: 'no-data',
        alerts: null,
      });
      expect(db.calls.map((c) => c.table)).not.toContain('nws_alerts as a');
    });

    it('reports a beach without a forecast zone as unavailable with null alerts', async () => {
      const service = new NwsConditionsService(
        createNwsDbMock({ beach: { id: 7, nws_forecast_zone: null } }) as never,
      );

      await expect(service.getAlerts(7)).resolves.toMatchObject({
        zoneId: null,
        status: 'unknown',
        availability: 'unavailable',
        unavailableReason: 'beach-not-mapped',
        alerts: null,
      });
    });

    it('throws NotFoundException for an unknown beach', async () => {
      const service = new NwsConditionsService(createNwsDbMock({}) as never);

      await expect(service.getAlerts(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('unverified mappings cannot authorize NWS API data', () => {
  it.each([
    ['legacy', { ...MAPPED_BEACH, nws_mapping_method: 'legacy', nws_mapping_latitude: null, nws_mapping_longitude: null }],
    ['superseded fallback revision', { ...MAPPED_BEACH, nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: '2026-10-25.v1' }],
    ['unknown fallback revision', { ...MAPPED_BEACH, nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: 'unknown-review' }],
    ['mismatched coordinates', { ...MAPPED_BEACH, nws_mapping_latitude: 18 }],
    ['missing provenance', { id: 7, nws_forecast_zone: 'PRZ001' }],
  ])('excludes %s from both public readers', async (_name, beach) => {
    const db = createNwsDbMock({ beach }); const service = new NwsConditionsService(db as never);
    expect(await service.getOceanRisk(7)).toMatchObject({ zoneId: null, status: 'unknown', availability: 'unavailable', unavailableReason: 'beach-not-mapped' });
    expect(await service.getAlerts(7)).toMatchObject({ zoneId: null, status: 'unknown', availability: 'unavailable', alerts: null, unavailableReason: 'beach-not-mapped' });
    expect(db.calls.every(call => call.table === 'beaches')).toBe(true);
  });
  it('keeps a verified fallback operational with the existing ocean-risk response contract', async () => {
    const db = createNwsDbMock({ beach: { ...MAPPED_BEACH, nws_mapping_method: 'verified-fallback', nws_mapping_registry_version: NWS_FALLBACK_REGISTRY_VERSION }, condition: conditionRow() });
    expect(await new NwsConditionsService(db as never).getOceanRisk(7)).toMatchObject({ zoneId: 'PRZ001', status: 'moderate', availability: 'available' });
  });
});
