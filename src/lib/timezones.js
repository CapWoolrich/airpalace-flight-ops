import { APR } from "../app/data.js";
import { findAirportByAny } from "./airports.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATIC_AMERICA_FALLBACK = [
  "America/Anchorage","America/Araguaina","America/Argentina/Buenos_Aires","America/Asuncion","America/Bogota","America/Cancun","America/Caracas","America/Cayman","America/Chicago","America/Costa_Rica","America/Curacao","America/Denver","America/Detroit","America/Edmonton","America/El_Salvador","America/Grand_Turk","America/Guatemala","America/Halifax","America/Havana","America/Jamaica","America/La_Paz","America/Lima","America/Los_Angeles","America/Managua","America/Merida","America/Mexico_City","America/Monterrey","America/Montevideo","America/Nassau","America/New_York","America/Panama","America/Phoenix","America/Puerto_Rico","America/Santiago","America/Santo_Domingo","America/Sao_Paulo","America/Tegucigalpa","America/Tijuana","America/Toronto","America/Vancouver"
];

function getAmericaZones() {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone").filter((z) => String(z).startsWith("America/"));
      if (zones.length) return zones;
    }
  } catch {}
  return STATIC_AMERICA_FALLBACK;
}

export const AMERICA_IANA_TIMEZONES = getAmericaZones();

const COUNTRY_DEFAULT_TIMEZONE = {
  MX: "America/Mexico_City",
  US: "America/New_York",
  DO: "America/Santo_Domingo",
  TC: "America/Grand_Turk",
  KY: "America/Cayman",
  JM: "America/Jamaica",
  BS: "America/Nassau",
  CU: "America/Havana",
  PR: "America/Puerto_Rico",
  AW: "America/Aruba",
  CW: "America/Curacao",
  GT: "America/Guatemala",
  BZ: "America/Belize",
  SV: "America/El_Salvador",
  HN: "America/Tegucigalpa",
  NI: "America/Managua",
  CR: "America/Costa_Rica",
  PA: "America/Panama",
  CO: "America/Bogota",
  VE: "America/Caracas",
  PE: "America/Lima",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
};

const TIMEZONE_ALIASES = {
  MMMD: "America/Merida", MID: "America/Merida", MERIDA: "America/Merida", "MÉRIDA": "America/Merida",
  MMUN: "America/Cancun", CUN: "America/Cancun", CANCUN: "America/Cancun", "CANCÚN": "America/Cancun",
  MMCZ: "America/Cancun", CZM: "America/Cancun", COZUMEL: "America/Cancun",
  MMTO: "America/Mexico_City", TLC: "America/Mexico_City", MMMX: "America/Mexico_City", MEX: "America/Mexico_City",
  MDPC: "America/Santo_Domingo", PUJ: "America/Santo_Domingo", "PUNTA CANA": "America/Santo_Domingo", PUNTA_CANA: "America/Santo_Domingo",
  KMIA: "America/New_York", MIA: "America/New_York", KOPF: "America/New_York", OPF: "America/New_York", KFLL: "America/New_York", FLL: "America/New_York", KMCO: "America/New_York", MCO: "America/New_York",
};

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

function normalizeTimeRaw(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .trim();
}

export function findAirport(value) {
  const code = normalizeCode(value);
  if (!code) return null;
  return findAirportByAny(code) || APR.find((x) => x.c === code || x.i4 === code || x.i3 === code || normalizeCode(x.c) === code) || null;
}

export function airportTimezoneFromAirport(ap) {
  if (!ap) return null;
  const i4 = normalizeCode(ap.i4);
  const i3 = normalizeCode(ap.i3);
  const city = normalizeCode(ap.c);
  return TIMEZONE_ALIASES[i4]
    || TIMEZONE_ALIASES[i3]
    || TIMEZONE_ALIASES[city]
    || COUNTRY_DEFAULT_TIMEZONE[String(ap.co || "").toUpperCase()]
    || null;
}

export function resolveAirportTimezone(value, options = {}) {
  const raw = String(value || "").trim();
  const key = normalizeCode(raw);
  const fallbackTimeZone = options.fallbackTimeZone || null;

  if (TIMEZONE_ALIASES[key]) return { timeZone: TIMEZONE_ALIASES[key], source: "alias", warning: null };
  const ap = findAirport(raw);
  if (ap) {
    const mapped = airportTimezoneFromAirport(ap);
    if (mapped) return { timeZone: mapped, source: "airport", warning: null };
  }

  if (key.includes("PUNTA") && key.includes("CANA")) return { timeZone: "America/Santo_Domingo", source: "name", warning: null };
  if (key.includes("MERIDA") || key.includes("MÉRIDA")) return { timeZone: "America/Merida", source: "name", warning: null };
  if (key.includes("CANCUN") || key.includes("CANCÚN") || key.includes("COZUMEL")) return { timeZone: "America/Cancun", source: "name", warning: null };

  if (fallbackTimeZone) {
    return {
      timeZone: fallbackTimeZone,
      source: "fallback",
      warning: `timezone_fallback_used:${raw || "unknown_airport"}`,
    };
  }

  return { timeZone: null, source: "unknown", warning: `timezone_unresolved:${raw || "unknown_airport"}` };
}

export function normalizeDateIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (DATE_RE.test(raw)) return raw;
  const dashYmd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (dashYmd) {
    const y = Number(dashYmd[1]);
    const m = Number(dashYmd[2]);
    const d = Number(dashYmd[3]);
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return DATE_RE.test(iso) ? iso : null;
  }
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!dmy) return null;
  const d = Number(dmy[1]);
  const m = Number(dmy[2]);
  const y = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseTimeToMinutes(value) {
  const result = parseTimeToMinutesDetailed(value);
  return Number.isFinite(result.minutes) ? result.minutes : null;
}

function isValidMinutePair(hours, minutes) {
  return Number.isInteger(hours) && Number.isInteger(minutes)
    && hours >= 0
    && hours <= 23
    && minutes >= 0
    && minutes <= 59;
}

function normalize12Hour(h12, minutes, meridiem) {
  if (!Number.isInteger(h12) || !Number.isInteger(minutes)) return null;
  if (h12 < 1 || h12 > 12 || minutes < 0 || minutes > 59) return null;
  const pm = String(meridiem || "").toLowerCase() === "p";
  return (h12 % 12 + (pm ? 12 : 0)) * 60 + minutes;
}

export function parseTimeToMinutesDetailed(value) {
  const raw = normalizeTimeRaw(value);
  if (!raw) return { minutes: null, reason: "missing_departure_time" };
  if (raw.toUpperCase() === "STBY") return { minutes: null, reason: "standby_without_canonical_departure" };

  const compact = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  const compactMeridiem = compact.match(/^(\d{1,2})(?::|\.|h)?(\d{2})?([ap])m?$/);
  if (compactMeridiem) {
    const h12 = Number(compactMeridiem[1]);
    const mm = Number(compactMeridiem[2] || "0");
    const mins = normalize12Hour(h12, mm, compactMeridiem[3]);
    if (!Number.isFinite(mins)) return { minutes: null, reason: "invalid_time_format" };
    return { minutes: mins, reason: "ok" };
  }

  const hhmmss = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hhmmss) {
    const hh = Number(hhmmss[1]);
    const mm = Number(hhmmss[2]);
    const ss = Number(hhmmss[3]);
    if (!isValidMinutePair(hh, mm) || ss < 0 || ss > 59) return { minutes: null, reason: "invalid_time_format" };
    return { minutes: hh * 60 + mm, reason: "ok" };
  }

  const hhmm = raw.match(/^(\d{1,2})[:.](\d{2})$/);
  if (hhmm) {
    const hh = Number(hhmm[1]);
    const mm = Number(hhmm[2]);
    if (!isValidMinutePair(hh, mm)) return { minutes: null, reason: "invalid_time_format" };
    return { minutes: hh * 60 + mm, reason: "ok" };
  }

  const twelve = raw.match(/^(\d{1,2})(?::|\.)(\d{2})\s*([ap])\.?\s*m?\.?$/i);
  if (twelve) {
    const mins = normalize12Hour(Number(twelve[1]), Number(twelve[2]), twelve[3]);
    if (!Number.isFinite(mins)) return { minutes: null, reason: "invalid_time_format" };
    return { minutes: mins, reason: "ok" };
  }

  const hhmmCompact = compact.match(/^(\d{2})(\d{2})$/);
  if (hhmmCompact) {
    const hh = Number(hhmmCompact[1]);
    const mm = Number(hhmmCompact[2]);
    if (!isValidMinutePair(hh, mm)) return { minutes: null, reason: "invalid_time_format" };
    return { minutes: hh * 60 + mm, reason: "ok" };
  }

  const hourOnly = compact.match(/^(\d{1,2})$/);
  if (hourOnly) {
    const hh = Number(hourOnly[1]);
    if (!Number.isInteger(hh) || hh < 0 || hh > 23) return { minutes: null, reason: "invalid_time_format" };
    return { minutes: hh * 60, reason: "ok" };
  }

  if (/[ap]m?/i.test(compact) || /[:.\d]/.test(compact)) return { minutes: null, reason: "unsupported_time_variant" };
  return { minutes: null, reason: "invalid_time_format" };
}

export function normalizeLegacyTime(value) {
  const parsed = parseTimeToMinutesDetailed(value);
  if (!Number.isFinite(parsed.minutes)) return null;
  const hh = String(Math.floor(parsed.minutes / 60)).padStart(2, "0");
  const mm = String(parsed.minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseIsoDateParts(dateIso) {
  const n = normalizeDateIso(dateIso);
  if (!DATE_RE.test(String(n || ""))) return null;
  const [y, m, d] = String(n).split("-").map(Number);
  return { y, m, d };
}

export function timezoneOffsetMsAtUtc(utcMs, timeZone) {
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
    parts.forEach((part) => { if (part.type !== "literal") values[part.type] = part.value; });
    const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second), 0);
    return asUtc - utcMs;
  } catch {
    return null;
  }
}

export function localDateTimeToUtcMs(dateIso, minutesOfDay, timeZone) {
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

export function utcMsToLocalTime(utcMs, timeZone, locale = "es-MX") {
  if (!Number.isFinite(utcMs) || !timeZone) return "";
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(utcMs));
  } catch {
    return "";
  }
}

export function formatUtcClock(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function formatUtcLabel(value) {
  const clock = formatUtcClock(value);
  return clock ? `UTC ${clock}` : "UTC --:--";
}

export function formatLocalAndUtcFromUtc(utcValue, timeZone, locale = "es-MX") {
  const utcMs = new Date(utcValue).getTime();
  if (!Number.isFinite(utcMs)) return { local: "--:--", utc: "UTC --:--" };
  return {
    local: utcMsToLocalTime(utcMs, timeZone, locale) || "--:--",
    utc: formatUtcLabel(utcMs),
  };
}

export function utcMsToLocalParts(utcMs, timeZone, locale = "en-CA") {
  if (!Number.isFinite(utcMs) || !timeZone) return null;
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const values = {};
    formatter.formatToParts(new Date(utcMs)).forEach((part) => {
      if (part.type !== "literal") values[part.type] = part.value;
    });
    if (!values.year || !values.month || !values.day || !values.hour || !values.minute) return null;
    return {
      dateIso: `${values.year}-${values.month}-${values.day}`,
      minutesOfDay: Number(values.hour) * 60 + Number(values.minute),
    };
  } catch {
    return null;
  }
}

export function resolveOperationalWindowUtc({
  dateIso,
  timeValue,
  timeZone,
  durationMinutes = 0,
  explicitStartUtc,
  explicitEndUtc,
} = {}) {
  const startUtcMs = Number.isFinite(new Date(explicitStartUtc).getTime())
    ? new Date(explicitStartUtc).getTime()
    : localDateTimeToUtcMs(dateIso, parseTimeToMinutes(timeValue), timeZone);
  if (!Number.isFinite(startUtcMs)) return { startUtcMs: null, endUtcMs: null };
  const parsedDuration = Number(durationMinutes || 0);
  const endUtcMs = Number.isFinite(new Date(explicitEndUtc).getTime())
    ? new Date(explicitEndUtc).getTime()
    : (startUtcMs + Math.max(0, parsedDuration) * 60000);
  return { startUtcMs, endUtcMs };
}
