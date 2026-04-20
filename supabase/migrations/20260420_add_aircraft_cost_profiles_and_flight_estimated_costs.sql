begin;

create table if not exists public.aircraft_cost_profiles (
  id bigserial primary key,
  aircraft_code text not null,
  effective_date date not null default current_date,
  fixed_hourly_usd numeric(12,2),
  variable_hourly_usd numeric(12,2) not null,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists aircraft_cost_profiles_aircraft_code_idx
  on public.aircraft_cost_profiles (aircraft_code, effective_date desc)
  where is_active = true;

create unique index if not exists aircraft_cost_profiles_aircraft_date_uq
  on public.aircraft_cost_profiles (aircraft_code, effective_date);

alter table public.flights
  add column if not exists estimated_fixed_cost_usd numeric(12,2),
  add column if not exists estimated_variable_cost_usd numeric(12,2),
  add column if not exists estimated_total_cost_usd numeric(12,2),
  add column if not exists estimated_cost_note text,
  add column if not exists estimated_cost_hours numeric(8,2),
  add column if not exists estimated_cost_profile text;

insert into public.aircraft_cost_profiles (
  aircraft_code,
  effective_date,
  fixed_hourly_usd,
  variable_hourly_usd,
  note,
  is_active
)
values
  (
    'PHENOM300E',
    current_date,
    3420,
    2280,
    'Perfil provisional 2026: total 5,700 USD/h dividido 60% fijo y 40% variable.',
    true
  ),
  (
    'N540JL',
    current_date,
    null,
    1958,
    'Costo variable promedio 2024-2025 (1,958 USD/h). Pendiente capturar costo fijo 2026 vigente.',
    true
  )
on conflict do nothing;

commit;
