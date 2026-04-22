import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../src/server/_routeProtection.js";
import { buildAuditMeta } from "../src/lib/opsMutationBuilders.js";
import { applyOpsMutation } from "../src/lib/opsWriteEngine.js";
import { resolveFlightTarget } from "../src/ai/flightTargetResolver.js";
import { emitAircraftStatusSideEffects, emitFlightSideEffects } from "../src/server/_opsSideEffects.js";
import { validateOpsWritePayload } from "../src/server/_validation.js";

const OPS_WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "duplicate_flight", "change_aircraft_status", "restore_demo"];

const SEED_FLIGHTS = [
  { date: "2026-04-02", ac: "N35EA", orig: "Cozumel", dest: "Merida", time: "08:30", rb: "Jabib C", nt: "", pm: 0, pw: 0, pc: 0, bg: 0, st: "comp" },
  { date: "2026-04-06", ac: "N35EA", orig: "Merida", dest: "Punta Cana", time: "07:00", rb: "Jabib C", nt: "", pm: 2, pw: 1, pc: 0, bg: 100, st: "comp" },
  { date: "2026-04-07", ac: "N35EA", orig: "Punta Cana", dest: "Cozumel", time: "17:00", rb: "Jabib C", nt: "", pm: 2, pw: 1, pc: 0, bg: 100, st: "comp" },
  { date: "2026-04-07", ac: "N35EA", orig: "Cozumel", dest: "Merida", time: "20:00", rb: "Jabib C", nt: "", pm: 0, pw: 0, pc: 0, bg: 0, st: "comp" },
  { date: "2026-04-12", ac: "N35EA", orig: "Merida", dest: "Providenciales", time: "15:00", rb: "Direccion", nt: "", pm: 3, pw: 1, pc: 0, bg: 150, st: "prog" },
  { date: "2026-04-12", ac: "N35EA", orig: "Providenciales", dest: "Kingston", time: "STBY", rb: "Direccion", nt: "", pm: 3, pw: 1, pc: 0, bg: 150, st: "prog" },
  { date: "2026-04-12", ac: "N540JL", orig: "Orlando MCO", dest: "Merida", time: "STBY", rb: "Mantenimiento", nt: "Ferry", pm: 0, pw: 0, pc: 0, bg: 0, st: "prog" },
  { date: "2026-04-15", ac: "N540JL", orig: "Merida", dest: "Puebla", time: "08:00", rb: "Omar C", nt: "", pm: 3, pw: 2, pc: 0, bg: 200, st: "prog" },
  { date: "2026-04-15", ac: "N540JL", orig: "Puebla", dest: "Merida", time: "15:00", rb: "Omar C", nt: "", pm: 3, pw: 2, pc: 0, bg: 200, st: "prog" },
  { date: "2026-04-27", ac: "N540JL", orig: "Merida", dest: "Cancun", time: "07:00", rb: "Jabib C", nt: "", pm: 0, pw: 0, pc: 0, bg: 0, st: "prog" },
  { date: "2026-04-28", ac: "N540JL", orig: "Cancun", dest: "Miami MIA", time: "16:00", rb: "Gibran C", nt: "", pm: 2, pw: 0, pc: 0, bg: 0, st: "prog" },
  { date: "2026-04-30", ac: "N35EA", orig: "Merida", dest: "Punta Cana", time: "09:00", rb: "Jabib C", nt: "", pm: 3, pw: 2, pc: 1, bg: 250, st: "prog" },
  { date: "2026-05-05", ac: "N35EA", orig: "Punta Cana", dest: "Merida", time: "09:00", rb: "Jabib C", nt: "Via Cozumel", pm: 3, pw: 2, pc: 1, bg: 250, st: "prog" },
];

const SEED_MAINT = { N35EA: "disponible", N540JL: "disponible" };

function bad(res, status, error, extras = {}) {
  return res.status(status).json({ ok: false, error, ...extras });
}

function ensureSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function restoreDemoData(supabase, audit) {
  await supabase.from("flights").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const flightRows = SEED_FLIGHTS.map((f) => ({ ...f, ...audit, creation_source: "restore_demo" }));
  const { error: flightsError } = await supabase.from("flights").insert(flightRows);
  if (flightsError) throw flightsError;

  const maintRows = Object.entries(SEED_MAINT).map(([ac, status]) => ({
    ac,
    status,
    updated_at: new Date().toISOString(),
    maintenance_start_date: null,
    maintenance_end_date: null,
  }));
  const { error: maintError } = await supabase.from("aircraft_status").upsert(maintRows);
  if (maintError) throw maintError;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const action = String(req.body?.action || "");
  if (!OPS_WRITE_ACTIONS.includes(action)) return bad(res, 400, "Acción no permitida");

  const access = await requireRouteAccess(req, {
    requireAuth: true,
    minimumRole: action === "restore_demo" ? "admin" : "ops",
    rateLimit: { max: 25, windowSeconds: 60 },
  });
  if (!access.ok) return bad(res, access.status, access.error);

  const payload = req.body?.payload || {};
  const payloadValidation = validateOpsWritePayload(action, payload);
  if (!payloadValidation.ok) return bad(res, 400, payloadValidation.error);

  const supabase = ensureSupabase();
  if (!supabase) return bad(res, 500, "Supabase server env missing");

  const actorName = access.user?.user_metadata?.name || access.user?.email || "Operaciones";
  const audit = buildAuditMeta({
    source: "manual",
    actorEmail: access.user?.email || "",
    actorName,
    actorUserId: access.user?.id || "",
  });

  try {
    if (action === "restore_demo") {
      if (String(process.env.VITE_ENABLE_DEMO_SEED || "").toLowerCase() !== "true") {
        return bad(res, 403, "La restauración demo está deshabilitada en este entorno");
      }
      await restoreDemoData(supabase, audit);
      return res.status(200).json({ ok: true, message: "Datos demo restaurados." });
    }

    const sideEffectWarnings = [];
    const mutation = await applyOpsMutation({
      db: supabase,
      action,
      payload,
      audit,
      resolveFlight: async (targetPayload, targetAction) => resolveFlightTarget({
        db: supabase,
        payload: targetPayload,
        action: targetAction,
        limit: 25,
      }),
    });
    sideEffectWarnings.push(...(mutation.warnings || []));

    if (mutation.error === "flight_not_resolved") {
      if (!mutation.candidates?.length) return bad(res, 400, mutation.message);
      if (mutation.candidates.length > 1) {
        return bad(res, 409, mutation.message, { candidates: mutation.candidates.slice(0, 5) });
      }
      return bad(res, 400, "No pude resolver el vuelo objetivo.");
    }

    if (["create_flight", "edit_flight", "cancel_flight", "duplicate_flight"].includes(action)) {
      const eventTypeMap = { create_flight: "create", edit_flight: "edit", cancel_flight: "cancel", duplicate_flight: "duplicate" };
      const sideEffects = await emitFlightSideEffects({
        supabase,
        eventType: eventTypeMap[action],
        flight: mutation.flight,
        actorName,
        sendWhatsapp: action === "cancel_flight",
      });
      sideEffectWarnings.push(...(sideEffects.warnings || []));
      const messageMap = {
        create_flight: "Vuelo creado correctamente.",
        edit_flight: "Vuelo editado correctamente.",
        cancel_flight: "Vuelo cancelado correctamente.",
        duplicate_flight: "Vuelo duplicado correctamente.",
      };
      return res.status(200).json({
        ok: true,
        message: messageMap[action],
        flight: mutation.flight,
        ...(sideEffectWarnings.length ? { side_effect_warnings: sideEffectWarnings } : {}),
      });
    }

    const statusEffects = await emitAircraftStatusSideEffects({
      supabase,
      ac: mutation.aircraftStatus.ac,
      status: mutation.aircraftStatus.status,
      maintenanceEndDate: mutation.aircraftStatus.maintenance_end_date,
      actorName,
    });
    sideEffectWarnings.push(...(statusEffects.warnings || []));
    return res.status(200).json({
      ok: true,
      message: "Estado de aeronave actualizado.",
      aircraftStatus: mutation.aircraftStatus,
      ...(sideEffectWarnings.length ? { side_effect_warnings: sideEffectWarnings } : {}),
    });
  } catch (e) {
    return bad(res, 500, e?.message || "Error ejecutando escritura operativa");
  }
}
