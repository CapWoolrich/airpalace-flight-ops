-- Backend hardening: move sensitive writes to backend + role model.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'ops', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_roles_role_idx on public.user_roles (role);

alter table public.user_roles enable row level security;

-- Keep read access from authenticated clients.
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
    where schemaname='public' and tablename='aircraft_status' and policyname='authenticated read aircraft status'
  ) then
    create policy "authenticated read aircraft status" on public.aircraft_status
      for select to authenticated using (true);
  end if;

  -- Remove broad authenticated writes.
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='flights' and policyname='authenticated write flights'
  ) then
    drop policy "authenticated write flights" on public.flights;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='aircraft_status' and policyname='authenticated write aircraft status'
  ) then
    drop policy "authenticated write aircraft status" on public.aircraft_status;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_roles' and policyname='users can read own role'
  ) then
    create policy "users can read own role" on public.user_roles
      for select to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- Optional compatibility grants.
grant select on public.user_roles to authenticated;
