create extension if not exists unaccent;
create extension if not exists pg_trgm;

alter table public.airports_master
  add column if not exists search_text text;

create table if not exists public.airport_aliases (
  id uuid primary key default gen_random_uuid(),
  airport_id uuid not null references public.airports_master(id) on delete cascade,
  alias text not null,
  alias_normalized text not null,
  alias_type text not null,
  priority int not null default 100,
  created_at timestamptz not null default now()
);

create unique index if not exists airport_aliases_unique_airport_alias_type
  on public.airport_aliases (airport_id, alias_normalized, alias_type);
create index if not exists airport_aliases_airport_idx on public.airport_aliases (airport_id);
create index if not exists airport_aliases_alias_trgm_idx on public.airport_aliases using gin (alias_normalized gin_trgm_ops);
create index if not exists airports_master_search_text_trgm_idx on public.airports_master using gin (search_text gin_trgm_ops);

create or replace function public.airport_normalize_text(raw text)
returns text
language sql
stable
as $$
  select regexp_replace(lower(unaccent(coalesce(raw, ''))), '[^a-z0-9]+', ' ', 'g');
$$;

create or replace function public.refresh_airport_search_index(p_airport_id uuid default null)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  update public.airports_master a
  set search_text = trim(
    both ' ' from concat_ws(
      ' ',
      public.airport_normalize_text(a.name),
      public.airport_normalize_text(a.municipality),
      public.airport_normalize_text(a.region),
      public.airport_normalize_text(a.country_code),
      public.airport_normalize_text(a.iata_code),
      public.airport_normalize_text(a.icao_code),
      public.airport_normalize_text(a.faa_lid)
    )
  )
  where p_airport_id is null or a.id = p_airport_id;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.refresh_airport_keywords(p_airport_id uuid default null)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  perform public.refresh_airport_search_index(p_airport_id);

  update public.airports_master a
  set keywords = to_tsvector('simple', coalesce(a.search_text, ''))
  where p_airport_id is null or a.id = p_airport_id;

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
      set data = coalesce(v_existing.data, '{}'::jsonb) || coalesce(p_data, '{}'::jsonb),
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
      icao_code = coalesce(nullif(p_icao_code, ''), v_existing.icao_code),
      iata_code = coalesce(nullif(p_iata_code, ''), v_existing.iata_code),
      faa_lid = coalesce(nullif(p_faa_lid, ''), v_existing.faa_lid),
      local_code = coalesce(nullif(p_local_code, ''), v_existing.local_code),
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

create or replace function public.upsert_airport_alias(
  p_airport_id uuid,
  p_alias text,
  p_alias_type text,
  p_priority int default 100
)
returns uuid
language plpgsql
as $$
declare
  v_alias text := trim(coalesce(p_alias, ''));
  v_normalized text := trim(public.airport_normalize_text(p_alias));
  v_id uuid;
begin
  if p_airport_id is null or v_alias = '' or v_normalized = '' then
    return null;
  end if;

  insert into public.airport_aliases (airport_id, alias, alias_normalized, alias_type, priority)
  values (p_airport_id, v_alias, v_normalized, coalesce(nullif(p_alias_type, ''), 'manual'), coalesce(p_priority, 100))
  on conflict (airport_id, alias_normalized, alias_type)
  do update set
    alias = excluded.alias,
    priority = greatest(airport_aliases.priority, excluded.priority)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.rebuild_airport_aliases()
returns int
language plpgsql
as $$
declare
  v_count int := 0;
  rec record;
begin
  delete from public.airport_aliases where alias_type in ('auto_name','auto_code','required');

  for rec in
    select id, name, municipality, icao_code, iata_code
    from public.airports_master
    where is_active
  loop
    if rec.name is not null then
      perform public.upsert_airport_alias(rec.id, rec.name, 'auto_name', 120);
      v_count := v_count + 1;
    end if;
    if rec.municipality is not null then
      perform public.upsert_airport_alias(rec.id, rec.municipality, 'auto_name', 110);
      v_count := v_count + 1;
    end if;
    if rec.icao_code is not null then
      perform public.upsert_airport_alias(rec.id, rec.icao_code, 'auto_code', 300);
      v_count := v_count + 1;
    end if;
    if rec.iata_code is not null then
      perform public.upsert_airport_alias(rec.id, rec.iata_code, 'auto_code', 290);
      v_count := v_count + 1;
    end if;
  end loop;

  -- Required operational aliases.
  insert into public.airport_aliases (airport_id, alias, alias_normalized, alias_type, priority)
  select a.id, x.alias, public.airport_normalize_text(x.alias), 'required', x.priority
  from (
    values
      ('KBOS','Boston',500), ('KBOS','BOS',500),
      ('KTPA','Tampa',500), ('KTPA','TPA',500),
      ('KASE','Aspen',500), ('KASE','ASE',500),
      ('KEGE','Vail',500), ('KEGE','Eagle',500), ('KEGE','Eagle Vail',500), ('KEGE','Vail Eagle',500), ('KEGE','EGE',500),
      ('KHOU','Houston Hobby',500), ('KHOU','Hobby',500), ('KHOU','HOU',500),
      ('KIAH','Houston Intercontinental',500), ('KIAH','IAH',500),
      ('KSAT','San Antonio',500), ('KSAT','SAT',500),
      ('KSFO','San Francisco',500), ('KSFO','SFO',500),
      ('KLAS','Las Vegas',500), ('KLAS','LAS',500),
      ('MKBS','Ocho Rios',500), ('MKBS','Boscobel',500), ('MKBS','Ian Fleming',500), ('MKBS','OCJ',500),
      ('MBPV','Providenciales',500), ('MBPV','Provo',500), ('MBPV','PLS',500),
      ('MBGT','Grand Turk',500), ('MBGT','JAGS McCartney',500), ('MBGT','GDT',500)
  ) as x(icao, alias, priority)
  join public.airports_master a on upper(a.icao_code) = x.icao and a.is_active
  on conflict (airport_id, alias_normalized, alias_type)
  do update set priority = greatest(airport_aliases.priority, excluded.priority);

  get diagnostics v_count = row_count;
  return v_count;
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
  select trim(coalesce(p_query, '')) as raw_query,
         trim(public.airport_normalize_text(p_query)) as normalized_query,
         greatest(1, least(coalesce(p_limit, 20), 50)) as lim
), alias_hits as (
  select al.airport_id,
         max(case
             when al.alias_normalized = q.normalized_query then 350 + al.priority
             when al.alias_normalized like q.normalized_query || '%' then 230 + al.priority
             else 0
           end) as alias_score,
         max(similarity(al.alias_normalized, q.normalized_query)) as alias_similarity
  from public.airport_aliases al
  cross join q
  where q.normalized_query <> ''
    and (
      al.alias_normalized = q.normalized_query
      or al.alias_normalized like q.normalized_query || '%'
      or similarity(al.alias_normalized, q.normalized_query) > 0.2
    )
  group by al.airport_id
), base as (
  select a.*,
         coalesce(ah.alias_score, 0) as alias_score,
         coalesce(ah.alias_similarity, 0) as alias_similarity,
         case
           when upper(coalesce(a.icao_code, '')) = upper(q.raw_query) then 500
           when upper(coalesce(a.iata_code, '')) = upper(q.raw_query) then 480
           when upper(coalesce(a.icao_code, '')) like upper(q.raw_query) || '%' then 320
           when upper(coalesce(a.iata_code, '')) like upper(q.raw_query) || '%' then 300
           else 0
         end as code_score,
         greatest(
           similarity(public.airport_normalize_text(coalesce(a.name, '')), q.normalized_query),
           similarity(public.airport_normalize_text(coalesce(a.municipality, '')), q.normalized_query),
           similarity(public.airport_normalize_text(coalesce(a.region, '')), q.normalized_query),
           coalesce(ah.alias_similarity, 0)
         ) as trigram_score,
         ts_rank_cd(
           coalesce(a.keywords, to_tsvector('simple', coalesce(a.search_text, ''))),
           websearch_to_tsquery('simple', replace(q.normalized_query, ' ', ' & '))
         ) as fts_score
  from public.airports_master a
  cross join q
  left join alias_hits ah on ah.airport_id = a.id
  where a.is_active
    and (
      q.normalized_query = ''
      or upper(coalesce(a.icao_code, '')) = upper(q.raw_query)
      or upper(coalesce(a.iata_code, '')) = upper(q.raw_query)
      or upper(coalesce(a.icao_code, '')) like upper(q.raw_query) || '%'
      or upper(coalesce(a.iata_code, '')) like upper(q.raw_query) || '%'
      or public.airport_normalize_text(coalesce(a.search_text, '')) like '%' || q.normalized_query || '%'
      or ah.airport_id is not null
      or coalesce(a.keywords, to_tsvector('simple', coalesce(a.search_text, ''))) @@ websearch_to_tsquery('simple', replace(q.normalized_query, ' ', ' & '))
      or similarity(public.airport_normalize_text(coalesce(a.search_text, '')), q.normalized_query) > 0.2
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
  (
    code_score
    + alias_score
    + (trigram_score * 100)
    + (fts_score * 80)
    + (least(source_priority, 5000) * 0.01)
  ) as rank_score
from base
order by rank_score desc, source_priority desc, name asc
limit (select lim from q);
$$;

alter table public.airport_aliases enable row level security;
drop policy if exists airport_aliases_read_auth on public.airport_aliases;
create policy airport_aliases_read_auth on public.airport_aliases
for select using (auth.role() = 'authenticated');

grant execute on function public.upsert_airport_alias(uuid, text, text, int) to service_role;
grant execute on function public.rebuild_airport_aliases() to service_role;
grant execute on function public.refresh_airport_search_index(uuid) to service_role;
grant execute on function public.search_airports_master(text, int) to authenticated;
