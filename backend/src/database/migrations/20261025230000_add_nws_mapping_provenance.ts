import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    alter table public.beaches
      add column nws_mapping_method text,
      add column nws_mapping_latitude double precision,
      add column nws_mapping_longitude double precision,
      add column nws_mapping_registry_version text;

    -- Historical lookup coordinates are unknown. Preserve zones without inventing provenance.
    update public.beaches set nws_mapping_method = 'legacy'
      where nws_forecast_zone is not null;

    alter table public.beaches
      add constraint beaches_nws_mapping_latitude_check check (
        nws_mapping_latitude is null or nws_mapping_latitude between -90 and 90
      ),
      add constraint beaches_nws_mapping_longitude_check check (
        nws_mapping_longitude is null or nws_mapping_longitude between -180 and 180
      ),
      add constraint beaches_nws_mapping_provenance_check check ((
        (nws_forecast_zone is null
          and nws_mapping_method is null
          and nws_mapping_latitude is null and nws_mapping_longitude is null
          and nws_mapping_registry_version is null)
        or (nws_forecast_zone is not null and nws_mapping_method = 'legacy'
          and nws_mapping_latitude is null and nws_mapping_longitude is null
          and nws_mapping_registry_version is null)
        or (nws_forecast_zone is not null and nws_mapping_method = 'automatic'
          and nws_mapping_latitude is not null and nws_mapping_longitude is not null
          and nws_mapping_registry_version is null)
        or (nws_forecast_zone is not null and nws_mapping_method = 'verified-fallback'
          and nws_mapping_latitude is not null and nws_mapping_longitude is not null
          and nws_mapping_registry_version is not null
          and nws_mapping_registry_version ~ '[^[:space:]]')
      ) is true);
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Rollback removes provenance only; active zones, errors and beach coordinates survive.
  await knex.raw(`
    alter table public.beaches
      drop constraint beaches_nws_mapping_provenance_check,
      drop constraint beaches_nws_mapping_longitude_check,
      drop constraint beaches_nws_mapping_latitude_check,
      drop column nws_mapping_registry_version,
      drop column nws_mapping_longitude,
      drop column nws_mapping_latitude,
      drop column nws_mapping_method;
  `);
}
