create table if not exists public.requester_email_recipients (
  id uuid primary key default gen_random_uuid(),
  requester_key text not null unique,
  display_name text not null,
  requester_email text not null,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.requester_email_recipients enable row level security;

insert into public.requester_email_recipients (requester_key, display_name, requester_email, active)
values
  ('jabib_c', 'Jabib C', 'jachapur@thepalacecompany.com', true),
  ('omar_c', 'Omar C', 'ochapur@thepalacecompany.com', true),
  ('gibran_c', 'Gibran C', 'gchapur@thepalacecompany.com', true),
  ('jose_c', 'Jose C', 'jchapur@thepalacecompany.com', true)
on conflict (requester_key) do update
set
  display_name = excluded.display_name,
  requester_email = excluded.requester_email,
  active = excluded.active,
  updated_at = now();
