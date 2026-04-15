import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "./_routeProtection.js";
import { verifyAiConfirmation } from "./_aiConfirmation.js";

const WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "duplicate_flight", "change_aircraft_status"];
const VALID_AIRCRAFT = new Set(["N35EA", "N540JL"]);
const VALID_AIRCRAFT_STATUSES = new Set(["disponible", "mantenimiento", "aog"]);
const VALID_FLIGHT_STATUSES = new Set(["prog", "enc", "comp", "canc"]);

function bad(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

function ensureSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function validatePayload(action, payload = {}) {
  if (!payload || typeof payload !== "object") return "payload inválido";
  if (payload.ac && !VALID_AIRCRAFT.has(String(payload.ac))) return "Aeronave inválida";
  if (payload.st && !VALID_FLIGHT_STATUSES.has(String(payload.st))) return "Estatus de vuelo inválido";

  if (action === "create_flight") {
    for (const f of ["date", "ac", "orig", "dest", "time", "rb"]) {
      if (!payload[f]) return `${f} es requerido`;
    }
  }
  if (action === "edit_flight" && !payload.flight_id) return "flight_id es requerido";
  if (action === "cancel_flight" && !payload.flight_id) return "flight_id es requerido";
  if (action === "duplicate_flight" && !payload.flight_id) return "flight_id es requerido";
  if (action === "change_aircraft_status") {
    if (!payload.ac) return "ac es requerido";
    if (!payload.status_change || !VALID_AIRCRAFT_STATUSES.has(String(payload.status_change))) {
      return "status_change inválido";
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 20, windowMs: 60_000 } });
  if (!access.ok) return bad(res, access.status, access.error);

  const action = String(req.body?.action || "");
  const payload = req.body?.payload || {};
  const confirmed = req.body?.confirmed === true;
  const token = req.body?.confirmation_token;
  if (!WRITE_ACTIONS.includes(action)) return bad(res, 400, "Acción no permitida");
  if (!confirmed) return bad(res, 400, "Debes confirmar antes de ejecutar");
  const validationError = validatePayload(action, payload);
  if (validationError) return bad(res, 400, validationError);
  if (!verifyAiConfirmation(token, action, payload)) return bad(res, 403, "Confirmación inválida");

  const supabase = ensureSupabase();
  if (!supabase) return bad(res, 500, "Supabase server env missing");

  try {
    if (action === "create_flight") {
      const row = {
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
        creation_source: "ai",
      };
      const { error } = await supabase.from("flights").insert([row]);
      if (error) throw error;
      return res.status(200).json({ ok: true, message: "Vuelo creado correctamente." });
    }

    if (action === "edit_flight") {
      const updates = {};
      ["date", "ac", "orig", "dest", "time", "rb", "nt", "pm", "pw", "pc", "bg", "st"].forEach((k) => {
        if (payload[k] !== null && payload[k] !== undefined) updates[k] = payload[k];
      });
      updates.updated_at = new Date().toISOString();
      const { error } = await supabase.from("flights").update(updates).eq("id", payload.flight_id);
      if (error) throw error;
      return res.status(200).json({ ok: true, message: "Vuelo editado correctamente." });
    }

    if (action === "cancel_flight") {
      const { error } = await supabase
        .from("flights")
        .update({ st: "canc", updated_at: new Date().toISOString() })
        .eq("id", payload.flight_id);
      if (error) throw error;
      return res.status(200).json({ ok: true, message: "Vuelo cancelado correctamente." });
    }

    if (action === "duplicate_flight") {
      const { data, error } = await supabase.from("flights").select("*").eq("id", payload.flight_id).single();
      if (error) throw error;
      const duplicated = {
        ...data,
        id: undefined,
        date: payload.date || data.date,
        time: payload.time || data.time,
        st: "prog",
        created_at: undefined,
        updated_at: new Date().toISOString(),
        creation_source: "ai",
      };
      const { error: insError } = await supabase.from("flights").insert([duplicated]);
      if (insError) throw insError;
      return res.status(200).json({ ok: true, message: "Vuelo duplicado correctamente." });
    }

    const { error } = await supabase.from("aircraft_status").upsert([
      {
        ac: payload.ac,
        status: payload.status_change,
        updated_at: new Date().toISOString(),
      },
    ]);
    if (error) throw error;
    return res.status(200).json({ ok: true, message: "Estado de aeronave actualizado." });
  } catch (e) {
    return bad(res, 500, e?.message || "Error ejecutando acción AI");
  }
}
