create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.airports_master (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_priority int not null default 100,
  icao_code text null,
  iata_code text null,
  faa_lid text null,
  local_code text null,
  name text not null,
  municipality text null,
  region text null,
  country_code text not null,
  latitude_deg double precision null,
  longitude_deg double precision null,
  elevation_ft int null,
  timezone text null,
  airport_type text null,
  scheduled_service boolean null,
  gps_code text null,
  home_link text null,
  wikipedia_link text null,
  keywords tsvector null,
  longest_runway_ft int null,
  data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.airport_runways (
  id bigserial primary key,
  airport_id uuid not null references public.airports_master(id) on delete cascade,
  ident text,
  length_ft int,
  width_ft int,
  surface text,
  lighted boolean,
  closed boolean,
  le_latitude_deg double precision,
  le_longitude_deg double precision,
  he_latitude_deg double precision,
  he_longitude_deg double precision,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.airport_frequencies (
  id bigserial primary key,
  airport_id uuid not null references public.airports_master(id) on delete cascade,
  type text,
  description text,
  frequency_mhz numeric,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.airports_import_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_processed int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  merged_duplicate_count int not null default 0,
  error_count int not null default 0,
  notes jsonb not null default '{}'::jsonb
);

create unique index if not exists airports_master_icao_unique
  on public.airports_master (upper(icao_code))
  where icao_code is not null and is_active;
create index if not exists airports_master_iata_idx on public.airports_master (upper(iata_code));
create index if not exists airports_master_country_idx on public.airports_master (country_code);
create index if not exists airports_master_municipality_idx on public.airports_master (municipality);
create index if not exists airports_master_region_idx on public.airports_master (region);
create index if not exists airports_master_keywords_gin on public.airports_master using gin (keywords);
create index if not exists airports_master_name_trgm_idx on public.airports_master using gin (name gin_trgm_ops);
create index if not exists airports_master_municipality_trgm_idx on public.airports_master using gin (municipality gin_trgm_ops);
create index if not exists airports_master_icao_trgm_idx on public.airports_master using gin (icao_code gin_trgm_ops);
create index if not exists airports_master_iata_trgm_idx on public.airports_master using gin (iata_code gin_trgm_ops);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_airports_master_touch_updated_at on public.airports_master;
create trigger trg_airports_master_touch_updated_at
before update on public.airports_master
for each row
execute function public.touch_updated_at();

create or replace function public.airport_normalized_name(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function public.refresh_airport_keywords(p_airport_id uuid default null)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  update public.airports_master a
  set keywords = to_tsvector(
    'simple',
    trim(
      both ' ' from concat_ws(
        ' ',
        coalesce(a.name, ''),
        coalesce(a.municipality, ''),
        coalesce(a.region, ''),
        coalesce(a.country_code, ''),
        coalesce(a.icao_code, ''),
        coalesce(a.iata_code, ''),
        coalesce(a.faa_lid, ''),
        coalesce(a.gps_code, '')
      )
    )
  )
  where p_airport_id is null or a.id = p_airport_id;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.refresh_airport_longest_runway(p_airport_id uuid default null)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  update public.airports_master a
  set longest_runway_ft = rw.max_len
  from (
    select airport_id, max(length_ft) as max_len
    from public.airport_runways
    where p_airport_id is null or airport_id = p_airport_id
    group by airport_id
  ) rw
  where rw.airport_id = a.id;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.upsert_airport_master(
  p_source text,
  p_source_priority int,
  p_icao_code text,
  p_iata_code text,
  p_faa_lid text,
  p_local_code text,
  p_name text,
  p_municipality text,
  p_region text,
  p_country_code text,
  p_latitude_deg double precision,
  p_longitude_deg double precision,
  p_elevation_ft int,
  p_timezone text,
  p_airport_type text,
  p_scheduled_service boolean,
  p_gps_code text,
  p_home_link text,
  p_wikipedia_link text,
  p_data jsonb default '{}'::jsonb
)
returns table(airport_id uuid, action text)
language plpgsql
as $$
declare
  v_existing public.airports_master%rowtype;
  v_new_id uuid;
  v_norm_name text := public.airport_normalized_name(p_name);
begin
  select * into v_existing
  from public.airports_master a
  where a.is_active
    and (
      (p_icao_code is not null and upper(a.icao_code) = upper(p_icao_code))
      or (
        p_iata_code is not null
        and upper(a.iata_code) = upper(p_iata_code)
        and upper(a.country_code) = upper(coalesce(p_country_code, a.country_code))
        and public.airport_normalized_name(a.name) = v_norm_name
      )
      or (
        p_latitude_deg is not null
        and p_longitude_deg is not null
        and a.latitude_deg is not null
        and a.longitude_deg is not null
        and abs(a.latitude_deg - p_latitude_deg) <= 0.05
        and abs(a.longitude_deg - p_longitude_deg) <= 0.05
        and public.airport_normalized_name(a.name) = v_norm_name
      )
    )
  order by a.source_priority desc, a.updated_at desc
  limit 1;

  if found then
    if v_existing.source_priority > p_source_priority then
      update public.airports_master
      set
        data = coalesce(v_existing.data, '{}'::jsonb) || coalesce(p_data, '{}'::jsonb),
        updated_at = now()
      where id = v_existing.id;
      perform public.refresh_airport_keywords(v_existing.id);
      return query select v_existing.id, 'merged_duplicate';
      return;
    end if;

    update public.airports_master
    set
      source = p_source,
      source_priority = p_source_priority,
      icao_code = coalesce(p_icao_code, v_existing.icao_code),
      iata_code = coalesce(p_iata_code, v_existing.iata_code),
      faa_lid = coalesce(p_faa_lid, v_existing.faa_lid),
      local_code = coalesce(p_local_code, v_existing.local_code),
      name = coalesce(nullif(p_name, ''), v_existing.name),
      municipality = coalesce(nullif(p_municipality, ''), v_existing.municipality),
      region = coalesce(nullif(p_region, ''), v_existing.region),
      country_code = coalesce(nullif(p_country_code, ''), v_existing.country_code),
      latitude_deg = coalesce(p_latitude_deg, v_existing.latitude_deg),
      longitude_deg = coalesce(p_longitude_deg, v_existing.longitude_deg),
      elevation_ft = coalesce(p_elevation_ft, v_existing.elevation_ft),
      timezone = coalesce(nullif(p_timezone, ''), v_existing.timezone),
      airport_type = coalesce(nullif(p_airport_type, ''), v_existing.airport_type),
      scheduled_service = coalesce(p_scheduled_service, v_existing.scheduled_service),
      gps_code = coalesce(nullif(p_gps_code, ''), v_existing.gps_code),
      home_link = coalesce(nullif(p_home_link, ''), v_existing.home_link),
      wikipedia_link = coalesce(nullif(p_wikipedia_link, ''), v_existing.wikipedia_link),
      data = coalesce(v_existing.data, '{}'::jsonb) || coalesce(p_data, '{}'::jsonb),
      is_active = true,
      updated_at = now()
    where id = v_existing.id;

    perform public.refresh_airport_keywords(v_existing.id);
    return query select v_existing.id, 'updated';
    return;
  end if;

  insert into public.airports_master (
    source, source_priority, icao_code, iata_code, faa_lid, local_code, name, municipality, region,
    country_code, latitude_deg, longitude_deg, elevation_ft, timezone, airport_type,
    scheduled_service, gps_code, home_link, wikipedia_link, data
  ) values (
    p_source, p_source_priority, nullif(p_icao_code, ''), nullif(p_iata_code, ''), nullif(p_faa_lid, ''), nullif(p_local_code, ''), p_name,
    nullif(p_municipality, ''), nullif(p_region, ''), upper(coalesce(p_country_code, 'XX')),
    p_latitude_deg, p_longitude_deg, p_elevation_ft, nullif(p_timezone, ''), nullif(p_airport_type, ''),
    p_scheduled_service, nullif(p_gps_code, ''), nullif(p_home_link, ''), nullif(p_wikipedia_link, ''), coalesce(p_data, '{}'::jsonb)
  ) returning id into v_new_id;

  perform public.refresh_airport_keywords(v_new_id);
  return query select v_new_id, 'inserted';
end;
$$;

create or replace function public.search_airports_master(p_query text, p_limit int default 20)
returns table(
  id uuid,
  name text,
  municipality text,
  region text,
  country_code text,
  iata_code text,
  icao_code text,
  timezone text,
  latitude_deg double precision,
  longitude_deg double precision,
  source_priority int,
  rank_score double precision
)
language sql
stable
as $$
with q as (
  select upper(trim(coalesce(p_query, ''))) as query,
         greatest(1, least(coalesce(p_limit, 20), 50)) as lim
), base as (
  select a.*,
    case
      when upper(coalesce(a.icao_code, '')) = q.query then 400
      when upper(coalesce(a.iata_code, '')) = q.query then 390
      when upper(coalesce(a.faa_lid, '')) = q.query then 380
      when upper(coalesce(a.name, '')) = q.query then 360
      when upper(coalesce(a.municipality, '')) = q.query then 340
      when upper(coalesce(a.icao_code, '')) like q.query || '%' then 320
      when upper(coalesce(a.iata_code, '')) like q.query || '%' then 310
      when upper(coalesce(a.name, '')) like q.query || '%' then 280
      when upper(coalesce(a.municipality, '')) like q.query || '%' then 260
      when upper(coalesce(a.region, '')) like q.query || '%' then 240
      when upper(coalesce(a.country_code, '')) = q.query then 220
      else 0
    end as exactish_score,
    greatest(
      similarity(coalesce(a.name, ''), q.query),
      similarity(coalesce(a.municipality, ''), q.query),
      similarity(coalesce(a.icao_code, ''), q.query),
      similarity(coalesce(a.iata_code, ''), q.query)
    ) as trigram_score,
    ts_rank_cd(
      coalesce(a.keywords, to_tsvector('simple', coalesce(a.name, ''))),
      websearch_to_tsquery('simple', q.query)
    ) as fts_score
  from public.airports_master a
  cross join q
  where a.is_active
    and (
      q.query = ''
      or upper(coalesce(a.icao_code, '')) like '%' || q.query || '%'
      or upper(coalesce(a.iata_code, '')) like '%' || q.query || '%'
      or upper(coalesce(a.name, '')) like '%' || q.query || '%'
      or upper(coalesce(a.municipality, '')) like '%' || q.query || '%'
      or upper(coalesce(a.region, '')) like '%' || q.query || '%'
      or upper(coalesce(a.country_code, '')) like '%' || q.query || '%'
      or coalesce(a.keywords, to_tsvector('simple', coalesce(a.name, ''))) @@ websearch_to_tsquery('simple', q.query)
      or similarity(coalesce(a.name, ''), q.query) > 0.2
      or similarity(coalesce(a.municipality, ''), q.query) > 0.2
      or similarity(coalesce(a.icao_code, ''), q.query) > 0.3
      or similarity(coalesce(a.iata_code, ''), q.query) > 0.3
    )
)
select
  id,
  name,
  municipality,
  region,
  country_code,
  iata_code,
  icao_code,
  timezone,
  latitude_deg,
  longitude_deg,
  source_priority,
  (exactish_score + (trigram_score * 100) + (fts_score * 75) + least(source_priority, 500) * 0.01) as rank_score
from base
order by rank_score desc, source_priority desc, name asc
limit (select lim from q);
$$;

alter table public.airports_master enable row level security;
alter table public.airport_runways enable row level security;
alter table public.airport_frequencies enable row level security;

drop policy if exists airports_master_read_auth on public.airports_master;
create policy airports_master_read_auth on public.airports_master
for select
using (auth.role() = 'authenticated');

drop policy if exists airport_runways_read_auth on public.airport_runways;
create policy airport_runways_read_auth on public.airport_runways
for select
using (auth.role() = 'authenticated');

drop policy if exists airport_frequencies_read_auth on public.airport_frequencies;
create policy airport_frequencies_read_auth on public.airport_frequencies
for select
using (auth.role() = 'authenticated');

revoke all on function public.upsert_airport_master(text, int, text, text, text, text, text, text, text, text, double precision, double precision, int, text, text, boolean, text, text, text, jsonb) from anon, authenticated;
grant execute on function public.search_airports_master(text, int) to authenticated;

