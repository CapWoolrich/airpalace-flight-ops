import { EMPTY_AGENT_RESULT } from "./agentTypes.js";
import {
  getOperationalDateOffsetISO,
  isPastOperationalDate,
  parseOperationalDateFromText,
} from "./operationalDate.js";

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
  habib: "Jabib C",
  "habib chapur": "Jabib C",
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

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function compactText(v) {
  return normalizeText(v).replace(/[\s-]/g, "");
}

function toISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

export function normalizeRequesterValue(value) {
  return normalizeExactAlias(REQUESTER_ALIASES, value) || String(value || "").trim();
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
    if (payload.status_change === "disponible") {
      payload.maintenance_start_date = null;
      payload.maintenance_end_date = null;
    }
  }

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

  const parsedDate = parseOperationalDateFromText(instructionText);
  if (parsedDate) {
    payload.date = parsedDate.date;
    if (result.action === "change_aircraft_status") {
      if (/\bhasta\b|\buntil\b/.test(instructionText)) payload.maintenance_end_date = parsedDate.date;
      else payload.maintenance_start_date = payload.maintenance_start_date || parsedDate.date;
    }
    const refYear = Number(getOperationalDateOffsetISO(0).slice(0, 4));
    if (parsedDate.explicitYear && parsedDate.explicitYear < refYear) {
      result.errors.push("La fecha indicada está en un año pasado.");
    } else if (isPastOperationalDate(parsedDate.date)) {
      if (parsedDate.impliedYear) {
        const nextYearDate = toISODate(refYear + 1, Number(parsedDate.date.slice(5, 7)), Number(parsedDate.date.slice(8, 10)));
        result.requires_confirmation = true;
        result.warnings.push(`La fecha ${parsedDate.date} ya pasó. ¿Deseas programarla para ${nextYearDate}?`);
      } else {
        result.errors.push("No se puede programar un vuelo en una fecha pasada.");
      }
    }
  }

  const notamRegex = /\b(notam|restricci[oó]n|restricciones|operativas en|airport restrictions?)\b/i;
  const statusRegex = /\b(disponible|disponibles|mantenimiento|aog|fuera de servicio|conflicto|conflictos)\b/i;
  const scheduleRegex = /\b(vuelos|agenda|programad[oa]s?|salidas|llegadas|pr[oó]ximos)\b/i;
  if (notamRegex.test(instructionText)) {
    result.action = "query_notam";
    const codeMatch = instructionText.match(/\b([a-z]{4})\b/i);
    if (codeMatch) payload.airport_code = codeMatch[1].toUpperCase();
  } else if (statusRegex.test(instructionText) && result.action === "query_schedule") {
    payload.query_scope = "aircraft_status";
  } else if (scheduleRegex.test(instructionText) && result.action === "query_schedule") {
    payload.query_scope = "flights";
  }

  return result;
}
