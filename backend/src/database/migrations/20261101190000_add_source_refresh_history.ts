
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('public').createTable('source_refresh_history', (table) => {
    table.bigIncrements('id').primary();

    table.text('source').notNullable();
    table.text('source_key').notNullable();
    table.text('zone_id').nullable();

    table.timestamp('started_at', { useTz: true }).notNullable();
    table.timestamp('finished_at', { useTz: true }).notNullable();

    table.boolean('succeeded').notNullable();
    table.integer('duration_ms').notNullable();

    table.timestamp('published_at', { useTz: true }).nullable();

    table.index(['source', 'started_at'], 'source_refresh_history_source_time_idx');
  });

  await knex.raw(`
    ALTER TABLE public.source_refresh_history
      ADD CONSTRAINT source_refresh_history_source_check
      CHECK (source IN ('nws', 'drna'));

    ALTER TABLE public.source_refresh_history
      ADD CONSTRAINT source_refresh_history_duration_check
      CHECK (duration_ms >= 0);

    ALTER TABLE public.source_refresh_history
      ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON public.source_refresh_history
      FROM anon, authenticated;

    REVOKE ALL ON SEQUENCE public.source_refresh_history_id_seq
      FROM anon, authenticated;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('public').dropTableIfExists('source_refresh_history');
}
