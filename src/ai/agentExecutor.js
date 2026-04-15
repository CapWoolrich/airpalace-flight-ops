import { supabase } from "../supabase";
import { normalizeAgentResult } from "./agentUtils";
import {
  formatOperationalDate,
  getOperationalTodayISO,
  getOperationalTomorrowISO,
  getOperationalWeekRangeISO,
} from "./operationalDate";

const WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "change_aircraft_status", "duplicate_flight"];
const ACTIVE_FLIGHT_STATUSES = new Set(["prog", "enc"]);
const DEFAULT_OCCUPANCY_MINUTES = 90;

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function parseTimeToMinutes(value) {
  const m = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function flightStartMinutes(flight) {
  const startMinutes = parseTimeToMinutes(flight?.time);
  if (!flight?.date || startMinutes === null) return null;
  const base = Date.parse(`${flight.date}T00:00:00Z`);
  if (!Number.isFinite(base)) return null;
  return Math.floor(base / 60000) + startMinutes;
}

function flightEndMinutes(flight, start) {
  const knownArrival = parseTimeToMinutes(
    flight?.arrival_time || flight?.arr_time || flight?.eta_time || flight?.eta
  );
  if (knownArrival !== null && flight?.date) {
    const base = Math.floor(Date.parse(`${flight.date}T00:00:00Z`) / 60000);
    const candidate = base + knownArrival;
    if (candidate > start) return candidate;
    return candidate + 24 * 60;
  }
  return start + DEFAULT_OCCUPANCY_MINUTES;
}

function overlap(a, b) {
  if (!a?.ac || a.ac !== b?.ac) return false;
  const aStart = flightStartMinutes(a);
  const bStart = flightStartMinutes(b);
  if (aStart === null || bStart === null) return false;
  const aEnd = flightEndMinutes(a, aStart);
  const bEnd = flightEndMinutes(b, bStart);
  return aStart < bEnd && bStart < aEnd;
}

function detectConflicts(flights) {
  const conflicts = [];
  const active = (flights || []).filter((f) => ACTIVE_FLIGHT_STATUSES.has(String(f.st || "").toLowerCase()));
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      if (!overlap(a, b)) continue;
      conflicts.push({ ac: a.ac, flights: [a, b] });
    }
  }
  return conflicts;
}

function summarizeFlights(flights) {
  if (!flights.length) return "No encontré vuelos para ese criterio.";
  return `Encontré ${flights.length} vuelo(s).`;
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
    throw new Error("Las acciones AI de escritura solo pueden ejecutarse vía /api/ai-write con confirmación del servidor.");
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

      if (detectUnsupportedPilotQuery(instruction, payload)) {
        return {
          ok: true,
          message: "Hoy el sistema no guarda asignación formal de piloto por vuelo; puedo filtrar por aeronave, fecha y estatus operativo.",
          data: { limitation: "pilot_assignment_not_modeled" },
        };
      }

      if ((payload.query_scope || "").toLowerCase() === "aircraft_status" || /disponible|mantenimiento|aog|conflicto/.test(instruction)) {
        if (/conflicto/.test(instruction)) {
          const flights = await fetchFlightsForQuery();
          const rangeStart = /mañana|tomorrow/.test(instruction) ? tomorrow : /hoy|today/.test(instruction) ? today : null;
          const rangeEnd = rangeStart;
          const inRange = (f) => {
            if (!rangeStart) return true;
            return f.date >= rangeStart && f.date <= rangeEnd;
          };
          const conflicts = detectConflicts(flights.filter(inRange));
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

        if (/aog/.test(instruction)) {
          return {
            ok: true,
            message: aog.length ? `AOG: ${aog.map((x) => x.ac).join(", ")}.` : "No hay aeronaves en AOG.",
            data: { aog },
          };
        }

        if (/mantenimiento/.test(instruction)) {
          return {
            ok: true,
            message: maint.length ? `En mantenimiento: ${maint.map((x) => x.ac).join(", ")}.` : "No hay aeronaves en mantenimiento.",
            data: { maint },
          };
        }

        if (/hasta cuando|hasta cuándo/.test(instruction) && payload.ac) {
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

        return {
          ok: true,
          message: `Estado de flota: ${available.length} disponibles, ${maint.length} en mantenimiento y ${aog.length} en AOG.`,
          data: { available, maint, aog, statuses },
        };
      }

      const flights = await fetchFlightsForQuery();
      let filtered = flights;
      if (/mañana|tomorrow/.test(instruction)) {
        filtered = flights.filter((f) => f.date === tomorrow);
      } else if (/hoy|today/.test(instruction)) {
        filtered = flights.filter((f) => f.date === today);
      } else if (/esta semana|this week|semana/.test(instruction)) {
        filtered = flights.filter((f) => f.date >= weekRange.start && f.date <= weekRange.end);
      }

      filtered = filtered.filter((f) => ACTIVE_FLIGHT_STATUSES.has(String(f.st || "").toLowerCase()));

      if (payload.ac) filtered = filtered.filter((f) => f.ac === payload.ac);
      if (payload.dest) filtered = filtered.filter((f) => String(f.dest || "").toLowerCase() === String(payload.dest || "").toLowerCase());

      const top = filtered.slice(0, 12);
      return {
        ok: true,
        message: summarizeFlights(filtered),
        data: {
          count: filtered.length,
          flights: top,
          range: /esta semana|this week|semana/.test(instruction) ? weekRange : null,
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
