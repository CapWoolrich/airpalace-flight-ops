import { supabase } from "../supabase.js";
import { normalizeAgentResult, normalizeRequesterValue } from "./agentUtils.js";
import {
  formatOperationalDate,
  getOperationalTodayISO,
  getOperationalTomorrowISO,
  getOperationalWeekRangeISO,
} from "./operationalDate.js";
import { detectFlightConflicts } from "./conflictUtils.js";

const WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "change_aircraft_status", "duplicate_flight"];
const ACTIVE_FLIGHT_STATUSES = new Set(["prog", "enc"]);

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function summarizeFlights(flights) {
  if (!flights.length) return "No encontré vuelos para ese criterio.";
  return `Encontré ${flights.length} vuelo(s).`;
}

function resolveOperationalRange(instruction, refs) {
  if (/mañana|tomorrow/.test(instruction)) return { start: refs.tomorrow, end: refs.tomorrow, label: "tomorrow" };
  if (/hoy|today/.test(instruction)) return { start: refs.today, end: refs.today, label: "today" };
  if (/esta semana|this week|semana/.test(instruction)) return { start: refs.weekRange.start, end: refs.weekRange.end, label: "week" };
  return null;
}

function detectUnsupportedPilotQuery(instruction, payload) {
  const t = normalizeText(instruction);
  if (payload?.ac) return false;
  const hasPilotLikeName = /\b(vuelos\s+tiene|vuelos\s+de|agenda\s+de)\s+[a-záéíóúñ]+/i.test(t);
  const asksAircraft = /n\d{2,4}[a-z]{2}|\bm2\b|\bphenom\b/i.test(t);
  return hasPilotLikeName && !asksAircraft;
}

export async function executeAgentAction(agentResult, options = {}) {
  const result = normalizeAgentResult(agentResult);
  const payload = result.payload;
  const action = String(result.action || "");
  const isWriteAction = WRITE_ACTIONS.includes(action);

  if (isWriteAction) {
    throw new Error("Las acciones AI de escritura solo pueden ejecutarse vía /api/ai?action=ai-write con confirmación del servidor.");
  }

  async function fetchFlightsForQuery() {
    const { data, error } = await supabase
      .from("flights")
      .select("*")
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(300);
    if (error) throw error;
    return data || [];
  }

  async function fetchAircraftStatus() {
    const { data, error } = await supabase.from("aircraft_status").select("*");
    if (error) throw error;
    return data || [];
  }

  switch (result.action) {
    case "query_schedule": {
      const instruction = String(options.instruction || "").toLowerCase();
      const today = getOperationalTodayISO();
      const tomorrow = getOperationalTomorrowISO();
      const weekRange = getOperationalWeekRangeISO();
      const requestedRange = resolveOperationalRange(instruction, { today, tomorrow, weekRange });

      if (detectUnsupportedPilotQuery(instruction, payload)) {
        return {
          ok: true,
          message: "Hoy el sistema no guarda asignación formal de piloto por vuelo; puedo filtrar por aeronave, fecha y estatus operativo.",
          data: { limitation: "pilot_assignment_not_modeled" },
        };
      }

      if ((payload.query_scope || "").toLowerCase() === "aircraft_status" || /disponible|mantenimiento|aog|conflicto|fuera de servicio/.test(instruction)) {
        if (/conflicto/.test(instruction)) {
          const flights = await fetchFlightsForQuery();
          const conflicts = detectFlightConflicts(flights, {
            activeStatuses: Array.from(ACTIVE_FLIGHT_STATUSES),
            dateRange: requestedRange ? { start: requestedRange.start, end: requestedRange.end } : null,
          });
          const aircraft = Array.from(new Set(conflicts.map((c) => c.ac)));
          return {
            ok: true,
            message: conflicts.length
              ? `Detecté conflicto operativo en ${aircraft.length} aeronave(s).`
              : "No detecté conflictos operativos activos.",
            data: {
              count: conflicts.length,
              aircraft,
              conflicts: conflicts.slice(0, 12),
              limitation: "Cuando un vuelo no tiene hora de llegada registrada, uso una ventana operativa conservadora de 90 minutos.",
            },
          };
        }

        const statuses = await fetchAircraftStatus();
        const maint = statuses.filter((s) => s.status === "mantenimiento");
        const aog = statuses.filter((s) => s.status === "aog");
        const available = statuses.filter((s) => s.status === "disponible");

        if (/fuera de servicio/.test(instruction)) {
          const unavailable = statuses.filter((s) => ["aog", "mantenimiento"].includes(String(s.status || "").toLowerCase()));
          return {
            ok: true,
            message: unavailable.length
              ? `Fuera de servicio: ${unavailable.map((x) => x.ac).join(", ")}.`
              : "No hay aeronaves fuera de servicio.",
            data: { unavailable, maint, aog },
          };
        }

        if (/aog/.test(instruction)) {
          return {
            ok: true,
            message: aog.length ? `AOG: ${aog.map((x) => x.ac).join(", ")}.` : "No hay aeronaves en AOG.",
            data: { aog },
          };
        }

        if (/(hasta\s+cuando|hasta\s+cuándo)/.test(instruction) && payload.ac) {
          const acStatus = statuses.find((s) => s.ac === payload.ac);
          const endDate = acStatus?.maintenance_end_date || null;
          return {
            ok: true,
            message: endDate
              ? `${payload.ac} está en ${acStatus?.status || "estado desconocido"} hasta ${formatOperationalDate(endDate)}.`
              : `No tengo fecha fin registrada para ${payload.ac}.`,
            data: { status: acStatus || null },
          };
        }

        if (/mantenimiento/.test(instruction)) {
          return {
            ok: true,
            message: maint.length ? `En mantenimiento: ${maint.map((x) => x.ac).join(", ")}.` : "No hay aeronaves en mantenimiento.",
            data: { maint },
          };
        }

        return {
          ok: true,
          message: `Estado de flota: ${available.length} disponibles, ${maint.length} en mantenimiento y ${aog.length} en AOG.`,
          data: { available, maint, aog, statuses },
        };
      }

      const flights = await fetchFlightsForQuery();
      let filtered = flights;
      if (requestedRange) {
        filtered = flights.filter((f) => f.date >= requestedRange.start && f.date <= requestedRange.end);
      }

      filtered = filtered.filter((f) => ACTIVE_FLIGHT_STATUSES.has(String(f.st || "").toLowerCase()));

      if (payload.ac) filtered = filtered.filter((f) => f.ac === payload.ac);
      if (payload.dest) filtered = filtered.filter((f) => String(f.dest || "").toLowerCase() === String(payload.dest || "").toLowerCase());
      if (payload.rb) {
        const normalizedRb = normalizeRequesterValue(payload.rb);
        filtered = filtered.filter((f) => normalizeRequesterValue(f.rb) === normalizedRb);
      }

      const top = filtered.slice(0, 12);
      return {
        ok: true,
        message: summarizeFlights(filtered),
        data: {
          count: filtered.length,
          flights: top,
          range: requestedRange,
        },
      };
    }

    case "query_notam": {
      const airportCode = String(payload.airport_code || "").toUpperCase();
      if (!airportCode) {
        return { ok: false, message: "Necesito el código ICAO del aeropuerto para consultar NOTAM." };
      }
      const { data: authData } = await supabase.auth.getSession();
      const token = authData?.session?.access_token;
      const r = await fetch("/api/notam-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ airport_code: airportCode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      if (!data.live_available) {
        return {
          ok: true,
          message: `No tengo una fuente live de NOTAM configurada actualmente para ${airportCode}. No puedo confirmar restricciones actuales sin una fuente operativa configurada.`,
          data,
        };
      }
      return {
        ok: true,
        message: `Encontré ${Array.isArray(data.items) ? data.items.length : 0} NOTAM/restricción(es) para ${airportCode}. Fuente: ${data.source || "Proveedor externo"}.`,
        data,
      };
    }

    default:
      throw new Error("Acción no soportada para ejecución.");
  }
}
