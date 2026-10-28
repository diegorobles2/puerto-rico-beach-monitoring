import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    create function public.invalidate_nws_mapping_on_coordinate_change() returns trigger
    language plpgsql set search_path = pg_catalog, public as $$
    begin
      new.nws_forecast_zone := null;
      new.nws_mapping_method := null;
      new.nws_mapping_latitude := null;
      new.nws_mapping_longitude := null;
      new.nws_mapping_registry_version := null;
      new.nws_mapping_error := 'NWS mapping invalidated because beach coordinates changed';
      return new;
    end;
    $$;
    create trigger beaches_invalidate_nws_mapping_on_coordinate_change
      before update of latitude, longitude on public.beaches
      for each row when (old.latitude is distinct from new.latitude or old.longitude is distinct from new.longitude)
      execute function public.invalidate_nws_mapping_on_coordinate_change();

    -- Remove pre-existing stale proven mappings; legacy provenance cannot be reconstructed.
    update public.beaches set nws_forecast_zone = null, nws_mapping_method = null,
      nws_mapping_latitude = null, nws_mapping_longitude = null, nws_mapping_registry_version = null,
      nws_mapping_error = 'NWS mapping is stale for current beach coordinates'
      where nws_forecast_zone is not null and nws_mapping_method <> 'legacy'
        and (nws_mapping_latitude is distinct from latitude or nws_mapping_longitude is distinct from longitude);
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Invalidated mappings cannot safely be restored by rollback.
  await knex.raw(`
    drop trigger beaches_invalidate_nws_mapping_on_coordinate_change on public.beaches;
    drop function public.invalidate_nws_mapping_on_coordinate_change();
  `);
}
