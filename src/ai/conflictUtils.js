const DEFAULT_ACTIVE_STATUSES = new Set(["prog", "enc"]);
const DEFAULT_OCCUPANCY_MINUTES = 90;

function parseTimeToMinutes(value) {
  const m = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function flightStartMinutes(flight) {
  const startMinutes = parseTimeToMinutes(flight?.time);
  if (!flight?.date || startMinutes === null) return null;
  const base = Date.parse(`${flight.date}T00:00:00Z`);
  if (!Number.isFinite(base)) return null;
  return Math.floor(base / 60000) + startMinutes;
}

function flightEndMinutes(flight, start, occupancyMinutes) {
  const knownArrival = parseTimeToMinutes(
    flight?.arrival_time || flight?.arr_time || flight?.eta_time || flight?.eta
  );
  if (knownArrival !== null && flight?.date) {
    const base = Math.floor(Date.parse(`${flight.date}T00:00:00Z`) / 60000);
    const candidate = base + knownArrival;
    if (candidate > start) return candidate;
    return candidate + 24 * 60;
  }
  return start + occupancyMinutes;
}

function overlaps(a, b, occupancyMinutes) {
  if (!a?.ac || a.ac !== b?.ac) return false;
  const aStart = flightStartMinutes(a);
  const bStart = flightStartMinutes(b);
  if (aStart === null || bStart === null) return false;
  const aEnd = flightEndMinutes(a, aStart, occupancyMinutes);
  const bEnd = flightEndMinutes(b, bStart, occupancyMinutes);
  return aStart < bEnd && bStart < aEnd;
}

export function detectFlightConflicts(flights, options = {}) {
  const activeStatuses = new Set((options.activeStatuses || Array.from(DEFAULT_ACTIVE_STATUSES)).map((s) => String(s || "").toLowerCase()));
  const occupancyMinutes = Number(options.occupancyMinutes || DEFAULT_OCCUPANCY_MINUTES);
  const range = options.dateRange || null;
  const active = (flights || []).filter((f) => activeStatuses.has(String(f.st || "").toLowerCase()));
  const filtered = range?.start && range?.end
    ? active.filter((f) => f.date >= range.start && f.date <= range.end)
    : active;

  const conflicts = [];
  for (let i = 0; i < filtered.length; i += 1) {
    for (let j = i + 1; j < filtered.length; j += 1) {
      const a = filtered[i];
      const b = filtered[j];
      if (!overlaps(a, b, occupancyMinutes)) continue;
      conflicts.push({ ac: a.ac, flights: [a, b] });
    }
  }
  return conflicts;
}

export function uniqueFlightsFromConflicts(conflicts) {
  const seen = new Set();
  const unique = [];
  (conflicts || []).forEach((conflict) => {
    (conflict.flights || []).forEach((flight) => {
      const key = String(flight?.id || `${flight?.ac}|${flight?.date}|${flight?.time}|${flight?.orig}|${flight?.dest}`);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(flight);
    });
  });
  return unique;
}
