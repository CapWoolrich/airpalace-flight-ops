import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../src/server/_routeProtection.js";
import { emitAircraftStatusSideEffects, emitFlightSideEffects } from "../src/server/_opsSideEffects.js";

function bad(res, status, error, extras = {}) {
  return res.status(status).json({ ok: false, error, ...extras });
}

function ensureSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 30, windowMs: 60_000 } });
  if (!access.ok) return bad(res, access.status, access.error);

  const supabase = ensureSupabase();
  if (!supabase) return bad(res, 500, "Supabase server env missing");

  const eventType = String(req.body?.eventType || "");
  const payload = req.body?.payload || {};
  const actorName = payload.actorName || access.user?.user_metadata?.name || access.user?.email || "Sistema";

  try {
    if (["flight_create", "flight_edit", "flight_cancel", "flight_duplicate"].includes(eventType)) {
      const map = {
        flight_create: "create",
        flight_edit: "edit",
        flight_cancel: "cancel",
        flight_duplicate: "duplicate",
      };
      const effects = await emitFlightSideEffects({
        supabase,
        eventType: map[eventType],
        flight: payload.flight,
        actorName,
        sendWhatsapp: payload.sendWhatsapp !== false && eventType !== "flight_cancel",
      });
      return res.status(200).json({ ok: true, warnings: effects.warnings || [] });
    }

    if (eventType === "aircraft_status") {
      const effects = await emitAircraftStatusSideEffects({
        supabase,
        ac: payload.ac,
        status: payload.status,
        maintenanceEndDate: payload.maintenanceEndDate,
        actorName,
      });
      return res.status(200).json({ ok: true, warnings: effects.warnings || [] });
    }

    return bad(res, 400, "eventType inválido");
  } catch (e) {
    return bad(res, 500, e?.message || "Error enviando efectos operativos");
  }
}
