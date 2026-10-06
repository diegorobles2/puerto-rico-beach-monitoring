import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('water_quality_observations', (table) => {
    table.unique(['beach_id', 'sampled_at', 'sampling_type'], {
      indexName: 'water_quality_observations_sample_unique',
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('water_quality_observations', (table) => {
    table.dropUnique(
      ['beach_id', 'sampled_at', 'sampling_type'],
      'water_quality_observations_sample_unique',
    );
  });
}
