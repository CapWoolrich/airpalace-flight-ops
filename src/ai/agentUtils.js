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
