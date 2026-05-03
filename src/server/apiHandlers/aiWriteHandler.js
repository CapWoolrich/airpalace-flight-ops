import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../_routeProtection.js";
import { verifyAiConfirmation } from "../_aiConfirmation.js";
import { buildAuditMeta } from "../../lib/opsMutationBuilders.js";
import { applyOpsMutation } from "../../lib/opsWriteEngine.js";
import { resolveFlightTarget } from "../../ai/flightTargetResolver.js";
import { emitAircraftStatusSideEffects, emitFlightSideEffects } from "../_opsSideEffects.js";
import { validateAiWritePayload } from "../_validation.js";
import { canCancelFlights, canCreateFlights, canEditFlights, canOperateFlights } from "../_rolePermissions.js";

const WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "duplicate_flight", "change_aircraft_status"];
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
  const access = await requireRouteAccess(req, {
    requireAuth: true,
    minimumRole: "ops",
    rateLimit: { max: 20, windowSeconds: 60 },
  });
  if (!access.ok) return bad(res, access.status, access.error);

  const action = String(req.body?.action || "");
  const payload = req.body?.payload || {};
  const confirmed = req.body?.confirmed === true;
  const token = req.body?.confirmation_token;

  const bodyValidation = validateAiWritePayload(req.body || {});
  if (!bodyValidation.ok) return bad(res, 400, bodyValidation.error);
  if (!WRITE_ACTIONS.includes(action)) return bad(res, 400, "Acción no permitida");
  if (!confirmed) return bad(res, 400, "Debes confirmar antes de ejecutar");
  if (!verifyAiConfirmation(token, action, payload)) return bad(res, 403, "Confirmación inválida");

  const role = access.role;
  if (action === "create_flight" && !canCreateFlights(role)) return bad(res, 403, "Acción no permitida");
  if (action === "edit_flight" && !canEditFlights(role)) return bad(res, 403, "Acción no permitida");
  if (action === "cancel_flight" && !canCancelFlights(role)) return bad(res, 403, "Acción no permitida");
  if (action === "duplicate_flight" && !canEditFlights(role)) return bad(res, 403, "Acción no permitida");
  if (action === "change_aircraft_status" && !canOperateFlights(role)) return bad(res, 403, "Acción no permitida");

  const supabase = ensureSupabase();
  if (!supabase) return bad(res, 500, "Supabase server env missing");

  const audit = buildAuditMeta({
    source: "ai",
    actorEmail: access.user?.email || "",
    actorName: access.user?.user_metadata?.name || access.user?.email || "AI Agent",
    actorUserId: access.user?.id || "",
  });

  try {
    const sideEffectWarnings = [];
    const actorName = access.user?.user_metadata?.name || access.user?.email || "AI Agent";

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
      });
      sideEffectWarnings.push(...(sideEffects.warnings || []));
      const messageMap = {
        create_flight: "Vuelo creado correctamente.",
        edit_flight: "Vuelo editado correctamente.",
        cancel_flight: "Vuelo cancelado correctamente.",
        duplicate_flight: "Vuelo duplicado correctamente.",
      };
      return res.status(200).json({ ok: true, message: messageMap[action], ...(sideEffectWarnings.length ? { side_effect_warnings: sideEffectWarnings } : {}) });
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
      ...(sideEffectWarnings.length ? { side_effect_warnings: sideEffectWarnings } : {}),
    });
  } catch (e) {
    return bad(res, 500, e?.message || "Error ejecutando acción AI");
  }
}
