import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import type { BeachAlert, OceanCondition } from '../types/domain';

@Injectable()
export class NwsPersistenceService {
  constructor(@Inject(DATABASE) private readonly db: Knex) {}

  async saveCondition(condition: OceanCondition): Promise<void> {
    await this.db('nws_conditions')
      .insert({
        zone_id: condition.zoneId,
        forecast_period: condition.forecastPeriod,
        risk: condition.risk,
        summary: condition.summary,
        source_url: condition.source.sourceUrl ?? null,
        observed_at: condition.source.observedAt,
        retrieved_at: condition.source.retrievedAt,
      })

      .onConflict('zone_id')
      .merge([
        'forecast_period',
        'risk',
        'summary',
        'source_url',
        'observed_at',
        'retrieved_at',
      ])
      .whereRaw(
        'nws_conditions.retrieved_at <= excluded.retrieved_at',
      );
  }



  async saveAlerts(
    zoneId: string,
    alerts: BeachAlert[],
    retrievedAt: string,
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const [snapshot] = await trx('nws_alert_snapshots')
        .insert({
          zone_id: zoneId,
          retrieved_at: retrievedAt,
        })
        .onConflict('zone_id')
        .merge({
          retrieved_at: retrievedAt,
          updated_at: trx.fn.now(),
        })
        .whereRaw(
          'nws_alert_snapshots.retrieved_at <= excluded.retrieved_at',
        )
        .returning('zone_id');

      if (!snapshot) {
        return;
      }

      const activeIds = [...new Set(alerts.map((alert) => alert.id))];

      for (const alert of alerts) {
        await trx('nws_alerts')
          .insert({
            id: alert.id,
            title: alert.title,
            description: alert.description,
            instruction: alert.instruction,
            severity: alert.severity,
            certainty: alert.certainty,
            urgency: alert.urgency,
            effective_at: alert.effectiveAt,
            expires_at: alert.expiresAt,
            source_url: alert.source.sourceUrl ?? null,
            observed_at: alert.source.observedAt,
            retrieved_at: alert.source.retrievedAt,
          })

          .onConflict('id')
          .merge([
            'title',
            'description',
            'instruction',
            'severity',
            'certainty',
            'urgency',
            'effective_at',
            'expires_at',
            'source_url',
            'observed_at',
            'retrieved_at',
          ])
          .whereRaw(
            'nws_alerts.retrieved_at <= excluded.retrieved_at',
          );


        await trx('nws_alert_zones')
          .insert({
            alert_id: alert.id,
            zone_id: zoneId,
            is_active: true,
            last_seen_at: retrievedAt,
          })
          .onConflict(['alert_id', 'zone_id'])
          .merge({
            is_active: true,
            last_seen_at: retrievedAt,
          })
          .whereRaw(
            'nws_alert_zones.last_seen_at <= excluded.last_seen_at',
          );
      }

      let staleAlerts = trx('nws_alert_zones')
        .where({ zone_id: zoneId, is_active: true })
        .where('last_seen_at', '<=', retrievedAt);

      if (activeIds.length > 0) {
        staleAlerts = staleAlerts.whereNotIn('alert_id', activeIds);
      }

      await staleAlerts.update({ is_active: false });
    });
  }


  async recordRetrieval(
    sourceKey: 'conditions' | 'alerts',
    zoneId: string,
    succeeded: boolean,
    attemptedAt: string,
  ): Promise<void> {
    const finishedAt = new Date();
    const durationMs = Math.max(
      0,
      finishedAt.getTime() - new Date(attemptedAt).getTime(),
    );

    await this.db.transaction(async (trx) => {
      await trx('nws_source_health')
        .insert({
          source_key: sourceKey,
          zone_id: zoneId,
          last_attempt_at: attemptedAt,
          last_success_at: succeeded ? attemptedAt : null,
          last_attempt_succeeded: succeeded,
        })
        .onConflict(['source_key', 'zone_id'])
        .merge({
          last_attempt_at: trx.raw(`
            greatest(
              coalesce(nws_source_health.last_attempt_at, excluded.last_attempt_at),
              excluded.last_attempt_at
            )
          `),
          last_attempt_succeeded: trx.raw(`
            case
              when nws_source_health.last_attempt_at is null
                or excluded.last_attempt_at >= nws_source_health.last_attempt_at
              then excluded.last_attempt_succeeded
              else nws_source_health.last_attempt_succeeded
            end
          `),
          last_success_at: trx.raw(`
            case
              when excluded.last_attempt_succeeded = true
              then greatest(
                nws_source_health.last_success_at,
                excluded.last_success_at
              )
              else nws_source_health.last_success_at
            end
          `),
          updated_at: trx.fn.now(),
        });

      await trx('source_refresh_history').insert({
        source: 'nws',
        source_key: sourceKey,
        zone_id: zoneId,
        started_at: attemptedAt,
        finished_at: finishedAt.toISOString(),
        succeeded,
        duration_ms: durationMs,
        published_at: null,
      });
    });
  }


  async getStoredConditionsByBeach(beachId: string) {
    const beach = await this.db('beaches')
      .select('id', 'nws_forecast_zone')
      .where('id', beachId)
      .first();

    if (!beach) {
      return null;
    }

    if (!beach.nws_forecast_zone) {
      return {
        beachId: String(beach.id),
        zoneId: null,
        condition: null,
      };
    }

    const condition = await this.db('nws_conditions')
      .select(
        'zone_id',
        'forecast_period',
        'risk',
        'summary',
        'source_url',
        'observed_at',
        'retrieved_at',
      )
      .where('zone_id', beach.nws_forecast_zone)
      .first();

    return {
      beachId: String(beach.id),
      zoneId: beach.nws_forecast_zone,
      condition: condition ?? null,
    };
  }

  async getStoredAlertsByBeach(beachId: string) {
    const beach = await this.db('beaches')
      .select('id', 'nws_forecast_zone')
      .where('id', beachId)
      .first();

    if (!beach) {
      return null;
    }

    if (!beach.nws_forecast_zone) {
      return {
        beachId: String(beach.id),
        zoneId: null,
        alerts: [],
      };
    }

    const alerts = await this.db('nws_alerts as a')
      .join('nws_alert_zones as az', 'a.id', 'az.alert_id')
      .where('az.zone_id', beach.nws_forecast_zone)
      .where('az.is_active', true)
      .where('a.expires_at', '>', this.db.fn.now())
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
      )
      .orderBy('a.expires_at', 'asc');

    return {
      beachId: String(beach.id),
      zoneId: beach.nws_forecast_zone,
      alerts,
    };
  }
}
