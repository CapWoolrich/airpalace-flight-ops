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
      return { ok: true, message: "Consulta analizada. No requiere escritura." };
    }

    default:
      throw new Error("Acción no soportada para ejecución.");
  }
}
