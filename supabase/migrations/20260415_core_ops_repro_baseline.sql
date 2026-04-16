-- Core reproducibility baseline for local/dev Supabase bootstrap.
-- Safe/idempotent: only creates missing structures used by the app.

create extension if not exists pgcrypto;

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  ac text not null,
  orig text not null,
  dest text not null,
  time text not null default 'STBY',
  rb text not null,
  nt text,
  pm integer not null default 0,
  pw integer not null default 0,
  pc integer not null default 0,
  bg integer not null default 0,
  st text not null default 'prog',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_user_email text,
  created_by_user_name text,
  created_by_email text,
  created_by_name text,
  updated_by_email text,
  updated_by_name text,
  creation_source text
);

create table if not exists public.aircraft_status (
  ac text primary key,
  status text not null default 'disponible',
  maintenance_start_date date,
  maintenance_end_date date,
  updated_at timestamptz not null default now()
);

create index if not exists flights_date_time_idx on public.flights (date, time);
create index if not exists flights_ac_date_idx on public.flights (ac, date);
create index if not exists flights_status_date_idx on public.flights (st, date);

alter table public.flights enable row level security;
alter table public.aircraft_status enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='flights' and policyname='authenticated read flights'
  ) then
    create policy "authenticated read flights" on public.flights
      for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='flights' and policyname='authenticated write flights'
  ) then
    create policy "authenticated write flights" on public.flights
      for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='aircraft_status' and policyname='authenticated read aircraft status'
  ) then
    create policy "authenticated read aircraft status" on public.aircraft_status
      for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='aircraft_status' and policyname='authenticated write aircraft status'
  ) then
    create policy "authenticated write aircraft status" on public.aircraft_status
      for all to authenticated using (true) with check (true);
  end if;
end $$;
