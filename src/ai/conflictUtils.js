const DEFAULT_ACTIVE_STATUSES = new Set(["prog", "enc"]);
const DEFAULT_OCCUPANCY_MINUTES = 90;
const DEFAULT_MIN_TURNAROUND_MINUTES = 30;

function parseTimeToMinutes(value) {
  const m = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function toUtcDayBaseMinutes(dateIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ""))) return null;
  const [y, m, d] = String(dateIso).split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  return Math.floor(Date.UTC(y, m - 1, d, 0, 0, 0, 0) / 60000);
}

function flightStartMinutes(flight) {
  const startMinutes = parseTimeToMinutes(flight?.time);
  const dayBase = toUtcDayBaseMinutes(flight?.date);
  if (startMinutes === null || dayBase === null) return null;
  return dayBase + startMinutes;
}

function flightEndMinutes(flight, start, occupancyMinutes) {
  const knownArrival = parseTimeToMinutes(
    flight?.arrival_time || flight?.arr_time || flight?.eta_time || flight?.eta,
  );
  if (knownArrival !== null && flight?.date) {
    const base = toUtcDayBaseMinutes(flight.date);
    if (base === null) return start + occupancyMinutes;
    const candidate = base + knownArrival;
    if (candidate > start) return candidate;
    return candidate + 24 * 60;
  }
  return start + occupancyMinutes;
}

function toIsoUtcMinuteString(minutes) {
  if (!Number.isFinite(minutes)) return null;
  return new Date(minutes * 60000).toISOString();
}

function formatClock(isoString) {
  if (!isoString) return "hora desconocida";
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return "hora desconocida";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function overlapWindow(aStart, aEnd, bStart, bEnd) {
  const overlapStart = Math.max(aStart, bStart);
  const overlapEnd = Math.min(aEnd, bEnd);
  return overlapStart < overlapEnd
    ? { hasOverlap: true, overlapStart, overlapEnd, overlapMinutes: overlapEnd - overlapStart }
    : { hasOverlap: false, overlapStart: null, overlapEnd: null, overlapMinutes: 0 };
}

function flightIdentity(flight) {
  return (
    flight?.id
    || `${flight?.ac || "UNK"}|${flight?.date || "date?"}|${flight?.time || "time?"}|${flight?.orig || "orig?"}|${flight?.dest || "dest?"}`
  );
}

function flightLabel(flight) {
  const id = flight?.id || "sin-id";
  return `Flight ${id}`;
}

function shouldLogDebug(options) {
  if (typeof options.debug === "boolean") return options.debug;
  if (typeof globalThis?.process !== "undefined") {
    return globalThis.process.env?.NODE_ENV !== "production";
  }
  return false;
}

function debugLog(enabled, payload) {
  if (!enabled) return;
  console.debug("[conflict-engine]", payload);
}

function buildConflict({
  type,
  severity,
  flight,
  conflictingFlight,
  resourceType,
  resourceLabel,
  message,
  details,
  suggestedFix,
}) {
  return {
    type,
    severity,
    flightId: String(flight?.id || ""),
    conflictingFlightId: conflictingFlight ? String(conflictingFlight?.id || "") : "",
    resourceType,
    resourceLabel,
    message,
    details,
    suggestedFix,
    flights: [flight, conflictingFlight].filter(Boolean),
    ac: flight?.ac || conflictingFlight?.ac || resourceLabel,
  };
}

export function detectFlightConflicts(flights, options = {}) {
  const debugEnabled = shouldLogDebug(options);
  const activeStatuses = new Set((options.activeStatuses || Array.from(DEFAULT_ACTIVE_STATUSES)).map((s) => String(s || "").toLowerCase()));
  const occupancyMinutes = Number(options.occupancyMinutes || DEFAULT_OCCUPANCY_MINUTES);
  const minTurnaroundMinutes = Number(options.minTurnaroundMinutes || DEFAULT_MIN_TURNAROUND_MINUTES);
  const range = options.dateRange || null;
  const active = (flights || []).filter((f) => activeStatuses.has(String(f.st || "").toLowerCase()));
  const filtered = range?.start && range?.end
    ? active.filter((f) => f.date >= range.start && f.date <= range.end)
    : active;

  const conflicts = [];
  const blockedAircraft = new Set((options.blockedAircraft || []).map((x) => String(x).toUpperCase()));

  filtered.forEach((flight) => {
    const start = flightStartMinutes(flight);
    const end = start === null ? null : flightEndMinutes(flight, start, occupancyMinutes);

    if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end)) {
      conflicts.push(buildConflict({
        type: "timezone_error",
        severity: "warning",
        flight,
        conflictingFlight: null,
        resourceType: "schedule",
        resourceLabel: flight?.ac || "schedule",
        message: `${flightLabel(flight)} has invalid date/time fields and can produce false conflict results.`,
        details: {
          startA: start === null ? null : toIsoUtcMinuteString(start),
          endA: end === null ? null : toIsoUtcMinuteString(end),
          startB: null,
          endB: null,
          overlapMinutes: 0,
          airportMismatch: false,
        },
        suggestedFix: "Normalize date/time fields to YYYY-MM-DD and HH:mm in UTC before conflict evaluation.",
      }));
      debugLog(debugEnabled, { reason: "timezone_error", flight: flightIdentity(flight) });
      return;
    }

    if (blockedAircraft.has(String(flight?.ac || "").toUpperCase())) {
      conflicts.push(buildConflict({
        type: "blocked_resource",
        severity: "critical",
        flight,
        conflictingFlight: null,
        resourceType: "aircraft",
        resourceLabel: String(flight?.ac || "Unknown aircraft"),
        message: `Aircraft ${flight?.ac || "Unknown"} is blocked/unavailable and cannot be assigned to ${flightLabel(flight)}.`,
        details: {
          startA: toIsoUtcMinuteString(start),
          endA: toIsoUtcMinuteString(end),
          startB: null,
          endB: null,
          overlapMinutes: 0,
          airportMismatch: false,
        },
        suggestedFix: "Reassign aircraft or clear the blocked status before departure.",
      }));
      debugLog(debugEnabled, { reason: "blocked_resource", flight: flightIdentity(flight), ac: flight?.ac });
    }
  });

  for (let i = 0; i < filtered.length; i += 1) {
    for (let j = i + 1; j < filtered.length; j += 1) {
      const a = filtered[i];
      const b = filtered[j];
      const aStart = flightStartMinutes(a);
      const bStart = flightStartMinutes(b);
      if (aStart === null || bStart === null) continue;
      const aEnd = flightEndMinutes(a, aStart, occupancyMinutes);
      const bEnd = flightEndMinutes(b, bStart, occupancyMinutes);

      const sameAircraft = a?.ac && a.ac === b?.ac;
      const samePilot = a?.rb && b?.rb && String(a.rb).trim().toLowerCase() === String(b.rb).trim().toLowerCase();
      const overlap = overlapWindow(aStart, aEnd, bStart, bEnd);

      if (sameAircraft && overlap.hasOverlap) {
        conflicts.push(buildConflict({
          type: "aircraft_overlap",
          severity: "critical",
          flight: a,
          conflictingFlight: b,
          resourceType: "aircraft",
          resourceLabel: String(a.ac || "Unknown aircraft"),
          message: `Aircraft ${a.ac} is already assigned to another flight from ${formatClock(toIsoUtcMinuteString(overlap.overlapStart))} to ${formatClock(toIsoUtcMinuteString(overlap.overlapEnd))}.`,
          details: {
            startA: toIsoUtcMinuteString(aStart),
            endA: toIsoUtcMinuteString(aEnd),
            startB: toIsoUtcMinuteString(bStart),
            endB: toIsoUtcMinuteString(bEnd),
            overlapMinutes: overlap.overlapMinutes,
            airportMismatch: false,
          },
          suggestedFix: "Change departure time or reassign aircraft to eliminate the overlap.",
        }));
        debugLog(debugEnabled, { reason: "aircraft_overlap", a: flightIdentity(a), b: flightIdentity(b), overlapMinutes: overlap.overlapMinutes });
      }

      if (samePilot && overlap.hasOverlap) {
        conflicts.push(buildConflict({
          type: "pilot_overlap",
          severity: "critical",
          flight: a,
          conflictingFlight: b,
          resourceType: "pilot",
          resourceLabel: String(a.rb || "Unassigned pilot"),
          message: `Pilot ${a.rb} is overlapping with ${flightLabel(b)} by ${overlap.overlapMinutes} minutes.`,
          details: {
            startA: toIsoUtcMinuteString(aStart),
            endA: toIsoUtcMinuteString(aEnd),
            startB: toIsoUtcMinuteString(bStart),
            endB: toIsoUtcMinuteString(bEnd),
            overlapMinutes: overlap.overlapMinutes,
            airportMismatch: false,
          },
          suggestedFix: "Reassign pilot or move one departure time to remove the overlap.",
        }));
        debugLog(debugEnabled, { reason: "pilot_overlap", a: flightIdentity(a), b: flightIdentity(b), overlapMinutes: overlap.overlapMinutes });
      }

      if (sameAircraft) {
        const first = aStart <= bStart ? { f: a, start: aStart, end: aEnd } : { f: b, start: bStart, end: bEnd };
        const second = first.f === a ? { f: b, start: bStart, end: bEnd } : { f: a, start: aStart, end: aEnd };
        const gap = second.start - first.end;

        if (gap >= 0 && gap < minTurnaroundMinutes) {
          conflicts.push(buildConflict({
            type: "turnaround_insufficient",
            severity: "warning",
            flight: first.f,
            conflictingFlight: second.f,
            resourceType: "schedule",
            resourceLabel: String(first.f?.ac || "Unknown aircraft"),
            message: `Minimum turnaround time of ${minTurnaroundMinutes} minutes is not met. Current gap: ${gap} minutes.`,
            details: {
              startA: toIsoUtcMinuteString(first.start),
              endA: toIsoUtcMinuteString(first.end),
              startB: toIsoUtcMinuteString(second.start),
              endB: toIsoUtcMinuteString(second.end),
              overlapMinutes: 0,
              airportMismatch: false,
            },
            suggestedFix: "Increase turnaround gap or assign a different aircraft for the next leg.",
          }));
          debugLog(debugEnabled, { reason: "turnaround_insufficient", a: flightIdentity(first.f), b: flightIdentity(second.f), gap });
        }

        if (gap >= minTurnaroundMinutes && String(first.f?.dest || "") && String(second.f?.orig || "") && String(first.f.dest) !== String(second.f.orig)) {
          conflicts.push(buildConflict({
            type: "location_mismatch",
            severity: "critical",
            flight: first.f,
            conflictingFlight: second.f,
            resourceType: "airport",
            resourceLabel: String(first.f?.ac || "Unknown aircraft"),
            message: `The aircraft arrives at ${first.f.dest} but the next flight departs from ${second.f.orig} with no repositioning leg.`,
            details: {
              startA: toIsoUtcMinuteString(first.start),
              endA: toIsoUtcMinuteString(first.end),
              startB: toIsoUtcMinuteString(second.start),
              endB: toIsoUtcMinuteString(second.end),
              overlapMinutes: 0,
              airportMismatch: true,
            },
            suggestedFix: "Add a repositioning leg or reassign aircraft so departure airport matches arrival airport.",
          }));
          debugLog(debugEnabled, { reason: "location_mismatch", a: flightIdentity(first.f), b: flightIdentity(second.f), dest: first.f?.dest, orig: second.f?.orig });
        }
      }
    }
  }

  return conflicts;
}

export function uniqueFlightsFromConflicts(conflicts) {
  const seen = new Set();
  const unique = [];
  (conflicts || []).forEach((conflict) => {
    const pairFlights = Array.isArray(conflict?.flights) && conflict.flights.length
      ? conflict.flights
      : [conflict?.flight, conflict?.conflictingFlight].filter(Boolean);
    pairFlights.forEach((flight) => {
      const key = String(flight?.id || `${flight?.ac}|${flight?.date}|${flight?.time}|${flight?.orig}|${flight?.dest}`);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(flight);
    });
  });
  return unique;
}
