import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    alter table public.beaches
      add column nws_forecast_zone text,
      add column nws_mapping_error text,
      add constraint beaches_nws_forecast_zone_check
        check (nws_forecast_zone is null or nws_forecast_zone ~ '^PRZ[0-9]{3}$'),
      add constraint beaches_nws_mapping_state_check
        check (nws_forecast_zone is null or nws_mapping_error is null);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    alter table public.beaches
      drop constraint beaches_nws_mapping_state_check,
      drop constraint beaches_nws_forecast_zone_check,
      drop column nws_mapping_error,
      drop column nws_forecast_zone;
  `);
}
