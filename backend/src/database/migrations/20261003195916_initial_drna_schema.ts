import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    create table public.beaches (
      id bigint generated always as identity primary key,
      drna_station_id text not null unique,
      name text not null,
      municipality text not null,
      latitude double precision,
      longitude double precision,
      created_at timestamptz not null default now(),
      constraint beaches_latitude_check check (latitude between -90 and 90),
      constraint beaches_longitude_check check (longitude between -180 and 180)
    );

    create table public.water_quality_observations (
      id bigint generated always as identity primary key,
      beach_id bigint not null references public.beaches(id) on delete restrict,
      sampled_at date not null,
      enterococcus_value integer,
      enterococcus_qualifier text,
      status text not null,
      sampling_type text not null,
      temperature_celsius numeric(4, 1),
      ph numeric(4, 2),
      observations text,
      source_url text not null,
      source_published_at timestamptz,
      retrieved_at timestamptz not null,
      created_at timestamptz not null default now(),
      constraint water_quality_enterococcus_value_check check (enterococcus_value >= 0),
      constraint water_quality_enterococcus_qualifier_check check (
        enterococcus_qualifier is null
        or (enterococcus_qualifier = 'less-than' and enterococcus_value is not null)
      ),
      constraint water_quality_status_check check (status in ('suitable', 'advisory', 'unknown')),
      constraint water_quality_sampling_type_check check (sampling_type in ('routine', 'resampling', 'unknown')),
      constraint water_quality_temperature_check check (temperature_celsius between -5 and 60),
      constraint water_quality_ph_check check (ph between 0 and 14)
    );

    create index water_quality_observations_beach_sampled_idx
      on public.water_quality_observations (beach_id, sampled_at desc);

    alter table public.beaches enable row level security;
    alter table public.water_quality_observations enable row level security;

    revoke all on public.beaches, public.water_quality_observations from anon, authenticated;
    revoke all on sequence public.beaches_id_seq, public.water_quality_observations_id_seq from anon, authenticated;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    drop table if exists public.water_quality_observations;
    drop table if exists public.beaches;
  `);
}
