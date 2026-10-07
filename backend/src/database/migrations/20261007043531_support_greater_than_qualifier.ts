import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    alter table public.water_quality_observations
      drop constraint water_quality_enterococcus_qualifier_check,
      add constraint water_quality_enterococcus_qualifier_check check (
        enterococcus_qualifier is null
        or (enterococcus_qualifier in ('less-than', 'greater-than') and enterococcus_value is not null)
      );
  `);
}
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    alter table public.water_quality_observations
      drop constraint water_quality_enterococcus_qualifier_check,
      add constraint water_quality_enterococcus_qualifier_check check (
        enterococcus_qualifier is null
        or (enterococcus_qualifier = 'less-than' and enterococcus_value is not null)
      );
  `);
}
