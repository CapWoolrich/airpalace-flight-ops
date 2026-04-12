-- Adds creator tracking fields for flights, non-destructive and nullable.
alter table if exists public.flights
  add column if not exists created_by_user_id text,
  add column if not exists created_by_user_email text,
  add column if not exists created_by_user_name text,
  add column if not exists created_by_email text,
  add column if not exists created_by_name text,
  add column if not exists updated_by_email text,
  add column if not exists updated_by_name text,
  add column if not exists creation_source text;

-- Optional lightweight check for source values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'flights_creation_source_check'
  ) then
    alter table public.flights
      add constraint flights_creation_source_check
      check (creation_source is null or creation_source in ('manual','ai'));
  end if;
end $$;
