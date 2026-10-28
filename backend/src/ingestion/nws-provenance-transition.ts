import type { Knex } from 'knex';
import { resolve } from 'node:path';
import type { NwsService } from '../data-sources/nws/nws.service';

interface ExistingMapping {
  id: string | number;
  drna_station_id: string;
  latitude: number | null;
  longitude: number | null;
  nws_forecast_zone: string;
}
const columns = ['id', 'drna_station_id', 'latitude', 'longitude', 'nws_forecast_zone'];

async function legacyMappings(db: Knex): Promise<ExistingMapping[]> {
  const hasProvenance = await db.schema.hasColumn('beaches', 'nws_mapping_method');
  const query = db('beaches').select(columns).whereNotNull('nws_forecast_zone').orderBy('id');
  if (hasProvenance) query.where('nws_mapping_method', 'legacy');
  return query;
}

/** Initial cutover only: no schema/data changes until every historical zone is
 * independently confirmed. Existing automatic/fallback provenance is untouched.
 * Call with writers drained; the final table lock also guards concurrent edits.
 */
export async function transitionNwsProvenance(
  db: Knex,
  nws: Pick<NwsService, 'getForecastZone'>,
  migrate: (trx: Knex.Transaction) => Promise<unknown> = trx => trx.migrate.latest({
    directory: resolve(__dirname, '../database/migrations'), loadExtensions: ['.ts'],
  }),
): Promise<{ validated: number }> {
  const reviewed = await legacyMappings(db);
  for (const beach of reviewed) {
    if (typeof beach.latitude !== 'number' || !Number.isFinite(beach.latitude) || Math.abs(beach.latitude) > 90
      || typeof beach.longitude !== 'number' || !Number.isFinite(beach.longitude) || Math.abs(beach.longitude) > 180
      || !/^PRZ\d{3}$/.test(beach.nws_forecast_zone)) {
      throw new Error(`Cannot validate existing NWS mapping for ${beach.drna_station_id}; transition aborted`);
    }
    let zone: string;
    try { zone = await nws.getForecastZone(beach.latitude, beach.longitude); }
    catch {
      throw new Error(`NWS validation failed for ${beach.drna_station_id}; transition aborted without applying migrations`);
    }
    if (zone !== beach.nws_forecast_zone) {
      throw new Error(`NWS zone changed for ${beach.drna_station_id}; review required before transition`);
    }
  }

  await db.transaction(async trx => {
    // Blocks coordinate/zone/catalog writes until schema and provenance commit.
    // No external requests occur while holding this lock. Fail instead of waiting
    // indefinitely for an undrained writer or reader during ALTER TABLE.
    await trx.raw("set local lock_timeout = '10s'");
    await trx.raw('lock table public.beaches in share row exclusive mode');
    if (JSON.stringify(await legacyMappings(trx)) !== JSON.stringify(reviewed)) {
      throw new Error('Existing mappings changed during NWS validation; transition aborted');
    }
    await migrate(trx);
    for (const beach of reviewed) {
      const affected = await trx('beaches').where({
        id: beach.id, drna_station_id: beach.drna_station_id, latitude: beach.latitude,
        longitude: beach.longitude, nws_forecast_zone: beach.nws_forecast_zone, nws_mapping_method: 'legacy',
      }).whereNull('nws_mapping_latitude').whereNull('nws_mapping_longitude').whereNull('nws_mapping_registry_version')
        .update({ nws_mapping_method: 'automatic', nws_mapping_latitude: beach.latitude,
          nws_mapping_longitude: beach.longitude, nws_mapping_registry_version: null, nws_mapping_error: null });
      if (affected !== 1) throw new Error(`Mapping changed for ${beach.drna_station_id}; transition aborted`);
    }
  });
  return { validated: reviewed.length };
}
