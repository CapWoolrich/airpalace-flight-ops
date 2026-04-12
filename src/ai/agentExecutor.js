import { supabase } from "../supabase";
import { normalizeAgentResult } from "./agentUtils";
const META_FIELDS = ["created_by_email", "created_by_name", "updated_by_email", "updated_by_name"];

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
    created_by_user_id: creatorMeta.created_by_user_id || null,
    created_by_user_email: creatorMeta.created_by_user_email || null,
    created_by_user_name: creatorMeta.created_by_user_name || null,
    created_by_email: creatorMeta.created_by_email || creatorMeta.created_by_user_email || null,
    created_by_name: creatorMeta.created_by_name || creatorMeta.created_by_user_name || null,
    updated_by_email: creatorMeta.updated_by_email || creatorMeta.created_by_email || creatorMeta.created_by_user_email || null,
    updated_by_name: creatorMeta.updated_by_name || creatorMeta.created_by_name || creatorMeta.created_by_user_name || null,
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
    if (!first.error) return true;
    if (!String(first.error.message || "").includes("schema cache")) throw first.error;
    const fallbackRows = rows.map((r) => {
      const c = { ...r };
      META_FIELDS.forEach((k) => delete c[k]);
      return c;
    });
    const second = await supabase.from("flights").insert(fallbackRows);
    if (second.error) throw second.error;
    return false;
  }

  async function sendWhatsApp(flight) {
    const r = await fetch("/api/send-whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flight, label: "PROGRAMADO" }),
    });
    if (!r.ok) {
      const payload = await r.json().catch(() => ({}));
      return payload.error || `HTTP ${r.status}`;
    }
    return null;
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
      return { ok: true, message: "Vuelo creado correctamente.", warning: waError };
    }

    case "edit_flight": {
      const editorMeta = options.creatorMeta || {};
      const updates = {};
      ["date", "ac", "orig", "dest", "time", "rb", "nt", "pm", "pw", "pc", "bg", "st"].forEach((k) => {
        if (payload[k] !== null && payload[k] !== undefined) updates[k] = payload[k];
      });
      updates.updated_by_email = editorMeta.updated_by_email || editorMeta.created_by_email || editorMeta.created_by_user_email || null;
      updates.updated_by_name = editorMeta.updated_by_name || editorMeta.created_by_name || editorMeta.created_by_user_name || null;
      updates.updated_at = new Date().toISOString();

      let { error } = await supabase.from("flights").update(updates).eq("id", payload.flight_id);
      if (error && String(error.message || "").includes("schema cache")) {
        const fallback = { ...updates };
        META_FIELDS.forEach((k) => delete fallback[k]);
        ({ error } = await supabase.from("flights").update(fallback).eq("id", payload.flight_id));
      }
      if (error) throw error;
      return { ok: true, message: "Vuelo editado correctamente." };
    }

    case "cancel_flight": {
      const { error } = await supabase
        .from("flights")
        .update({ st: "canc", updated_at: new Date().toISOString() })
        .eq("id", payload.flight_id);
      if (error) throw error;
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
