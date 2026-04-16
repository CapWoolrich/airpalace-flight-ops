import { apTz, calcR, findAP } from "../app/helpers.js";

const DEFAULT_ACTIVE_STATUSES = new Set(["prog", "enc"]);
const DEFAULT_OCCUPANCY_MINUTES = 90;
const DEFAULT_MIN_TURNAROUND_MINUTES = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateIso(value) {
  var raw = String(value || "").trim();
  if (!raw) return null;
  if (DATE_RE.test(raw)) return raw;
  var dashYmd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (dashYmd) {
    var y1 = Number(dashYmd[1]);
    var m1 = Number(dashYmd[2]);
    var d1 = Number(dashYmd[3]);
    var isoYmd = `${y1}-${String(m1).padStart(2, "0")}-${String(d1).padStart(2, "0")}`;
    return DATE_RE.test(isoYmd) ? isoYmd : null;
  }
  var dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!dmy) return null;
  var d = Number(dmy[1]);
  var m = Number(dmy[2]);
  var y = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  var dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseFlexibleTime(value) {
  var raw = String(value || "").trim().replace(/\u00A0/g, " ");
  if (!raw) return null;
  var compact = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  var compactMeridiem = compact.match(/^(\d{1,2}):(\d{2})([ap])m?$/);
  if (compactMeridiem) {
    var hhCompact12 = Number(compactMeridiem[1]);
    var mmCompact12 = Number(compactMeridiem[2]);
    if (!Number.isInteger(hhCompact12) || !Number.isInteger(mmCompact12) || hhCompact12 < 1 || hhCompact12 > 12 || mmCompact12 < 0 || mmCompact12 > 59) return null;
    var compactIsPm = compactMeridiem[3] === "p";
    var compactHh = hhCompact12 % 12;
    if (compactIsPm) compactHh += 12;
    return compactHh * 60 + mmCompact12;
  }
  var hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    var hh24 = Number(hhmm[1]);
    var mm24 = Number(hhmm[2]);
    if (Number.isInteger(hh24) && Number.isInteger(mm24) && hh24 >= 0 && hh24 <= 23 && mm24 >= 0 && mm24 <= 59) return hh24 * 60 + mm24;
  }
  var twelve = raw.match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m?\.?/i);
  if (twelve) {
    var hh12 = Number(twelve[1]);
    var mm12 = Number(twelve[2]);
    if (!Number.isInteger(hh12) || !Number.isInteger(mm12) || hh12 < 1 || hh12 > 12 || mm12 < 0 || mm12 > 59) return null;
    var isPm = String(twelve[3] || "").toLowerCase() === "p";
    var hh = hh12 % 12;
    if (isPm) hh += 12;
    return hh * 60 + mm12;
  }
  return null;
}

function parseTimeToMinutes(value) {
  return parseFlexibleTime(value);
}

function toUtcDayBaseMinutes(dateIso) {
  const normalized = normalizeDateIso(dateIso);
  if (!DATE_RE.test(String(normalized || ""))) return null;
  const [y, m, d] = String(normalized).split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  return Math.floor(Date.UTC(y, m - 1, d, 0, 0, 0, 0) / 60000);
}

function parseIsoDateParts(dateIso) {
  const normalized = normalizeDateIso(dateIso);
  if (!DATE_RE.test(String(normalized || ""))) return null;
  const [y, m, d] = String(normalized).split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  return { y, m, d };
}

function timezoneOffsetMsAtUtc(utcMs, timeZone) {
  if (!Number.isFinite(utcMs) || !timeZone) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(new Date(utcMs));
    const values = {};
    parts.forEach((part) => {
      if (part.type !== "literal") values[part.type] = part.value;
    });
    const y = Number(values.year);
    const m = Number(values.month);
    const d = Number(values.day);
    const hh = Number(values.hour);
    const mm = Number(values.minute);
    const ss = Number(values.second);
    if (![y, m, d, hh, mm, ss].every(Number.isFinite)) return null;
    const asUtcMs = Date.UTC(y, m - 1, d, hh, mm, ss, 0);
    return asUtcMs - utcMs;
  } catch {
    return null;
  }
}

function zonedDateTimeToUtcMs(dateIso, minutesOfDay, timeZone) {
  const parts = parseIsoDateParts(dateIso);
  if (!parts || !Number.isFinite(minutesOfDay)) return null;
  const hh = Math.floor(minutesOfDay / 60);
  const mm = minutesOfDay % 60;
  let utcGuess = Date.UTC(parts.y, parts.m - 1, parts.d, hh, mm, 0, 0);
  const offset1 = timezoneOffsetMsAtUtc(utcGuess, timeZone);
  if (!Number.isFinite(offset1)) return utcGuess;
  utcGuess -= offset1;
  const offset2 = timezoneOffsetMsAtUtc(utcGuess, timeZone);
  if (Number.isFinite(offset2) && offset2 !== offset1) utcGuess += (offset1 - offset2);
  return utcGuess;
}

function airportTimezone(code) {
  var c = String(code || "").toUpperCase().trim();
  if (["MMMD", "MID", "MERIDA", "MÉRIDA"].includes(c)) return "America/Merida";
  if (["MMUN", "CUN", "CANCUN", "CANCÚN", "MMCZ", "CZM"].includes(c)) return "America/Cancun";
  if (["MDPC", "PUJ", "PUNTA CANA", "PUNTA_CANA"].includes(c)) return "America/Santo_Domingo";
  if (["MMTO", "TLC", "MMMX", "MEX"].includes(c)) return "America/Mexico_City";
  if (["KOPF", "OPF", "KFLL", "FLL", "KMIA", "MIA", "KMCO", "MCO"].includes(c)) return "America/New_York";
  var ap = findAP(c) || findAP(String(code || ""));
  if (ap) return apTz(ap);
  if (c.includes("PUNTA") && c.includes("CANA")) return "America/Santo_Domingo";
  if (c.includes("MERIDA") || c.includes("MÉRIDA")) return "America/Merida";
  if (c.includes("CANCUN") || c.includes("CANCÚN") || c.includes("COZUMEL")) return "America/Cancun";
  if (c.includes("MIAMI")) return "America/New_York";
  return null;
}

function findRawUtc(value) {
  if (!value) return null;
  var d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function parseDisplayedArrivalDate(value) {
  var m = String(value || "").match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  var day = Number(m[1]);
  var month = Number(m[2]);
  var year = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : null;
  if (!day || !month) return null;
  return { day, month, year };
}

function localIso(utcIso, timeZone) {
  if (!utcIso || !timeZone) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(utcIso));
  } catch {
    return null;
  }
}

function resolveFlightWindowUtc(flight, occupancyMinutes) {
  var normalizedFlightDate = normalizeDateIso(flight?.date);
  var startRawUtc = findRawUtc(flight?.departure_utc || flight?.dep_utc || flight?.start_utc || flight?.departure_at);
  var endRawUtc = findRawUtc(flight?.arrival_utc || flight?.arr_utc || flight?.end_utc || flight?.arrival_at);
  var depClockMinutes = parseTimeToMinutes(flight?.time);
  var arrRawDisplay = flight?.arrival_time || flight?.arr_time || flight?.eta_time || flight?.eta || "";
  var arrClockMinutes = parseTimeToMinutes(arrRawDisplay);
  var originTz = airportTimezone(flight?.orig);
  var destTz = airportTimezone(flight?.dest) || originTz;
  var dayBase = toUtcDayBaseMinutes(flight?.date);
  var fallbackStartMs = null;
  if (DATE_RE.test(String(normalizedFlightDate || "")) && Number.isFinite(depClockMinutes)) {
    fallbackStartMs = originTz
      ? zonedDateTimeToUtcMs(normalizedFlightDate, depClockMinutes, originTz)
      : (dayBase !== null ? (dayBase + depClockMinutes) * 60000 : null);
  }
  var startUtcMs = startRawUtc ? new Date(startRawUtc).getTime() : fallbackStartMs;
  var endUtcMs = endRawUtc ? new Date(endRawUtc).getTime() : null;
  var triggeredIssue = null;
  var estimatedBlockMinutes = null;
  var routeEstimate = calcR(flight?.orig, flight?.dest, flight?.ac, { m: Number(flight?.pm || 0), w: Number(flight?.pw || 0), c: Number(flight?.pc || 0) }, Number(flight?.bg || 0));
  if (routeEstimate && Number.isFinite(routeEstimate?.bm) && routeEstimate.bm > 0) estimatedBlockMinutes = routeEstimate.bm;

  if (!Number.isFinite(startUtcMs)) {
    return { startUtcMs: null, endUtcMs: null, issue: "timezone_mismatch", reason: "departure_cannot_be_normalized", originTz, destTz, arrRawDisplay };
  }

  if (!Number.isFinite(endUtcMs) && Number.isFinite(arrClockMinutes)) {
    var arrivalDateIso = String(normalizedFlightDate || "");
    var displayedDate = parseDisplayedArrivalDate(arrRawDisplay);
    if (displayedDate && DATE_RE.test(arrivalDateIso)) {
      var depParts = arrivalDateIso.split("-").map(Number);
      var year = displayedDate.year || depParts[0];
      arrivalDateIso = [year, String(displayedDate.month).padStart(2, "0"), String(displayedDate.day).padStart(2, "0")].join("-");
    }
    var arrBase = toUtcDayBaseMinutes(arrivalDateIso);
    var fallbackEndMs = DATE_RE.test(String(arrivalDateIso || ""))
      ? (destTz
        ? zonedDateTimeToUtcMs(arrivalDateIso, arrClockMinutes, destTz)
        : (arrBase !== null ? (arrBase + arrClockMinutes) * 60000 : null))
      : null;
    endUtcMs = fallbackEndMs;
    if (Number.isFinite(endUtcMs) && endUtcMs <= startUtcMs) {
      endUtcMs += 24 * 60 * 60 * 1000;
      triggeredIssue = triggeredIssue || "invalid_chronology";
    }
  }

  if (!Number.isFinite(endUtcMs) && Number.isFinite(estimatedBlockMinutes)) endUtcMs = startUtcMs + estimatedBlockMinutes * 60 * 1000;
  if (!Number.isFinite(endUtcMs)) {
    endUtcMs = startUtcMs + occupancyMinutes * 60 * 1000;
    triggeredIssue = triggeredIssue || "low_confidence_duration_fallback";
  }
  if (String(arrRawDisplay || "").trim() && arrClockMinutes === null) triggeredIssue = triggeredIssue || "display_time_mismatch";
  if (!DATE_RE.test(String(normalizedFlightDate || "")) || depClockMinutes === null) triggeredIssue = triggeredIssue || "timezone_mismatch";
  if (Number.isFinite(startUtcMs) && Number.isFinite(endUtcMs) && endUtcMs <= startUtcMs) triggeredIssue = "invalid_chronology";

  return {
    startUtcMs,
    endUtcMs,
    issue: triggeredIssue,
    reason: triggeredIssue || "ok",
    originTz,
    destTz,
    arrRawDisplay,
    raw: {
      departureStored: flight?.date && flight?.time ? `${flight.date} ${flight.time}` : null,
      departureUtcStored: startRawUtc,
      arrivalStored: String(arrRawDisplay || "") || null,
      arrivalUtcStored: endRawUtc,
    },
    parsedUtc: {
      departure: new Date(startUtcMs).toISOString(),
      arrival: new Date(endUtcMs).toISOString(),
    },
    displayedLocal: {
      departure: localIso(new Date(startUtcMs).toISOString(), originTz),
      arrival: localIso(new Date(endUtcMs).toISOString(), destTz),
    },
  };
}

function toIsoUtcMinuteString(minutes) {
  if (!Number.isFinite(minutes)) return null;
  return new Date(minutes * 60000).toISOString();
}
function toIsoUtcMsString(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
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
    const normalized = resolveFlightWindowUtc(flight, occupancyMinutes);
    const start = Number.isFinite(normalized.startUtcMs) ? Math.floor(normalized.startUtcMs / 60000) : null;
    const end = Number.isFinite(normalized.endUtcMs) ? Math.floor(normalized.endUtcMs / 60000) : null;

    if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end)) {
      conflicts.push(buildConflict({
        type: "timezone_mismatch",
        severity: "warning",
        flight,
        conflictingFlight: null,
        resourceType: "time_data",
        resourceLabel: flight?.ac || "schedule",
        message: `${flightLabel(flight)} cannot be normalized to canonical UTC timestamps.`,
        details: {
          startA: start === null ? null : toIsoUtcMinuteString(start),
          endA: end === null ? null : toIsoUtcMinuteString(end),
          startB: null,
          endB: null,
          overlapMinutes: 0,
          airportMismatch: false,
          reason: normalized.reason,
          rawTimestamps: normalized.raw || null,
          parsedUtc: normalized.parsedUtc || null,
          displayedLocal: normalized.displayedLocal || null,
        },
        suggestedFix: "Validate airport timezone mapping and ensure departure/arrival can be parsed to UTC.",
      }));
      debugLog(debugEnabled, { rawStoredTimestamp: normalized.raw, parsedUtcTimestamp: normalized.parsedUtc, displayedLocalTimestamp: normalized.displayedLocal, conflictRuleTriggered: "timezone_mismatch", flight: flightIdentity(flight) });
      return;
    }

    if (normalized.issue === "invalid_chronology") {
      conflicts.push(buildConflict({
        type: "invalid_chronology",
        severity: "warning",
        flight,
        conflictingFlight: null,
        resourceType: "time_data",
        resourceLabel: flight?.ac || "schedule",
        message: "Time data issue detected: arrival appears earlier than departure. Check AM/PM or timezone conversion.",
        details: {
          startA: toIsoUtcMsString(normalized.startUtcMs),
          endA: toIsoUtcMsString(normalized.endUtcMs),
          startB: null,
          endB: null,
          overlapMinutes: 0,
          airportMismatch: false,
          reason: normalized.reason,
          rawTimestamps: normalized.raw || null,
          parsedUtc: normalized.parsedUtc || null,
          displayedLocal: normalized.displayedLocal || null,
        },
        suggestedFix: "Correct displayed AM/PM/date fields or source timezone conversion so chronology is valid.",
      }));
      debugLog(debugEnabled, { rawStoredTimestamp: normalized.raw, parsedUtcTimestamp: normalized.parsedUtc, displayedLocalTimestamp: normalized.displayedLocal, conflictRuleTriggered: "invalid_chronology", flight: flightIdentity(flight) });
    }
    if (normalized.issue === "display_time_mismatch") {
      conflicts.push(buildConflict({
        type: "display_time_mismatch",
        severity: "warning",
        flight,
        conflictingFlight: null,
        resourceType: "time_data",
        resourceLabel: flight?.ac || "schedule",
        message: `${flightLabel(flight)} has display time values that are not parseable into canonical UTC.`,
        details: {
          startA: toIsoUtcMsString(normalized.startUtcMs),
          endA: toIsoUtcMsString(normalized.endUtcMs),
          startB: null,
          endB: null,
          overlapMinutes: 0,
          airportMismatch: false,
          reason: normalized.reason,
          rawTimestamps: normalized.raw || null,
          parsedUtc: normalized.parsedUtc || null,
          displayedLocal: normalized.displayedLocal || null,
        },
        suggestedFix: "Store HH:mm (24h) or full UTC timestamps for arrivals/departures; avoid localized display strings in data fields.",
      }));
      debugLog(debugEnabled, { rawStoredTimestamp: normalized.raw, parsedUtcTimestamp: normalized.parsedUtc, displayedLocalTimestamp: normalized.displayedLocal, conflictRuleTriggered: "display_time_mismatch", flight: flightIdentity(flight) });
    }
    if (normalized.issue === "low_confidence_duration_fallback") {
      conflicts.push(buildConflict({
        type: "sequence_uncertain_due_to_low_confidence_duration",
        severity: "warning",
        flight,
        conflictingFlight: null,
        resourceType: "time_data",
        resourceLabel: flight?.ac || "schedule",
        message: `${flightLabel(flight)} required a low-confidence duration fallback because no canonical/ETA/route duration was available.`,
        details: {
          startA: toIsoUtcMsString(normalized.startUtcMs),
          endA: toIsoUtcMsString(normalized.endUtcMs),
          startB: null,
          endB: null,
          overlapMinutes: 0,
          airportMismatch: false,
          reason: normalized.reason,
          rawTimestamps: normalized.raw || null,
          parsedUtc: normalized.parsedUtc || null,
          displayedLocal: normalized.displayedLocal || null,
        },
        suggestedFix: "Provide canonical arrival UTC, a parseable ETA, or enough route data to derive block time.",
      }));
      debugLog(debugEnabled, { rawStoredTimestamp: normalized.raw, parsedUtcTimestamp: normalized.parsedUtc, displayedLocalTimestamp: normalized.displayedLocal, conflictRuleTriggered: "low_confidence_duration_fallback", flight: flightIdentity(flight) });
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
      const aNorm = resolveFlightWindowUtc(a, occupancyMinutes);
      const bNorm = resolveFlightWindowUtc(b, occupancyMinutes);
      const aStart = Number.isFinite(aNorm.startUtcMs) ? Math.floor(aNorm.startUtcMs / 60000) : null;
      const bStart = Number.isFinite(bNorm.startUtcMs) ? Math.floor(bNorm.startUtcMs / 60000) : null;
      if (aStart === null || bStart === null) continue;
      const aEnd = Number.isFinite(aNorm.endUtcMs) ? Math.floor(aNorm.endUtcMs / 60000) : null;
      const bEnd = Number.isFinite(bNorm.endUtcMs) ? Math.floor(bNorm.endUtcMs / 60000) : null;
      if (aEnd === null || bEnd === null) continue;
      if (["invalid_chronology", "timezone_mismatch", "display_time_mismatch", "low_confidence_duration_fallback"].includes(aNorm.issue) || ["invalid_chronology", "timezone_mismatch", "display_time_mismatch", "low_confidence_duration_fallback"].includes(bNorm.issue)) {
        continue;
      }

      const sameAircraft = a?.ac && a.ac === b?.ac;
      const pilotFieldCandidates = ["pic", "sic", "crew", "pilot_id", "assigned_pilot"];
      const resolvePilotToken = (flight) => {
        for (let idx = 0; idx < pilotFieldCandidates.length; idx += 1) {
          const value = String(flight?.[pilotFieldCandidates[idx]] || "").trim();
          if (value) return value.toLowerCase();
        }
        return "";
      };
      const aPilot = resolvePilotToken(a);
      const bPilot = resolvePilotToken(b);
      const samePilot = Boolean(aPilot && bPilot && aPilot === bPilot);
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

      }
    }
  }

  const locationMismatchPairs = new Set();
  const uncertainSequencePairs = new Set();
  const flightsByAircraft = new Map();
  filtered.forEach((flight) => {
    const ac = String(flight?.ac || "").trim();
    if (!ac) return;
    if (!flightsByAircraft.has(ac)) flightsByAircraft.set(ac, []);
    flightsByAircraft.get(ac).push(flight);
  });

  flightsByAircraft.forEach((aircraftFlights, ac) => {
    const sequenced = aircraftFlights
      .map((flight) => {
        const normalized = resolveFlightWindowUtc(flight, occupancyMinutes);
        const start = Number.isFinite(normalized.startUtcMs) ? Math.floor(normalized.startUtcMs / 60000) : null;
        const end = Number.isFinite(normalized.endUtcMs) ? Math.floor(normalized.endUtcMs / 60000) : null;
        return { flight, normalized, start, end };
      })
      .filter(({ start, end, normalized }) => (
        start !== null
        && end !== null
        && Number.isFinite(start)
        && Number.isFinite(end)
        && !["invalid_chronology", "timezone_mismatch", "display_time_mismatch", "low_confidence_duration_fallback"].includes(normalized.issue)
      ))
      .sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        if (a.end !== b.end) return a.end - b.end;
        return String(a.flight?.id || "").localeCompare(String(b.flight?.id || ""));
      });

    for (let idx = 0; idx < sequenced.length - 1; idx += 1) {
      const first = sequenced[idx];
      const second = sequenced[idx + 1];
      const gap = second.start - first.end;
      const firstDest = String(first.flight?.dest || "");
      const secondOrig = String(second.flight?.orig || "");
      if (gap < minTurnaroundMinutes || !firstDest || !secondOrig || firstDest === secondOrig) continue;

      const pairKey = `${flightIdentity(first.flight)}->${flightIdentity(second.flight)}`;

      const unparseableConnector = aircraftFlights.find((candidate) => {
        if (!candidate || candidate === first.flight || candidate === second.flight) return false;
        if (String(candidate?.orig || "") !== firstDest || String(candidate?.dest || "") !== secondOrig) return false;
        const candidateNorm = resolveFlightWindowUtc(candidate, occupancyMinutes);
        const candidateStart = Number.isFinite(candidateNorm.startUtcMs) ? Math.floor(candidateNorm.startUtcMs / 60000) : null;
        const candidateEnd = Number.isFinite(candidateNorm.endUtcMs) ? Math.floor(candidateNorm.endUtcMs / 60000) : null;
        const invalidTimeWindow = (
          candidateStart === null
          || candidateEnd === null
          || !Number.isFinite(candidateStart)
          || !Number.isFinite(candidateEnd)
          || ["invalid_chronology", "timezone_mismatch", "display_time_mismatch", "low_confidence_duration_fallback"].includes(candidateNorm.issue)
        );
        return invalidTimeWindow;
      });

      if (unparseableConnector) {
        if (uncertainSequencePairs.has(pairKey)) continue;
        uncertainSequencePairs.add(pairKey);
        conflicts.push(buildConflict({
          type: "sequence_uncertain_due_to_unparseable_intermediate_leg",
          severity: "warning",
          flight: first.flight,
          conflictingFlight: second.flight,
          resourceType: "schedule",
          resourceLabel: String(ac || "Unknown aircraft"),
          message: `Sequence is uncertain because an intermediate leg (${flightLabel(unparseableConnector)}) connecting ${firstDest} -> ${secondOrig} could not be normalized in time.`,
          details: {
            startA: toIsoUtcMinuteString(first.start),
            endA: toIsoUtcMinuteString(first.end),
            startB: toIsoUtcMinuteString(second.start),
            endB: toIsoUtcMinuteString(second.end),
            overlapMinutes: 0,
            airportMismatch: false,
            intermediateFlightId: String(unparseableConnector?.id || ""),
          },
          suggestedFix: "Correct date/time fields for the intermediate leg so aircraft sequence can be validated with certainty.",
        }));
        debugLog(debugEnabled, { reason: "sequence_uncertain_due_to_unparseable_intermediate_leg", a: flightIdentity(first.flight), b: flightIdentity(second.flight), intermediate: flightIdentity(unparseableConnector) });
        continue;
      }

      if (locationMismatchPairs.has(pairKey)) continue;
      locationMismatchPairs.add(pairKey);

      conflicts.push(buildConflict({
        type: "location_mismatch",
        severity: "critical",
        flight: first.flight,
        conflictingFlight: second.flight,
        resourceType: "airport",
        resourceLabel: String(ac || "Unknown aircraft"),
        message: `The aircraft arrives at ${firstDest} but the chronologically next flight departs from ${secondOrig} with no repositioning leg in between.`,
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
      debugLog(debugEnabled, { reason: "location_mismatch", a: flightIdentity(first.flight), b: flightIdentity(second.flight), dest: firstDest, orig: secondOrig });
    }
  });

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
