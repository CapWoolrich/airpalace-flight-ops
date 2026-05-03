create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text,
  password_set boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy if not exists "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

create policy if not exists "profiles_update_own_safe"
on public.profiles
for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())
);

create policy if not exists "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_profiles_updated_at();
