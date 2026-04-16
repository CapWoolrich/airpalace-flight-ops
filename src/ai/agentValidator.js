import { supabase } from "../supabase.js";
import {
  AGENT_ACTIONS,
  CREATE_CRITICAL_FIELDS,
  VALID_AIRCRAFT,
  VALID_AIRCRAFT_STATUSES,
  VALID_FLIGHT_STATUSES,
} from "./agentTypes.js";
import {
  buildConflictWarning,
  buildPositionWarning,
  isActiveFlight,
  normalizeAgentWithAliases,
  normalizeAgentResult,
} from "./agentUtils.js";
import { getOperationalTodayISO, isPastOperationalDate } from "./operationalDate.js";
import { resolveFlightTarget } from "./flightTargetResolver.js";


function parseTimeToMinutes(value) {
  const m = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function overlapsByOperationalWindow(baseTime, otherTime, windowMinutes = 90) {
  const a = parseTimeToMinutes(baseTime);
  const b = parseTimeToMinutes(otherTime);
  if (a === null || b === null) return false;
  return Math.abs(a - b) < windowMinutes;
}

async function resolveFlightReference(payload = {}, action = "edit_flight") {
  const hasSelectors = Boolean(payload.date || payload.ac || payload.orig || payload.dest || payload.rb || payload.time);
  if (!hasSelectors) return { flightId: null, candidates: [] };

  let q = supabase
    .from("flights")
    .select("id, date, time, ac, orig, dest, rb, st")
    .neq("st", "canc")
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(20);

  if (payload.date) q = q.eq("date", payload.date);
  if (payload.ac) q = q.eq("ac", payload.ac);
  if (payload.orig) q = q.ilike("orig", payload.orig);
  if (payload.dest) q = q.ilike("dest", payload.dest);

  const { data } = await q;
  let candidates = (data || []).filter((f) => {
    if (payload.rb && String(f.rb || "").toLowerCase() !== String(payload.rb || "").toLowerCase()) return false;
    if (payload.time && String(f.time || "") !== String(payload.time || "")) return false;
    return true;
  });
  if (action === "cancel_flight") candidates = candidates.filter((f) => String(f.st || "") !== "canc");
  return { flightId: candidates.length === 1 ? candidates[0].id : null, candidates };
}

async function getLastKnownPosition(ac) {
  const today = getOperationalTodayISO();
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
      if (isPastOperationalDate(result.payload.date)) {
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
        .neq("st", "canc")
        .neq("st", "comp");

      (collisionRows || [])
        .filter((f) => isActiveFlight(f.st))
        .filter((f) => f.time === result.payload.time || overlapsByOperationalWindow(result.payload.time, f.time))
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
    const resolved = await resolveFlightTarget({ db: supabase, payload: result.payload, action: "edit_flight", limit: 20 });
    if (resolved.flightId) {
      result.payload.flight_id = resolved.flightId;
      result.warnings.push("Resolví el vuelo a editar por fecha/ruta/aeronave. Verifica antes de confirmar.");
    } else if (resolved.candidates.length > 1) {
      result.errors.push(`Encontré ${resolved.candidates.length} vuelos posibles para editar; necesito más precisión.`);
      result.missing_fields = Array.from(new Set([...(result.missing_fields || []), "flight_selector"]));
    } else {
      result.errors.push("edit_flight requiere flight_id.");
    }
  }

  if (result.action === "cancel_flight" && !result.payload.flight_id) {
    const resolved = await resolveFlightTarget({ db: supabase, payload: result.payload, action: "cancel_flight", limit: 20 });
    if (resolved.flightId) {
      result.payload.flight_id = resolved.flightId;
      result.warnings.push("Resolví el vuelo a cancelar por fecha/ruta/aeronave. Verifica antes de confirmar.");
    } else if (resolved.candidates.length > 1) {
      result.errors.push(`Encontré ${resolved.candidates.length} vuelos posibles para cancelar; necesito más precisión.`);
      result.missing_fields = Array.from(new Set([...(result.missing_fields || []), "flight_selector"]));
    } else {
      result.errors.push("cancel_flight requiere flight_id.");
    }
  }

  const friendlyMap = {
    date: "Falta indicar la fecha del vuelo.",
    ac: "Necesito saber qué aeronave deseas usar.",
    orig: "Falta el aeropuerto de salida.",
    dest: "Falta el aeropuerto de destino.",
    time: "Falta indicar la hora de salida.",
    rb: "Falta indicar quién solicita el vuelo.",
    flight_selector: "Necesito más detalle para identificar el vuelo (fecha, hora, ruta o aeronave).",
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
