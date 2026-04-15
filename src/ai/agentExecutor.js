import { supabase } from "../supabase";
import { normalizeAgentResult } from "./agentUtils";
import { buildOpsPush } from "../lib/opsNotifications";

function createFlightLegs(payload, routeResult) {
  const creatorMeta = payload.creator_meta || {};
  const baseFlight = {
    date: payload.date,
    ac: payload.ac,
    orig: payload.orig,
    dest: payload.dest,
    time: payload.time,
    rb: payload.rb,
    nt: payload.nt || "",
    pm: Number(payload.pm || 0),
    pw: Number(payload.pw || 0),
    pc: Number(payload.pc || 0),
    bg: Number(payload.bg || 0),
    st: payload.st || "prog",
    creation_source: creatorMeta.creation_source || "ai",
  };

  if (routeResult && !routeResult.dir && routeResult.stops.length > 0) {
    const stop = routeResult.stops[0];
    return [
      {
        ...baseFlight,
        dest: stop.c,
        nt: (baseFlight.nt ? `${baseFlight.nt} | ` : "") + `Escala -> ${baseFlight.dest}`,
      },
      {
        ...baseFlight,
        orig: stop.c,
        time: "STBY",
        nt: "Tras recarga",
      },
    ];
  }

  return [baseFlight];
}

export async function executeAgentAction(agentResult, options = {}) {
  const result = normalizeAgentResult(agentResult);
  const payload = result.payload;
  const calcRoute = options.calcRoute;

  async function safeInsert(rows) {
    const first = await supabase.from("flights").insert(rows).select("*");
    if (first.error) throw first.error;
    return first.data || [];
  }

  async function sendWhatsApp(flight) {
    const r = await fetch("/api/send-whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flight, label: "PROGRAMADO" }),
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) {
      return payload.error || `HTTP ${r.status}`;
    }
    return payload.warning || null;
  }

  async function sendPush(title, body, url) {
    try {
      await fetch("/api/send-push-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url: url || "/" }),
      });
    } catch {}
  }

  async function sendEmail(eventType, payload) {
    try {
      const r = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, payload }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return data.error || "No se pudo enviar correo.";
      return data.warning || null;
    } catch (e) {
      return e?.message || "No se pudo enviar correo.";
    }
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
    case "create_flight": {
      payload.creator_meta = options.creatorMeta || payload.creator_meta || {};
      const routeResult = typeof calcRoute === "function"
        ? calcRoute(payload.orig, payload.dest, payload.ac, {
            m: payload.pm,
            w: payload.pw,
            c: payload.pc,
          }, payload.bg)
        : null;

      const legs = createFlightLegs(payload, routeResult);
      const insertedLegs = await safeInsert(legs);
      const primaryLeg = insertedLegs[0] || legs[0];
      const waError = await sendWhatsApp(primaryLeg);
      const emailWarning = await sendEmail("flight_created", {
        event_label: "Vuelo programado",
        ...primaryLeg,
        flight_id: primaryLeg?.id || null,
        block_minutes: routeResult?.bm || 60,
      });
      const programmedPush = buildOpsPush("flight_programmed", primaryLeg);
      await sendPush(programmedPush.title, programmedPush.body, programmedPush.url);
      return { ok: true, message: "Vuelo creado correctamente.", warning: [waError, emailWarning].filter(Boolean).join(" | ") || null };
    }

    case "edit_flight": {
      const updates = {};
      ["date", "ac", "orig", "dest", "time", "rb", "nt", "pm", "pw", "pc", "bg", "st"].forEach((k) => {
        if (payload[k] !== null && payload[k] !== undefined) updates[k] = payload[k];
      });
      updates.updated_at = new Date().toISOString();

      let { error } = await supabase.from("flights").update(updates).eq("id", payload.flight_id);
      if (error) throw error;
      const waError = await sendWhatsApp({
        ac: updates.ac || payload.ac,
        orig: updates.orig || payload.orig,
        dest: updates.dest || payload.dest,
        date: updates.date || payload.date,
        time: updates.time || payload.time,
        rb: updates.rb || payload.rb,
      });
      const modifiedPush = buildOpsPush("flight_modified", {
        ac: updates.ac || payload.ac,
        orig: updates.orig || payload.orig,
        dest: updates.dest || payload.dest,
        date: updates.date || payload.date,
        time: updates.time || payload.time,
      });
      await sendPush(modifiedPush.title, modifiedPush.body, modifiedPush.url);
      const emailWarning = await sendEmail("flight_updated", {
        event_label: "Vuelo modificado",
        flight_id: payload.flight_id,
        ac: updates.ac || payload.ac,
        orig: updates.orig || payload.orig,
        dest: updates.dest || payload.dest,
        date: updates.date || payload.date,
        time: updates.time || payload.time,
        rb: updates.rb || payload.rb,
      });
      return { ok: true, message: "Vuelo editado correctamente.", warning: [waError, emailWarning].filter(Boolean).join(" | ") || null };
    }

    case "cancel_flight": {
      const { error } = await supabase
        .from("flights")
        .update({ st: "canc", updated_at: new Date().toISOString() })
        .eq("id", payload.flight_id);
      if (error) throw error;
      const cancelledPush = buildOpsPush("flight_cancelled", { ac: payload.ac, orig: payload.orig, dest: payload.dest });
      await sendPush(cancelledPush.title, cancelledPush.body, cancelledPush.url);
      await sendEmail("flight_cancelled", { event_label: "Vuelo cancelado", flight_id: payload.flight_id, ac: payload.ac, orig: payload.orig, dest: payload.dest, date: payload.date, time: payload.time, rb: payload.rb });
      return { ok: true, message: "Vuelo cancelado correctamente." };
    }

    case "change_aircraft_status": {
      const { error } = await supabase.from("aircraft_status").upsert([
        {
          ac: payload.ac,
          status: payload.status_change,
          updated_at: new Date().toISOString(),
        },
      ]);
      if (error) throw error;
      if (payload.status_change === "aog") {
        const aogPush = buildOpsPush("aog", { ac: payload.ac });
        await sendPush(aogPush.title, aogPush.body, aogPush.url);
        await sendEmail("aircraft_aog", { event_label: "AOG", ac: payload.ac });
      }
      if (payload.status_change === "mantenimiento") {
        const maintPush = buildOpsPush("maintenance", { ac: payload.ac, maintenanceEndDate: payload.maintenance_end_date });
        await sendPush(maintPush.title, maintPush.body, maintPush.url);
        await sendEmail("aircraft_maintenance", { event_label: "Mantenimiento", ac: payload.ac, maintenance_end_date: payload.maintenance_end_date });
      }
      return { ok: true, message: "Estado de aeronave actualizado." };
    }

    case "duplicate_flight": {
      const { data, error } = await supabase
        .from("flights")
        .select("*")
        .eq("id", payload.flight_id)
        .single();
      if (error) throw error;

      const duplicated = {
        ...data,
        id: undefined,
        date: payload.date || data.date,
        time: payload.time || data.time,
        st: "prog",
        created_at: undefined,
        updated_at: new Date().toISOString(),
      };
      const { error: insError } = await supabase.from("flights").insert([duplicated]);
      if (insError) throw insError;
      return { ok: true, message: "Vuelo duplicado correctamente." };
    }

    case "query_schedule": {
      const instruction = String(options.instruction || "").toLowerCase();
      if ((payload.query_scope || "").toLowerCase() === "aircraft_status" || /disponible|mantenimiento|aog|conflicto/.test(instruction)) {
        if (/conflicto/.test(instruction)) {
          const flights = await fetchFlightsForQuery();
          const active = flights.filter((f) => f.st !== "canc" && f.st !== "comp");
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
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(new Date(`${today}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
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
      const r = await fetch("/api/notam-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
