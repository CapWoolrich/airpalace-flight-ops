# Supabase setup (minimum reproducible baseline)

This project expects the following core tables in `public`:

- `flights`
- `aircraft_status`
- `push_subscriptions`
- `push_notification_events`

## Apply migrations

From repo root:

```bash
supabase db reset
# or in shared envs
supabase db push
```

Migrations are in `supabase/migrations/` and include:

- `20260415_core_ops_repro_baseline.sql`: baseline schema + indexes + RLS policies for `flights` and `aircraft_status`.
- `20260412_add_flight_creator_metadata.sql`: audit metadata columns on `flights`.
- `20260413_add_maintenance_range_columns.sql`: maintenance range columns on `aircraft_status`.
- `20260413_create_push_subscriptions.sql`: push subscription storage and service-role policy.
- `20260413_create_push_notification_events.sql`: dedupe table for scheduled push notifications.

## Required environment variables

Client/runtime:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server API routes:

- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_CONFIRMATION_SECRET` (recommended, for `/api/ai-write` confirmation integrity)

Optional (notifications):

- `CALLMEBOT_PHONE`
- `CALLMEBOT_APIKEY`
- email provider env vars used by `src/server/_emailSender.js`
- web-push env vars used by `src/server/_push.js`
