-- Ensure flights audit columns exist across environments where schema drift happened.
alter table if exists public.flights
  add column if not exists created_by_user_id text,
  add column if not exists created_by_user_email text,
  add column if not exists created_by_user_name text,
  add column if not exists created_by_email text,
  add column if not exists created_by_name text,
  add column if not exists updated_by_email text,
  add column if not exists updated_by_name text,
  add column if not exists creation_source text;

-- Keep/restore source check constraint safely.
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

-- Refresh PostgREST schema cache for environments where columns were recently added.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    -- Non-fatal in environments where PostgREST listener/channel differs.
    null;
end $$;
