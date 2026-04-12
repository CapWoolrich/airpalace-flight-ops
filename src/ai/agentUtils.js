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
  p300e: "N35EA",
};

const REQUESTER_ALIASES = {
  "jabib chapur": "Jabib C",
  "j chapur": "Jabib C",
  jabib: "Jabib C",
  omar: "Omar C",
  gibran: "Gibran C",
  jose: "Jose C",
  anuar: "Anuar C",
};

const AIRPORT_ALIASES = {
  kopf: "Opa-Locka Exec",
  opf: "Opa-Locka Exec",
  merida: "Merida",
  mid: "Merida",
  mmmd: "Merida",
};

const AIRCRAFT_STATUSES = ["aog", "mantenimiento", "disponible"];

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function findAliasValue(aliases, text) {
  const haystack = normalizeText(text);
  const sorted = Object.keys(aliases).sort((a, b) => b.length - a.length);
  const match = sorted.find((alias) => haystack.includes(alias));
  return match ? aliases[match] : null;
}

function normalizeExactAlias(aliases, value) {
  const key = normalizeText(value);
  return aliases[key] || null;
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

  return result;
}
