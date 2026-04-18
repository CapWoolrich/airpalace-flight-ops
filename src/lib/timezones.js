import { APR } from "../app/data.js";

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

export function findAirport(value) {
  const code = normalizeCode(value);
  if (!code) return null;
  return APR.find((x) => x.c === code || x.i4 === code || x.i3 === code || normalizeCode(x.c) === code) || null;
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
  const raw = String(value || "").trim().replace(/\u00A0/g, " ");
  if (!raw || raw.toUpperCase() === "STBY") return null;
  const compact = raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  const compactMeridiem = compact.match(/^(\d{1,2}):(\d{2})([ap])m?$/);
  if (compactMeridiem) {
    const h12 = Number(compactMeridiem[1]);
    const mm = Number(compactMeridiem[2]);
    if (h12 < 1 || h12 > 12 || mm < 0 || mm > 59) return null;
    const pm = compactMeridiem[3] === "p";
    return (h12 % 12 + (pm ? 12 : 0)) * 60 + mm;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hh = Number(hhmm[1]);
    const mm = Number(hhmm[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
  }
  const twelve = raw.match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m?\.?/i);
  if (twelve) {
    const h12 = Number(twelve[1]);
    const mm = Number(twelve[2]);
    if (h12 < 1 || h12 > 12 || mm < 0 || mm > 59) return null;
    const pm = String(twelve[3]).toLowerCase() === "p";
    return (h12 % 12 + (pm ? 12 : 0)) * 60 + mm;
  }
  return null;
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
