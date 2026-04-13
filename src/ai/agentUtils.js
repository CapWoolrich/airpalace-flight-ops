import { EMPTY_AGENT_RESULT } from "./agentTypes";

export function cloneEmptyResult() {
  return JSON.parse(JSON.stringify(EMPTY_AGENT_RESULT));
}

export function normalizeAgentResult(input) {
  const base = cloneEmptyResult();
  const merged = {
    ...base,
    ...(input || {}),
    payload: {
      ...base.payload,
      ...((input && input.payload) || {}),
    },
  };

  merged.confidence = Number(merged.confidence || 0);
  merged.requires_confirmation = Boolean(merged.requires_confirmation);
  merged.missing_fields = Array.isArray(merged.missing_fields) ? merged.missing_fields : [];
  merged.warnings = Array.isArray(merged.warnings) ? merged.warnings : [];
  merged.errors = Array.isArray(merged.errors) ? merged.errors : [];

  merged.payload.pm = Number(merged.payload.pm || 0);
  merged.payload.pw = Number(merged.payload.pw || 0);
  merged.payload.pc = Number(merged.payload.pc || 0);
  merged.payload.bg = Number(merged.payload.bg || 0);

  return merged;
}

export function buildConflictWarning(flight) {
  return `Existe otro vuelo activo para ${flight.ac} en ${flight.date} ${flight.time}.`;
}

export function buildPositionWarning(ac, expectedOrig, lastKnownPosition) {
  return `Origen (${expectedOrig}) no coincide con última posición conocida de ${ac} (${lastKnownPosition}).`;
}

export function isActiveFlight(st) {
  return st !== "canc" && st !== "comp";
}

const AIRCRAFT_ALIASES = {
  n540jl: "N540JL",
  m2: "N540JL",
  n35ea: "N35EA",
  phenom: "N35EA",
  "phenom 300e": "N35EA",
  p300e: "N35EA",
};

const REQUESTER_ALIASES = {
  "jabib chapur": "Jabib C",
  "j chapur": "Jabib C",
  jabib: "Jabib C",
  omar: "Omar C",
  "omar chapur": "Omar C",
  gibran: "Gibran C",
  jose: "Jose C",
  anuar: "Anuar C",
};

const AIRPORT_ALIASES = {
  kopf: "Opa-Locka Exec",
  opf: "Opa-Locka Exec",
  "opa locka": "Opa-Locka Exec",
  "opa-locka": "Opa-Locka Exec",
  "opa locka exec": "Opa-Locka Exec",
  merida: "Merida",
  mid: "Merida",
  mmmd: "Merida",
};

const AIRCRAFT_STATUSES = ["aog", "mantenimiento", "disponible"];
const REF_DATE = new Date("2026-04-09T12:00:00-06:00");
const REF_YEAR = 2026;
const MONTHS = {
  enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abril: 4, abr: 4, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sept: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
  nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};
const WEEKDAYS = {
  sunday: 0, domingo: 0,
  monday: 1, lunes: 1,
  tuesday: 2, martes: 2,
  wednesday: 3, miercoles: 3, miércoles: 3,
  thursday: 4, jueves: 4,
  friday: 5, viernes: 5,
  saturday: 6, sabado: 6, sábado: 6,
};

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function compactText(v) {
  return normalizeText(v).replace(/[\s-]/g, "");
}

function toISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextWeekday(baseDate, targetDay, forceNext) {
  const d = new Date(baseDate);
  const current = d.getDay();
  let delta = (targetDay - current + 7) % 7;
  if (forceNext || delta === 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return d;
}

function parseDateFromInstruction(text) {
  const t = normalizeText(text);
  if (!t) return null;
  if (t.includes("pasado mañana") || t.includes("day after tomorrow")) return { date: "2026-04-11", impliedYear: false };
  if (t.includes("mañana") || t.includes("tomorrow")) return { date: "2026-04-10", impliedYear: false };
  if (t.includes("hoy") || t.includes("today")) return { date: "2026-04-09", impliedYear: false };

  const nextWeekdayMatch = t.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (nextWeekdayMatch) {
    const d = nextWeekday(REF_DATE, WEEKDAYS[nextWeekdayMatch[1]], true);
    return { date: toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate()), impliedYear: false };
  }

  const dayName = Object.keys(WEEKDAYS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (dayName) {
    const d = nextWeekday(REF_DATE, WEEKDAYS[dayName], false);
    return { date: toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate()), impliedYear: false };
  }

  const dmy = t.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/);
  if (dmy) {
    const year = dmy[3] ? Number(dmy[3]) : REF_YEAR;
    return { date: toISODate(year, Number(dmy[2]), Number(dmy[1])), impliedYear: !dmy[3], explicitYear: dmy[3] ? Number(dmy[3]) : null };
  }

  const deMes = t.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/);
  if (deMes && MONTHS[deMes[2]]) {
    const year = deMes[3] ? Number(deMes[3]) : REF_YEAR;
    return { date: toISODate(year, MONTHS[deMes[2]], Number(deMes[1])), impliedYear: !deMes[3], explicitYear: deMes[3] ? Number(deMes[3]) : null };
  }

  const mesDia = t.match(/([a-záéíóú]+)\s+(\d{1,2})(?:\s+de\s+(\d{4}))?/);
  if (mesDia && MONTHS[mesDia[1]]) {
    const year = mesDia[3] ? Number(mesDia[3]) : REF_YEAR;
    return { date: toISODate(year, MONTHS[mesDia[1]], Number(mesDia[2])), impliedYear: !mesDia[3], explicitYear: mesDia[3] ? Number(mesDia[3]) : null };
  }

  return null;
}

function findAliasValue(aliases, text) {
  const haystack = normalizeText(text);
  const haystackCompact = compactText(text);
  const sorted = Object.keys(aliases).sort((a, b) => b.length - a.length);
  const match = sorted.find((alias) => {
    const normalizedAlias = normalizeText(alias);
    return haystack.includes(normalizedAlias) || haystackCompact.includes(compactText(normalizedAlias));
  });
  return match ? aliases[match] : null;
}

function normalizeExactAlias(aliases, value) {
  const key = normalizeText(value);
  if (aliases[key]) return aliases[key];
  const keyCompact = compactText(value);
  const found = Object.keys(aliases).find((alias) => compactText(alias) === keyCompact);
  return found ? aliases[found] : null;
}

export function normalizeAgentWithAliases(input, instruction = "") {
  const result = normalizeAgentResult(input);
  const payload = result.payload;
  const instructionText = normalizeText(instruction);

  const normalizedAc =
    normalizeExactAlias(AIRCRAFT_ALIASES, payload.ac) ||
    findAliasValue(AIRCRAFT_ALIASES, instructionText);
  if (normalizedAc) payload.ac = normalizedAc;

  const normalizedRb =
    normalizeExactAlias(REQUESTER_ALIASES, payload.rb) ||
    findAliasValue(REQUESTER_ALIASES, instructionText);
  if (normalizedRb) payload.rb = normalizedRb;

  const normalizedOrig = normalizeExactAlias(AIRPORT_ALIASES, payload.orig);
  const normalizedDest = normalizeExactAlias(AIRPORT_ALIASES, payload.dest);
  if (normalizedOrig) payload.orig = normalizedOrig;
  if (normalizedDest) payload.dest = normalizedDest;

  if (!payload.orig && /\b(merida|mid|mmmd)\b/.test(instructionText)) {
    payload.orig = "Merida";
  }
  if (!payload.dest && /\b(kopf|opf)\b/.test(instructionText)) {
    payload.dest = "Opa-Locka Exec";
  }

  // If model puts aircraft status in st for status change requests, map it safely.
  if (result.action === "change_aircraft_status") {
    const stAsAircraftStatus = normalizeText(payload.st);
    if (!payload.status_change && AIRCRAFT_STATUSES.includes(stAsAircraftStatus)) {
      payload.status_change = stAsAircraftStatus;
    }
    if (!payload.status_change) {
      const fromInstruction = findAliasValue(
        { aog: "aog", mantenimiento: "mantenimiento", disponible: "disponible" },
        instructionText
      );
      if (fromInstruction) payload.status_change = fromInstruction;
    }
    payload.st = null;
  }

  // Keep pax split at 0 if unknown, but store total if user gave only total pax.
  if (
    result.action === "create_flight" &&
    Number(payload.pm || 0) + Number(payload.pw || 0) + Number(payload.pc || 0) === 0
  ) {
    const paxMatch = instructionText.match(/(\d+)\s*(personas|pasajeros|pax)/);
    if (paxMatch) {
      const paxTotal = Number(paxMatch[1]);
      const paxNote = `PAX total: ${paxTotal} (sin desglose)`;
      payload.nt = payload.nt ? `${payload.nt} | ${paxNote}` : paxNote;
    }
  }

  const parsedDate = parseDateFromInstruction(instructionText);
  if (parsedDate) {
    payload.date = parsedDate.date;
    const normalizedDate = new Date(`${parsedDate.date}T12:00:00-06:00`);
    const ref = new Date("2026-04-09T12:00:00-06:00");
    if (parsedDate.explicitYear && parsedDate.explicitYear < REF_YEAR) {
      result.errors.push("La fecha indicada está en un año pasado.");
    } else if (normalizedDate < ref) {
      if (parsedDate.impliedYear) {
        const nextYearDate = toISODate(REF_YEAR + 1, normalizedDate.getMonth() + 1, normalizedDate.getDate());
        result.requires_confirmation = true;
        result.warnings.push(`La fecha ${parsedDate.date} ya pasó. ¿Deseas programarla para ${nextYearDate}?`);
      } else {
        result.errors.push("No se puede programar un vuelo en una fecha pasada.");
      }
    }
  }

  return result;
}
