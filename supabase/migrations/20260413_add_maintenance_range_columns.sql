alter table public.aircraft_status
  add column if not exists maintenance_start_date date,
  add column if not exists maintenance_end_date date;
