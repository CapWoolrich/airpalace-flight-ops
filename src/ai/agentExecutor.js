import { supabase } from "../supabase";
import { normalizeAgentResult } from "./agentUtils";

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
    const first = await supabase.from("flights").insert(rows);
    if (first.error) throw first.error;
    return true;
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

  async function sendPush(title, body) {
    try {
      await fetch("/api/send-push-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url: "/" }),
      });
    } catch {}
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
      await safeInsert(legs);
      const waError = await sendWhatsApp(legs[0]);
      await sendPush("Vuelo programado", `${legs[0].ac} · ${legs[0].orig} → ${legs[0].dest} · ${legs[0].date} ${legs[0].time || "STBY"}`);
      return { ok: true, message: "Vuelo creado correctamente.", warning: waError };
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
      await sendPush("Vuelo modificado", `${updates.ac || payload.ac} actualizado`);
      return { ok: true, message: "Vuelo editado correctamente.", warning: waError };
    }

    case "cancel_flight": {
      const { error } = await supabase
        .from("flights")
        .update({ st: "canc", updated_at: new Date().toISOString() })
        .eq("id", payload.flight_id);
      if (error) throw error;
      await sendPush("Vuelo cancelado", `ID ${payload.flight_id} cancelado`);
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
      if (payload.status_change === "aog") await sendPush("AOG", `Alerta AOG: ${payload.ac} quedó fuera de servicio.`);
      if (payload.status_change === "mantenimiento") await sendPush("Mantenimiento", `${payload.ac} en mantenimiento.`);
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
