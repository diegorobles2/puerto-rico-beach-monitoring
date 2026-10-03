import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    alter table public.knex_migrations enable row level security;
    alter table public.knex_migrations_lock enable row level security;

    revoke all on table public.knex_migrations from anon, authenticated;
    revoke all on table public.knex_migrations_lock from anon, authenticated;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    alter table public.knex_migrations disable row level security;
    alter table public.knex_migrations_lock disable row level security;
  `);
}
