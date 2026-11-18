import 'dotenv/config';
import knex from 'knex';
import { NwsPersistenceService } from '../ingestion/nws-persistence.service';

async function seed(): Promise<void> {
  const connection = process.env.DATABASE_URL;
  const url = connection ? new URL(connection) : null;
  if (!url || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/beach_monitoring_load_test') {
    throw new Error('Seed only an isolated localhost database named beach_monitoring_load_test');
  }
  const db = knex({ client: 'pg', connection });
  try {
    await db.transaction(async trx => {
      const now = new Date().toISOString();
      const [counts] = await trx('beaches').count('* as count');
      const existing = await trx('beaches').where('drna_station_id', 'like', 'LOAD-%').count('* as count');
      if (Number(counts.count) !== Number(existing[0].count)) throw new Error('Refusing to seed a database containing non-load-test beaches');
      const persistence = new NwsPersistenceService(trx);
      for (let zone = 1; zone <= 5; zone++) {
        const zoneId = `PRZ${String(zone).padStart(3, '0')}`;
        await persistence.saveCondition({
          zoneId, forecastPeriod: 'TODAY', risk: zone % 2 ? 'high' : 'moderate', summary: 'Synthetic load-test forecast',
          source: { sourceName: 'NWS', sourceUrl: 'https://example.invalid/load-forecast', observedAt: now, retrievedAt: now },
        });
        await persistence.saveAlerts(zoneId, zone % 2 ? [{
          id: `load-alert-${zone}`, title: 'Synthetic advisory', description: 'Load-test fixture only', instruction: 'Fixture only',
          severity: 'Moderate', certainty: 'Likely', urgency: 'Expected', effectiveAt: now,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), zones: [zoneId],
          source: { sourceName: 'NWS', sourceUrl: 'https://example.invalid/load-alert', observedAt: now, retrievedAt: now },
        }] : [], now);
      }
      for (let index = 0; index < 35; index++) {
        const [beach] = await trx('beaches').insert({
          drna_station_id: `LOAD-${index}`, name: `Synthetic test beach ${index}`, municipality: 'Test municipality',
          latitude: 18.1 + index * 0.01, longitude: -66.5,
          nws_forecast_zone: `PRZ${String(index % 5 + 1).padStart(3, '0')}`, nws_mapping_method: 'legacy',
        }).onConflict('drna_station_id').merge(['name']).returning('id');
        for (let day = 0; day < 4; day++) {
          const sampledAt = new Date(Date.now() - day * 86400000).toISOString().slice(0, 10);
          await trx('water_quality_observations').insert({
            beach_id: beach.id, sampled_at: sampledAt, sampling_type: 'routine',
            status: index % 2 ? 'advisory' : 'suitable', enterococcus_value: index % 2 ? 231 : 10,
            source_url: 'https://example.invalid/load-drna', retrieved_at: now,
          }).onConflict(['beach_id', 'sampled_at', 'sampling_type']).merge(['retrieved_at']);
        }
      }
    });
    console.log('Seeded 35 synthetic beaches, 140 observations, five forecasts, and active/empty alert snapshots.');
  } finally { await db.destroy(); }
}

void seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Load seed failed');
  process.exitCode = 1;
});
