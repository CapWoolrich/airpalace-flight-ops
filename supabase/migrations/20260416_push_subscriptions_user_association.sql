alter table public.push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);

comment on column public.push_subscriptions.user_id is 'Authenticated user that registered this push endpoint.';
