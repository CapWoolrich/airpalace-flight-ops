create table if not exists public.push_notification_events (
  event_key text primary key,
  created_at timestamptz not null default now()
);

alter table public.push_notification_events enable row level security;

create policy "service role can manage push notification events"
on public.push_notification_events
as permissive
for all
to service_role
using (true)
with check (true);
