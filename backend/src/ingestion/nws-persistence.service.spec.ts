
import 'dotenv/config';
import knex, { Knex } from 'knex';
import { NwsPersistenceService } from './nws-persistence.service';
import type { BeachAlert, OceanCondition } from '../types/domain';

describe('NWS persistence integration', () => {
  let db: Knex;
  let service: NwsPersistenceService;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    const url = new URL(connectionString);

    if (
      url.hostname !== 'localhost' &&
      url.hostname !== '127.0.0.1'
    ) {
      throw new Error('Integration tests require local PostgreSQL');
    }

    if (url.pathname !== '/beach_monitoring_test') {
      throw new Error(
        'Integration tests require beach_monitoring_test',
      );
    }

    db = knex({
      client: 'pg',
      connection: connectionString,
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

  it('preserves the last successful retrieval after a failure', async () => {
    const sourceKey = 'conditions';

    const successTime = '2026-10-16T12:00:00.000Z';
    const failureTime = '2026-10-16T13:00:00.000Z';

    // Preserve any existing record so the test can restore it.
    const previous = await db('nws_source_health')
      .where({ source_key: sourceKey })
      .first();

    try {
      await db('nws_source_health')
        .where({ source_key: sourceKey })
        .delete();

      await service.recordRetrieval(sourceKey, true, successTime);
      await service.recordRetrieval(sourceKey, false, failureTime);

      const health = await db('nws_source_health')
        .where({ source_key: sourceKey })
        .first();

      expect(health.last_attempt_at.toISOString()).toBe(failureTime);
      expect(health.last_success_at.toISOString()).toBe(successTime);
      expect(health.last_attempt_succeeded).toBe(false);
    } finally {
      await db('nws_source_health')
        .where({ source_key: sourceKey })
        .delete();

      if (previous) {
        await db('nws_source_health').insert(previous);
      }
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
          sourceUrl: 'https://www.weather.gov/',
          observedAt: null,
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

  it('returns only active and unexpired alerts for a beach', async () => {
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

      const result = await service.getStoredAlertsByBeach(beachId);

      expect(result).not.toBeNull();
      expect(result?.beachId).toBe(beachId);
      expect(result?.zoneId).toBe(zoneId);
      expect(result?.alerts).toHaveLength(1);
      expect(result?.alerts[0].id).toBe(`${prefix}-active`);
    } finally {
      await db('nws_alert_zones')
        .whereIn('alert_id', alertIds)
        .delete();

      await db('nws_alerts')
        .whereIn('id', alertIds)
        .delete();

      if (beachId) {
        await db('beaches')
          .where({ id: beachId })
          .delete();
      }
    }
  });
});
