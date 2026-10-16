
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    create table public.nws_conditions (
      id bigint generated always as identity primary key,
      zone_id text not null unique,
      forecast_period text,
      risk text not null,
      summary text not null,
      source_url text,
      observed_at timestamptz,
      retrieved_at timestamptz not null,
      updated_at timestamptz not null default now(),
      constraint nws_conditions_zone_check
        check (zone_id ~ '^PRZ[0-9]{3}$'),
      constraint nws_conditions_risk_check
        check (risk in ('low', 'moderate', 'high', 'extreme', 'unknown'))
    );

    create table public.nws_alerts (
      id text primary key,
      title text not null,
      description text not null,
      instruction text,
      severity text not null,
      certainty text not null,
      urgency text not null,
      effective_at timestamptz not null,
      expires_at timestamptz not null,
      source_url text,
      observed_at timestamptz,
      retrieved_at timestamptz not null,
      updated_at timestamptz not null default now(),
      constraint nws_alerts_valid_period_check
        check (expires_at >= effective_at)
    );

    create table public.nws_alert_zones (
      alert_id text not null
        references public.nws_alerts(id) on delete cascade,
      zone_id text not null,
      is_active boolean not null default true,
      last_seen_at timestamptz not null default now(),
      primary key (alert_id, zone_id),
      constraint nws_alert_zones_zone_check
        check (zone_id ~ '^PRZ[0-9]{3}$')
    );

    create table public.nws_alert_snapshots (
      zone_id text primary key,
      retrieved_at timestamptz not null,
      updated_at timestamptz not null default now(),
      constraint nws_alert_snapshots_zone_check
        check (zone_id ~ '^PRZ[0-9]{3}$')
    );

    alter table public.nws_alert_snapshots enable row level security;

    revoke all on public.nws_alert_snapshots
    from anon, authenticated;

    create table public.nws_source_health (
      source_key text primary key,
      last_attempt_at timestamptz,
      last_success_at timestamptz,
      last_attempt_succeeded boolean,
      last_error text,
      updated_at timestamptz not null default now(),
      constraint nws_source_health_key_check
        check (source_key in ('conditions', 'alerts'))
    );

    create index nws_alert_zones_zone_idx
      on public.nws_alert_zones (zone_id, alert_id);

    create index nws_alerts_expiration_idx
      on public.nws_alerts (expires_at desc);

    create index nws_conditions_retrieved_idx
      on public.nws_conditions (retrieved_at desc);

    alter table public.nws_conditions enable row level security;
    alter table public.nws_alerts enable row level security;
    alter table public.nws_alert_zones enable row level security;
    alter table public.nws_source_health enable row level security;

    revoke all on
      public.nws_conditions,
      public.nws_alerts,
      public.nws_alert_zones,
      public.nws_source_health
    from anon, authenticated;

    revoke all on sequence public.nws_conditions_id_seq
    from anon, authenticated;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    drop table if exists public.nws_alert_snapshots;
    drop table if exists public.nws_alert_zones;
    drop table if exists public.nws_alerts;
    drop table if exists public.nws_conditions;
    drop table if exists public.nws_source_health;
  `);
}
