
import 'dotenv/config';
import knex, { Knex } from 'knex';
import { NwsPersistenceService } from './nws-persistence.service';
import type { BeachAlert, OceanCondition } from '../types/domain';
import { NwsConditionsService } from '../conditions/nws-conditions.service';

const connectionString = process.env.NWS_PERSISTENCE_TEST_DATABASE_URL;
const describeDatabase = isExpectedDatabase(connectionString, 'beach_monitoring_test') ? describe : describe.skip;

describeDatabase('NWS persistence integration', () => {
  let db: Knex;
  let service: NwsPersistenceService;

  beforeAll(async () => {
    db = knex({
      client: 'pg',
      connection: connectionString!,
    });

    service = new NwsPersistenceService(db);
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  it('upserts a condition without creating duplicates', async () => {
    const zoneId = 'PRZ999';

    const condition: OceanCondition = {
      zoneId,
      forecastPeriod: 'Today',
      risk: 'moderate',
      summary: 'Moderate rip current risk',
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://www.weather.gov/',
        observedAt: null,
        retrievedAt: '2026-10-16T12:00:00.000Z',
      },
    };

    try {
      await service.saveCondition(condition);
      await service.saveCondition(condition);

      const records = await db('nws_conditions')
        .where({ zone_id: zoneId });

      expect(records).toHaveLength(1);
      expect(records[0].risk).toBe('moderate');
    } finally {
      await db('nws_conditions')
        .where({ zone_id: zoneId })
        .delete();
    }
  });

  it('does not overwrite newer conditions with older data', async () => {
    const zoneId = 'PRZ998';

    const newerCondition: OceanCondition = {
      zoneId,
      forecastPeriod: 'Afternoon',
      risk: 'high',
      summary: 'High rip current risk',
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://www.weather.gov/',
        observedAt: null,
        retrievedAt: '2026-10-16T14:00:00.000Z',
      },
    };

    const olderCondition: OceanCondition = {
      ...newerCondition,
      risk: 'low',
      summary: 'Low rip current risk',
      source: {
        ...newerCondition.source,
        retrievedAt: '2026-10-16T12:00:00.000Z',
      },
    };

    try {
      await service.saveCondition(newerCondition);
      await service.saveCondition(olderCondition);

      const records = await db('nws_conditions')
        .where({ zone_id: zoneId });

      expect(records).toHaveLength(1);
      expect(records[0].risk).toBe('high');
      expect(records[0].summary).toBe('High rip current risk');
    } finally {
      await db('nws_conditions')
        .where({ zone_id: zoneId })
        .delete();
    }
  });

  it('deactivates alerts after a successful empty response', async () => {
    const zoneId = 'PRZ997';
    const alertId = 'test-nws-alert-997';

    const alert: BeachAlert = {
      id: alertId,
      title: 'High Surf Advisory',
      description: 'Hazardous surf conditions',
      instruction: 'Avoid entering the water',
      severity: 'Moderate',
      certainty: 'Likely',
      urgency: 'Expected',
      effectiveAt: '2026-10-16T10:00:00.000Z',
      expiresAt: '2026-10-17T10:00:00.000Z',
      zones: [zoneId],
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://www.weather.gov/',
        observedAt: null,
        retrievedAt: '2026-10-16T12:00:00.000Z',
      },
    };

    try {
      await service.saveAlerts(
        zoneId,
        [alert],
        '2026-10-16T12:00:00.000Z',
      );

      const active = await db('nws_alert_zones')
        .where({ alert_id: alertId, zone_id: zoneId })
        .first();

      expect(active.is_active).toBe(true);

      await service.saveAlerts(
        zoneId,
        [],
        '2026-10-16T13:00:00.000Z',
      );

      const inactive = await db('nws_alert_zones')
        .where({ alert_id: alertId, zone_id: zoneId })
        .first();

      expect(inactive.is_active).toBe(false);

      const storedAlert = await db('nws_alerts')
        .where({ id: alertId })
        .first();

      expect(storedAlert).toBeDefined();
    } finally {
      await db('nws_alert_zones')
        .where({ alert_id: alertId })
        .delete();

      await db('nws_alerts')
        .where({ id: alertId })
        .delete();

      await db('nws_alert_snapshots')
        .where({ zone_id: zoneId })
        .delete();
    }
  });

  it('does not reactivate alerts from an older snapshot', async () => {
    const zoneId = 'PRZ996';
    const alertId = 'test-nws-alert-996';

    const alert: BeachAlert = {
      id: alertId,
      title: 'High Surf Advisory',
      description: 'Hazardous surf conditions',
      instruction: 'Avoid entering the water',
      severity: 'Moderate',
      certainty: 'Likely',
      urgency: 'Expected',
      effectiveAt: '2026-10-16T10:00:00.000Z',
      expiresAt: '2026-10-17T10:00:00.000Z',
      zones: [zoneId],
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://www.weather.gov/',
        observedAt: null,
        retrievedAt: '2026-10-16T12:00:00.000Z',
      },
    };

    try {
      await service.saveAlerts(
        zoneId,
        [alert],
        '2026-10-16T12:00:00.000Z',
      );

      await service.saveAlerts(
        zoneId,
        [],
        '2026-10-16T14:00:00.000Z',
      );

      // Simulate an older response arriving late.
      await service.saveAlerts(
        zoneId,
        [alert],
        '2026-10-16T13:00:00.000Z',
      );

      const association = await db('nws_alert_zones')
        .where({ alert_id: alertId, zone_id: zoneId })
        .first();

      expect(association.is_active).toBe(false);

      const snapshot = await db('nws_alert_snapshots')
        .where({ zone_id: zoneId })
        .first();

      expect(snapshot.retrieved_at.toISOString()).toBe(
        '2026-10-16T14:00:00.000Z',
      );
    } finally {
      await db('nws_alert_zones')
        .where({ alert_id: alertId })
        .delete();

      await db('nws_alerts')
        .where({ id: alertId })
        .delete();

      await db('nws_alert_snapshots')
        .where({ zone_id: zoneId })
        .delete();
    }
  });

  it('does not create duplicate alerts or zone associations', async () => {
    const zoneId = 'PRZ995';
    const alertId = 'test-nws-alert-995';
    const retrievedAt = '2026-10-16T12:00:00.000Z';

    const alert: BeachAlert = {
      id: alertId,
      title: 'Rip Current Statement',
      description: 'Dangerous rip currents are expected',
      instruction: 'Avoid swimming',
      severity: 'Moderate',
      certainty: 'Likely',
      urgency: 'Expected',
      effectiveAt: '2026-10-16T10:00:00.000Z',
      expiresAt: '2026-10-17T10:00:00.000Z',
      zones: [zoneId],
      source: {
        sourceName: 'NWS',
        sourceUrl: 'https://www.weather.gov/',
        observedAt: null,
        retrievedAt,
      },
    };

    try {
      await service.saveAlerts(zoneId, [alert], retrievedAt);
      await service.saveAlerts(zoneId, [alert], retrievedAt);

      const alerts = await db('nws_alerts')
        .where({ id: alertId });

      const associations = await db('nws_alert_zones')
        .where({ alert_id: alertId, zone_id: zoneId });

      expect(alerts).toHaveLength(1);
      expect(associations).toHaveLength(1);
      expect(associations[0].is_active).toBe(true);
    } finally {
      await db('nws_alert_zones')
        .where({ alert_id: alertId })
        .delete();

      await db('nws_alerts')
        .where({ id: alertId })
        .delete();

      await db('nws_alert_snapshots')
        .where({ zone_id: zoneId })
        .delete();
    }
  });

  it('preserves last-known condition and alert records after a failure', async () => {
    const zoneId = 'PRZ991';
    const successTime = '2026-10-16T12:00:00.000Z';
    const failureTime = '2026-10-16T13:00:00.000Z';
    const alertId = 'test-nws-alert-991';

    const previous = await db('nws_source_health').where({ zone_id: zoneId });

    try {
      await db('nws_source_health').where({ zone_id: zoneId }).delete();
      await service.saveCondition({
        zoneId,
        forecastPeriod: 'Today',
        risk: 'moderate',
        summary: 'Moderate rip current risk',
        source: {
          sourceName: 'NWS',
          sourceUrl: 'https://www.weather.gov/',
          observedAt: successTime,
          retrievedAt: successTime,
        },
      });
      await service.saveAlerts(zoneId, [{
        id: alertId,
        title: 'High Surf Advisory',
        description: 'Hazardous surf conditions',
        instruction: null,
        severity: 'Moderate',
        certainty: 'Likely',
        urgency: 'Expected',
        effectiveAt: successTime,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        zones: [zoneId],
        source: {
          sourceName: 'NWS',
          sourceUrl: 'https://www.weather.gov/',
          observedAt: successTime,
          retrievedAt: successTime,
        },
      }], successTime);

      await service.recordRetrieval('conditions', zoneId, false, failureTime);
      await service.recordRetrieval('alerts', zoneId, false, failureTime);

      expect(await db('nws_conditions').where({ zone_id: zoneId }).first()).toBeDefined();
      expect(await db('nws_alerts').where({ id: alertId }).first()).toBeDefined();
      expect(await db('nws_alert_zones').where({ alert_id: alertId, zone_id: zoneId }).first())
        .toMatchObject({ is_active: true });
    } finally {
      await db('nws_alert_zones').where({ alert_id: alertId }).delete();
      await db('nws_alerts').where({ id: alertId }).delete();
      await db('nws_alert_snapshots').where({ zone_id: zoneId }).delete();
      await db('nws_conditions').where({ zone_id: zoneId }).delete();
      await db('nws_source_health').where({ zone_id: zoneId }).delete();
      if (previous.length > 0) await db('nws_source_health').insert(previous);
    }
  });

  it('rejects alert-zone associations without a valid alert', async () => {
    const alertId = 'test-nonexistent-alert-994';
    const zoneId = 'PRZ994';

    await expect(
      db('nws_alert_zones').insert({
        alert_id: alertId,
        zone_id: zoneId,
        is_active: true,
        last_seen_at: '2026-10-16T12:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: '23503',
    });

    const associations = await db('nws_alert_zones')
      .where({ alert_id: alertId, zone_id: zoneId });

    expect(associations).toHaveLength(0);
  });

  it('retrieves stored NWS conditions using a beach zone mapping', async () => {
    const zoneId = 'PRZ993';
    const retrievedAt = '2026-10-16T12:00:00.000Z';
    const observedAt = '2026-10-16T11:45:00.000Z';
    const sourceUrl = 'https://api.weather.gov/products/srf-persistence-test';

    let beachId: string | undefined;

    try {
      const [beach] = await db('beaches')
        .insert({
          drna_station_id: 'test-nws-beach-993',
          name: 'NWS Test Beach',
          municipality: 'Test Municipality',
          latitude: 18.4,
          longitude: -67.1,
          nws_forecast_zone: zoneId,
          nws_mapping_method: 'legacy',
        })
        .returning('id');

      beachId = String(beach.id);

      await service.saveCondition({
        zoneId,
        forecastPeriod: 'Today',
        risk: 'high',
        summary: 'High rip current risk',
        source: {
          sourceName: 'NWS',
          sourceUrl,
          observedAt,
          retrievedAt,
        },
      });

      const result = await service.getStoredConditionsByBeach(beachId);

      expect(result).not.toBeNull();
      expect(result?.beachId).toBe(beachId);
      expect(result?.zoneId).toBe(zoneId);
      expect(result?.condition).toMatchObject({
        zone_id: zoneId,
        forecast_period: 'Today',
        risk: 'high',
        summary: 'High rip current risk',
        source_url: sourceUrl,
        observed_at: new Date(observedAt),
        retrieved_at: new Date(retrievedAt),
      });
    } finally {
      if (beachId) {
        await db('beaches').where({ id: beachId }).delete();
      }

      await db('nws_conditions')
        .where({ zone_id: zoneId })
        .delete();
    }
  });

  it('returns only active and unexpired alerts from the public read service', async () => {
    const zoneId = 'PRZ992';
    const prefix = 'test-nws-filter-992';
    const alertIds = [
      `${prefix}-active`,
      `${prefix}-inactive`,
      `${prefix}-expired`,
    ];

    const retrievedAt = new Date().toISOString();
    const future = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();
    const past = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    let beachId: string | undefined;

    try {
      const [beach] = await db('beaches')
        .insert({
          drna_station_id: prefix,
          name: 'NWS Alert Test Beach',
          municipality: 'Test Municipality',
          latitude: 18.4,
          longitude: -67.1,
          nws_forecast_zone: zoneId,
          nws_mapping_method: 'legacy',
        })
        .returning('id');

      beachId = String(beach.id);

      for (const id of alertIds) {
        await db('nws_alerts').insert({
          id,
          title: 'Test Alert',
          description: 'Test description',
          instruction: null,
          severity: 'Moderate',
          certainty: 'Likely',
          urgency: 'Expected',
          effective_at: past,
          expires_at: id.endsWith('-expired') ? past : future,
          source_url: 'https://www.weather.gov/',
          observed_at: null,
          retrieved_at: retrievedAt,
        });

        await db('nws_alert_zones').insert({
          alert_id: id,
          zone_id: zoneId,
          is_active: !id.endsWith('-inactive'),
          last_seen_at: retrievedAt,
        });
      }

      await db('nws_alert_snapshots').insert({
        zone_id: zoneId,
        retrieved_at: retrievedAt,
      });

      const result = await new NwsConditionsService(db).getAlerts(Number(beachId));

      expect(result.beachId).toBe(Number(beachId));
      expect(result.zoneId).toBe(zoneId);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts?.[0].id).toBe(`${prefix}-active`);
    } finally {
      await db('nws_alert_zones')
        .whereIn('alert_id', alertIds)
        .delete();

      await db('nws_alerts')
        .whereIn('id', alertIds)
        .delete();

      await db('nws_alert_snapshots')
        .where({ zone_id: zoneId })
        .delete();

      if (beachId) {
        await db('beaches')
          .where({ id: beachId })
          .delete();
      }
    }
  });
});

function isExpectedDatabase(connection: string | undefined, database: string): boolean {
  if (!connection) return false;
  try {
    const url = new URL(connection);
    return ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === `/${database}`;
  } catch {
    return false;
  }
}
