-- Ensures flight audit columns exist and asks PostgREST to reload schema cache.
alter table if exists public.flights
  add column if not exists created_by_user_id text,
  add column if not exists created_by_user_email text,
  add column if not exists created_by_user_name text,
  add column if not exists created_by_email text,
  add column if not exists created_by_name text,
  add column if not exists updated_by_email text,
  add column if not exists updated_by_name text,
  add column if not exists creation_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'flights_creation_source_check'
      and conrelid = 'public.flights'::regclass
  ) then
    alter table public.flights
      add constraint flights_creation_source_check
      check (creation_source is null or creation_source in ('manual', 'ai'));
  end if;
end $$;

notify pgrst, 'reload schema';
