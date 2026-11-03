import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { DrnaService } from '../data-sources/drna/drna.service';

@Injectable()
export class IngestionService implements OnModuleDestroy {
  constructor(private readonly drna: DrnaService, @Inject(DATABASE) private readonly db: Knex) {}

  async refresh(): Promise<void> {
    const catalog = await this.drna.getCatalog();
    const rejectionRate = catalog.sourceRows ? catalog.rejectedRows / catalog.sourceRows : 1;
    if (rejectionRate > 0.02) {
      throw new Error(`DRNA parser rejected ${catalog.rejectedRows} of ${catalog.sourceRows} rows`);
    }
    if (catalog.rejectedRows) console.warn(`DRNA parser skipped ${catalog.rejectedRows} of ${catalog.sourceRows} rows`);
    await this.db.transaction(async (trx) => {
      const saved = await trx('beaches').insert(catalog.stations.map((station) => ({
        drna_station_id: station.stationId, name: station.name, municipality: station.municipality,
        latitude: station.latitude, longitude: station.longitude,
      }))).onConflict('drna_station_id').merge({
        name: trx.raw('excluded.name'),
        latitude: trx.raw('excluded.latitude'),
        longitude: trx.raw('excluded.longitude'),
        municipality: trx.raw(`case
          when trim(excluded.municipality) <> '' and lower(trim(excluded.municipality)) <> 'unavailable'
          then trim(excluded.municipality) else beaches.municipality end`),
      }).returning(['id', 'drna_station_id']);

      const beachIds = new Map(saved.map((beach) => [beach.drna_station_id, beach.id]));
      const observations = catalog.observations.flatMap((observation) => {
        const beachId = observation.stationId ? beachIds.get(observation.stationId) : null;
        if (!beachId || !observation.source.observedAt || !observation.source.sourceUrl) return [];
        return [{ beach_id: beachId, sampled_at: toIsoDate(observation.source.observedAt),
          enterococcus_value: observation.enterococcus.value, enterococcus_qualifier: observation.enterococcus.qualifier,
          status: observation.status, sampling_type: observation.sampleType, temperature_celsius: observation.temperatureCelsius,
          ph: observation.ph, observations: observation.notes ?? null, source_url: observation.source.sourceUrl,
          source_published_at: null, retrieved_at: observation.source.retrievedAt }];
      });
      for (let index = 0; index < observations.length; index += 100) {
        await trx('water_quality_observations').insert(observations.slice(index, index + 100))
          .onConflict(['beach_id', 'sampled_at', 'sampling_type'])
          .merge([
            'enterococcus_value', 'enterococcus_qualifier', 'status',
            'temperature_celsius', 'ph', 'observations', 'source_url',
            'source_published_at', 'retrieved_at',
          ]);
      }
    });
  }

  async onModuleDestroy(): Promise<void> { await this.db.destroy(); }
}

function toIsoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  const month = match ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[2]) : -1;
  if (!match || month < 0) throw new Error(`Unsupported DRNA sample date: ${value}`);
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}
