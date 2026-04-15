import { supabase } from "../supabase";
import {
  AGENT_ACTIONS,
  CREATE_CRITICAL_FIELDS,
  VALID_AIRCRAFT,
  VALID_AIRCRAFT_STATUSES,
  VALID_FLIGHT_STATUSES,
} from "./agentTypes";
import {
  buildConflictWarning,
  buildPositionWarning,
  isActiveFlight,
  normalizeAgentWithAliases,
  normalizeAgentResult,
} from "./agentUtils";

async function getLastKnownPosition(ac) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("flights")
    .select("dest")
    .eq("ac", ac)
    .lte("date", today)
    .neq("st", "canc")
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .limit(1);

  return data?.[0]?.dest || null;
}

export async function validateAgentResult(agentResult, instruction = "") {
  const result = normalizeAgentWithAliases(normalizeAgentResult(agentResult), instruction);

  if (!result.action || !AGENT_ACTIONS.includes(result.action)) {
    result.errors.push("Acción inválida o ausente.");
  }

  if (result.payload.ac && !VALID_AIRCRAFT.includes(result.payload.ac)) {
    result.errors.push(`Aeronave inválida: ${result.payload.ac}`);
  }

  if (result.action === "change_aircraft_status") {
    if (!result.payload.ac) result.errors.push("change_aircraft_status requiere ac.");
    if (!result.payload.status_change) result.errors.push("change_aircraft_status requiere status_change.");
    if (
      result.payload.status_change &&
      !VALID_AIRCRAFT_STATUSES.includes(result.payload.status_change)
    ) {
      result.errors.push(`Estatus de aeronave inválido: ${result.payload.status_change}`);
    }
  }

  const flightStatusActions = ["create_flight", "edit_flight", "cancel_flight", "duplicate_flight"];
  if (
    flightStatusActions.includes(result.action) &&
    result.payload.st &&
    !VALID_FLIGHT_STATUSES.includes(result.payload.st)
  ) {
    result.errors.push(`Estatus de vuelo inválido: ${result.payload.st}`);
  }

  if (result.action === "create_flight") {
    const missing = CREATE_CRITICAL_FIELDS.filter((field) => !result.payload[field]);
    if (missing.length) {
      result.requires_confirmation = true;
      result.missing_fields = Array.from(new Set([...(result.missing_fields || []), ...missing]));
      result.errors.push(`Faltan campos críticos: ${missing.join(", ")}`);
    }

    if (result.payload.ac && result.payload.date && result.payload.time) {
      const nowRef = new Date("2026-04-09T12:00:00-06:00");
      const flightDate = new Date(`${result.payload.date}T12:00:00-06:00`);
      if (flightDate < nowRef) {
        result.errors.push("No se puede programar un vuelo en una fecha pasada.");
      }

      const { data: statusRows } = await supabase
        .from("aircraft_status")
        .select("status")
        .eq("ac", result.payload.ac)
        .limit(1);

      const currentStatus = statusRows?.[0]?.status || "disponible";
      if (["aog", "mantenimiento"].includes(currentStatus)) {
        result.warnings.push(
          currentStatus === "aog"
            ? `Advertencia: la aeronave ${result.payload.ac} actualmente se encuentra fuera de servicio (AOG). El vuelo puede programarse, pero deberá verificarse su disponibilidad antes de la operación.`
            : `Advertencia: la aeronave ${result.payload.ac} actualmente está en mantenimiento. El vuelo puede programarse, pero su disponibilidad deberá confirmarse antes de la fecha de salida.`
        );
      }

      const { data: collisionRows } = await supabase
        .from("flights")
        .select("id, ac, date, time, st")
        .eq("ac", result.payload.ac)
        .eq("date", result.payload.date)
        .eq("time", result.payload.time)
        .neq("st", "canc");

      (collisionRows || [])
        .filter((f) => isActiveFlight(f.st))
        .forEach((f) => result.warnings.push(buildConflictWarning(f)));

      if (result.payload.orig) {
        const lastKnownPosition = await getLastKnownPosition(result.payload.ac);
        if (lastKnownPosition && lastKnownPosition !== result.payload.orig) {
          result.warnings.push(
            buildPositionWarning(result.payload.ac, result.payload.orig, lastKnownPosition)
          );
        }
      }
    }
  }

  if (result.action === "query_notam") {
    if (!result.payload.airport_code) {
      const codeInInstruction = String(instruction || "").match(/\b([A-Za-z]{4})\b/);
      if (codeInInstruction) result.payload.airport_code = codeInInstruction[1].toUpperCase();
    }
    if (!result.payload.airport_code) {
      result.requires_confirmation = true;
      result.missing_fields = Array.from(new Set([...(result.missing_fields || []), "airport_code"]));
      result.errors.push("Necesito el código ICAO del aeropuerto (por ejemplo: MMMD o KOPF).");
    }
  }

  if (result.action === "edit_flight" && !result.payload.flight_id) {
    result.errors.push("edit_flight requiere flight_id.");
  }

  if (result.action === "cancel_flight" && !result.payload.flight_id) {
    result.errors.push("cancel_flight requiere flight_id.");
  }

  const friendlyMap = {
    date: "Falta indicar la fecha del vuelo.",
    ac: "Necesito saber qué aeronave deseas usar.",
    orig: "Falta el aeropuerto de salida.",
    dest: "Falta el aeropuerto de destino.",
    time: "Falta indicar la hora de salida.",
    rb: "Falta indicar quién solicita el vuelo.",
    airport_code: "Necesito el código ICAO del aeropuerto para consultar NOTAM/restricciones.",
  };
  const clarification_prompts = (result.missing_fields || []).map((f) => friendlyMap[f] || `Falta información: ${f}.`);
  const cleanedErrors = (result.errors || []).map((msg) =>
    msg
      .replace("change_aircraft_status requiere ac.", "Necesito saber qué aeronave deseas actualizar.")
      .replace("change_aircraft_status requiere status_change.", "Indica el nuevo estado de la aeronave (disponible, mantenimiento o AOG).")
      .replace("edit_flight requiere flight_id.", "Necesito identificar el vuelo que deseas editar.")
      .replace("cancel_flight requiere flight_id.", "Necesito identificar el vuelo que deseas cancelar.")
      .replace(/^Faltan campos críticos:.*$/i, "Faltan datos clave para programar el vuelo.")
  );

  return {
    ...result,
    errors: cleanedErrors,
    clarification_prompts,
    can_execute: cleanedErrors.length === 0 && !result.requires_confirmation,
  };
}
