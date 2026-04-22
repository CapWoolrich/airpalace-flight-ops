-- Security hardening: durable rate limiting + stricter role-based read RLS.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'ops', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_roles_role_idx on public.user_roles (role);

create table if not exists public.api_rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_rate_limits_window_start_idx on public.api_rate_limits (window_start);

alter table public.user_roles enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.flights enable row level security;
alter table public.aircraft_status enable row level security;

drop policy if exists "authenticated read flights" on public.flights;
drop policy if exists "authenticated read aircraft status" on public.aircraft_status;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='flights' and policyname='role-based read flights'
  ) then
    create policy "role-based read flights" on public.flights
      for select to authenticated
      using (
        exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role in ('viewer', 'ops', 'admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='aircraft_status' and policyname='role-based read aircraft status'
  ) then
    create policy "role-based read aircraft status" on public.aircraft_status
      for select to authenticated
      using (
        exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role in ('viewer', 'ops', 'admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_roles' and policyname='users can read own role'
  ) then
    create policy "users can read own role" on public.user_roles
      for select to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.consume_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return false;
  end if;

  if coalesce(p_window_seconds, 0) <= 0 or coalesce(p_max, 0) <= 0 then
    return false;
  end if;

  delete from public.api_rate_limits
  where window_start < (v_now - interval '1 day');

  select window_start, count
  into v_window_start, v_count
  from public.api_rate_limits
  where key = p_key
  for update;

  if not found then
    insert into public.api_rate_limits(key, count, window_start, updated_at)
    values (p_key, 1, v_now, v_now)
    on conflict (key) do update
      set count = public.api_rate_limits.count + 1,
          updated_at = excluded.updated_at
    returning window_start, count into v_window_start, v_count;
  elsif v_window_start <= (v_now - make_interval(secs => p_window_seconds)) then
    update public.api_rate_limits
    set count = 1,
        window_start = v_now,
        updated_at = v_now
    where key = p_key
    returning window_start, count into v_window_start, v_count;
  else
    update public.api_rate_limits
    set count = count + 1,
        updated_at = v_now
    where key = p_key
    returning window_start, count into v_window_start, v_count;
  end if;

  return v_count <= p_max;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

grant select on public.user_roles to authenticated;
