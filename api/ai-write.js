import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "./_routeProtection.js";
import { verifyAiConfirmation } from "./_aiConfirmation.js";
import {
  buildAircraftStatusMutation,
  buildAuditMeta,
  withFlightCreateMeta,
  withFlightUpdateMeta,
} from "../src/lib/opsMutationBuilders.js";

const WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "duplicate_flight", "change_aircraft_status"];
const VALID_AIRCRAFT = new Set(["N35EA", "N540JL"]);
const VALID_AIRCRAFT_STATUSES = new Set(["disponible", "mantenimiento", "aog"]);
const VALID_FLIGHT_STATUSES = new Set(["prog", "enc", "comp", "canc"]);

function bad(res, status, error, extras = {}) {
  return res.status(status).json({ ok: false, error, ...extras });
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
  if (action === "change_aircraft_status") {
    if (!payload.ac) return "ac es requerido";
    if (!payload.status_change || !VALID_AIRCRAFT_STATUSES.has(String(payload.status_change))) {
      return "status_change inválido";
    }
  }
  return null;
}

function cleanText(v) {
  return String(v || "").trim().toLowerCase();
}

async function resolveFlightId(supabase, action, payload = {}) {
  if (payload.flight_id) return { flightId: payload.flight_id, candidates: [] };

  const filters = {
    date: payload.date || null,
    ac: payload.ac || null,
    orig: payload.orig || null,
    dest: payload.dest || null,
    rb: payload.rb || null,
    time: payload.time || null,
  };

  const hasAnyFilter = Object.values(filters).some(Boolean);
  if (!hasAnyFilter) return { flightId: null, candidates: [] };

  let query = supabase
    .from("flights")
    .select("id, date, time, ac, orig, dest, rb, st")
    .neq("st", "canc")
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(25);

  if (filters.date) query = query.eq("date", filters.date);
  if (filters.ac) query = query.eq("ac", filters.ac);
  if (filters.orig) query = query.ilike("orig", filters.orig);
  if (filters.dest) query = query.ilike("dest", filters.dest);

  const { data, error } = await query;
  if (error) throw error;

  let candidates = (data || []).filter((f) => {
    if (filters.rb && cleanText(f.rb) !== cleanText(filters.rb)) return false;
    if (filters.time && String(f.time || "") !== String(filters.time || "")) return false;
    return true;
  });

  if (action === "cancel_flight") {
    candidates = candidates.filter((f) => String(f.st || "") !== "canc");
  }

  if (candidates.length === 1) return { flightId: candidates[0].id, candidates };
  return { flightId: null, candidates };
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
  if (!verifyAiConfirmation(token, action, payload)) return bad(res, 403, "Confirmación inválida");

  const validationError = validatePayload(action, payload);
  if (validationError) return bad(res, 400, validationError);

  const supabase = ensureSupabase();
  if (!supabase) return bad(res, 500, "Supabase server env missing");

  const audit = buildAuditMeta({
    source: "ai",
    actorEmail: access.user?.email || "",
    actorName: access.user?.user_metadata?.name || access.user?.email || "AI Agent",
    actorUserId: access.user?.id || "",
  });

  try {
    if (action === "create_flight") {
      const row = withFlightCreateMeta({
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
      }, audit);
      const { error } = await supabase.from("flights").insert([row]);
      if (error) throw error;
      return res.status(200).json({ ok: true, message: "Vuelo creado correctamente." });
    }

    if (action === "edit_flight" || action === "cancel_flight" || action === "duplicate_flight") {
      const resolved = await resolveFlightId(supabase, action, payload);
      const flightId = payload.flight_id || resolved.flightId;

      if (!flightId) {
        if (!resolved.candidates.length) return bad(res, 400, "No encontré un vuelo que coincida para editar/cancelar.");
        if (resolved.candidates.length > 1) {
          return bad(res, 409, "Referencia ambigua: encontré múltiples vuelos. Agrega fecha/hora/aeronave para continuar.", {
            candidates: resolved.candidates.slice(0, 5),
          });
        }
        return bad(res, 400, "No pude resolver el vuelo objetivo.");
      }

      if (action === "edit_flight") {
        const updates = {};
        ["date", "ac", "orig", "dest", "time", "rb", "nt", "pm", "pw", "pc", "bg", "st"].forEach((k) => {
          if (payload[k] !== null && payload[k] !== undefined) updates[k] = payload[k];
        });
        const { error } = await supabase.from("flights").update(withFlightUpdateMeta(updates, audit)).eq("id", flightId);
        if (error) throw error;
        return res.status(200).json({ ok: true, message: "Vuelo editado correctamente." });
      }

      if (action === "cancel_flight") {
        const { error } = await supabase
          .from("flights")
          .update(withFlightUpdateMeta({ st: "canc" }, audit))
          .eq("id", flightId);
        if (error) throw error;
        return res.status(200).json({ ok: true, message: "Vuelo cancelado correctamente." });
      }

      const { data, error } = await supabase.from("flights").select("*").eq("id", flightId).single();
      if (error) throw error;
      const duplicated = withFlightCreateMeta({
        ...data,
        id: undefined,
        date: payload.date || data.date,
        time: payload.time || data.time,
        st: "prog",
        created_at: undefined,
      }, audit);
      const { error: insError } = await supabase.from("flights").insert([duplicated]);
      if (insError) throw insError;
      return res.status(200).json({ ok: true, message: "Vuelo duplicado correctamente." });
    }

    const { error } = await supabase.from("aircraft_status").upsert([
      buildAircraftStatusMutation(payload, audit),
    ]);
    if (error) throw error;
    return res.status(200).json({ ok: true, message: "Estado de aeronave actualizado." });
  } catch (e) {
    return bad(res, 500, e?.message || "Error ejecutando acción AI");
  }
}
