-- Add itinerary and calendar metadata columns required by multiroute scheduling.
-- Safe / non-destructive migration.

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS itinerary_group_id uuid;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS leg_sequence integer;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS total_legs integer;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS route_summary text;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS calendar_uid text;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS calendar_sequence integer DEFAULT 0;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS block_minutes integer;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS suppress_individual_notifications boolean DEFAULT false;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS updated_notification_sent_at timestamptz;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.flights
ADD COLUMN IF NOT EXISTS cancellation_scope text;

CREATE INDEX IF NOT EXISTS idx_flights_itinerary_group_id
ON public.flights (itinerary_group_id);

CREATE INDEX IF NOT EXISTS idx_flights_calendar_uid
ON public.flights (calendar_uid);

CREATE INDEX IF NOT EXISTS idx_flights_block_minutes
ON public.flights (block_minutes);

CREATE INDEX IF NOT EXISTS idx_flights_suppress_individual_notifications
ON public.flights (suppress_individual_notifications);

NOTIFY pgrst, 'reload schema';
