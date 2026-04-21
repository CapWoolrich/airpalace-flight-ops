-- Harden airport search to exclude non-operational airport types
-- and deactivate legacy rows that should not be searchable.

update public.airports_master
set is_active = false,
    updated_at = now()
where lower(coalesce(airport_type, '')) in ('heliport', 'seaplane_base', 'balloonport', 'closed');

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
    and lower(coalesce(a.airport_type, '')) not in ('heliport', 'seaplane_base', 'balloonport', 'closed')
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
