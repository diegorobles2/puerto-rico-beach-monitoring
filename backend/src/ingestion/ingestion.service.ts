import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Knex } from 'knex';
import { DATABASE } from '../database/database.module';
import { DrnaService } from '../data-sources/drna/drna.service';

const SUPPORTED_BEACHES = [
  {
    stationId: 'RW-22',
    name: 'Pico de Piedra',
    municipality: 'Aguada',
    latitude: 18.3843639,
    longitude: -67.2129889,
  },
] as const;

@Injectable()
export class IngestionService implements OnModuleDestroy {
  constructor(
    private readonly drna: DrnaService,
    @Inject(DATABASE) private readonly db: Knex,
  ) {}

  async refresh(): Promise<void> {
    for (const beach of SUPPORTED_BEACHES) {
      const observation = await this.drna.getWaterQuality(beach.stationId);
      if (!observation?.source.observedAt) continue;
      if (!observation.source.sourceUrl) throw new Error('DRNA observation is missing its source URL');
      const sampledAt = toIsoDate(observation.source.observedAt);

      await this.db.transaction(async (trx) => {
        const [savedBeach] = await trx('beaches')
          .insert({
            drna_station_id: beach.stationId,
            name: beach.name,
            municipality: beach.municipality,
            latitude: beach.latitude,
            longitude: beach.longitude,
          })
          .onConflict('drna_station_id')
          .merge({
            name: beach.name,
            municipality: beach.municipality,
            latitude: beach.latitude,
            longitude: beach.longitude,
          })
          .returning('id');

        await trx('water_quality_observations')
          .insert({
            beach_id: savedBeach.id,
            sampled_at: sampledAt,
            enterococcus_value: observation.enterococcus.value,
            enterococcus_qualifier: observation.enterococcus.qualifier,
            status: observation.status,
            sampling_type: observation.sampleType,
            temperature_celsius: observation.temperatureCelsius,
            ph: observation.ph,
            observations: observation.notes ?? null,
            source_url: observation.source.sourceUrl,
            source_published_at: null,
            retrieved_at: observation.source.retrievedAt,
          })
          .onConflict(['beach_id', 'sampled_at', 'sampling_type'])
          .ignore();
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}

function toIsoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (!match) throw new Error(`Unsupported DRNA sample date: ${value}`);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(
    match[2],
  );
  if (month < 0) throw new Error(`Unsupported DRNA sample date: ${value}`);
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}
