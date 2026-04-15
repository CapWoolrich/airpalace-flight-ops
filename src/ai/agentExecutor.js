import { supabase } from "../supabase";
import { normalizeAgentResult } from "./agentUtils";

const WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "change_aircraft_status", "duplicate_flight"];

function meridaDateOffset(days = 0) {
  const base = new Date();
  base.setUTCMinutes(base.getUTCMinutes() - 360); // America/Merida baseline
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
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
      const pilotAlias = /diego/.test(instruction) ? "diego" : /jabib/.test(instruction) ? "jabib" : /omar/.test(instruction) ? "omar" : null;
      if ((payload.query_scope || "").toLowerCase() === "aircraft_status" || /disponible|mantenimiento|aog|conflicto/.test(instruction)) {
        if (/conflicto/.test(instruction)) {
          const flights = await fetchFlightsForQuery();
          const todayRef = meridaDateOffset(0);
          const tomorrowRef = meridaDateOffset(1);
          const active = flights.filter((f) => f.st !== "canc" && f.st !== "comp")
            .filter((f) => /mañana|tomorrow/.test(instruction) ? f.date === tomorrowRef : /hoy|today/.test(instruction) ? f.date === todayRef : true);
          const grouped = {};
          active.forEach((f) => {
            const key = `${f.ac}|${f.date}|${f.time}`;
            grouped[key] = (grouped[key] || []).concat([f]);
          });
          const conflicts = Object.values(grouped).filter((arr) => arr.length > 1).flat();
          return {
            ok: true,
            message: conflicts.length
              ? `Detecté ${conflicts.length} vuelo(s) en conflicto operativo.`
              : "No detecté conflictos operativos activos.",
            data: { count: conflicts.length, flights: conflicts.slice(0, 12) },
          };
        }
        const statuses = await fetchAircraftStatus();
        const maint = statuses.filter((s) => s.status === "mantenimiento");
        const aog = statuses.filter((s) => s.status === "aog");
        const available = statuses.filter((s) => s.status === "disponible");
        if (/hasta cuando|hasta cuándo/.test(instruction) && payload.ac) {
          const acStatus = statuses.find((s) => s.ac === payload.ac);
          const endDate = acStatus?.maintenance_end_date || null;
          return {
            ok: true,
            message: endDate
              ? `${payload.ac} está en ${acStatus?.status || "estado desconocido"} hasta ${endDate}.`
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
      const today = meridaDateOffset(0);
      const tomorrow = meridaDateOffset(1);
      let filtered = flights;
      if (/mañana|tomorrow/.test(instruction)) {
        filtered = flights.filter((f) => f.date === tomorrow);
      } else if (/hoy|today/.test(instruction)) {
        filtered = flights.filter((f) => f.date === today);
      } else if (/semana/.test(instruction)) {
        const end = new Date(new Date(`${today}T12:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10);
        filtered = flights.filter((f) => f.date >= today && f.date <= end);
      }
      if (payload.ac) filtered = filtered.filter((f) => f.ac === payload.ac);
      if (payload.dest) filtered = filtered.filter((f) => String(f.dest || "").toLowerCase() === String(payload.dest || "").toLowerCase());
      if (payload.rb) filtered = filtered.filter((f) => String(f.rb || "").toLowerCase().includes(String(payload.rb || "").toLowerCase()));
      if (pilotAlias) filtered = filtered.filter((f) => String(f.rb || "").toLowerCase().includes(pilotAlias));
      const top = filtered.slice(0, 12);
      return {
        ok: true,
        message: `Encontré ${filtered.length} vuelo(s).`,
        data: {
          count: filtered.length,
          flights: top,
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
