alter table public.user_roles
  add column if not exists requires_password_setup boolean not null default false,
  add column if not exists password_set boolean not null default true,
  add column if not exists onboarding_completed boolean not null default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.user_roles
set requires_password_setup = false,
    password_set = true,
    onboarding_completed = true
where requires_password_setup is null
   or password_set is null
   or onboarding_completed is null;

create or replace function public.touch_user_roles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_roles_updated_at on public.user_roles;
create trigger trg_user_roles_updated_at
before update on public.user_roles
for each row execute function public.touch_user_roles_updated_at();
