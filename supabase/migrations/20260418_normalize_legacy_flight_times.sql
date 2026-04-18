-- Optional data cleanup for legacy time formats in public.flights.time
-- Normalizes only patterns that are unambiguous into canonical HH24:MI.

-- 1) Trim spaces/non-breaking spaces first.
update public.flights
set time = trim(replace(time, E'\u00A0', ' '))
where time is not null
  and time <> trim(replace(time, E'\u00A0', ' '));

-- 2) HH24:MI:SS -> HH24:MI
update public.flights
set time = to_char(to_timestamp(time, 'HH24:MI:SS'), 'HH24:MI')
where time ~ '^[0-2]?\d:[0-5]\d:[0-5]\d$';

-- 3) H[H].MM am/pm or H[H]:MM am/pm -> HH24:MI
update public.flights
set time = to_char(
  to_timestamp(
    regexp_replace(lower(replace(time, '.', ':')), '^\s*([0-1]?\d)(?::([0-5]\d))?\s*([ap])m?\s*$', '\1:' || coalesce(nullif(regexp_replace(lower(replace(time, '.', ':')), '^\s*([0-1]?\d)(?::([0-5]\d))?\s*([ap])m?\s*$', '\2'), ''), '00') || ' \3m'),
    'HH12:MI am'
  ),
  'HH24:MI'
)
where lower(replace(time, '.', ':')) ~ '^\s*([0-1]?\d)(?::([0-5]\d))?\s*[ap]m?\s*$';

-- 4) 0700 -> 07:00
update public.flights
set time = substring(time from 1 for 2) || ':' || substring(time from 3 for 2)
where regexp_replace(time, '\s+', '', 'g') ~ '^[0-2]\d[0-5]\d$'
  and time = regexp_replace(time, '\s+', '', 'g');

-- 5) 7 or 07 -> 07:00
update public.flights
set time = lpad(time, 2, '0') || ':00'
where time ~ '^\d{1,2}$'
  and cast(time as int) between 0 and 23;

-- 6) Ensure canonical zero-padded HH:mm (e.g., 7:00 -> 07:00)
update public.flights
set time = lpad(split_part(time, ':', 1), 2, '0') || ':' || split_part(time, ':', 2)
where time ~ '^([0-1]?\d|2[0-3]):[0-5]\d$';

-- Verification helper:
-- select id, date, orig, dest, time
-- from public.flights
-- where upper(time) <> 'STBY'
--   and time !~ '^([0-1]\d|2[0-3]):[0-5]\d$';
