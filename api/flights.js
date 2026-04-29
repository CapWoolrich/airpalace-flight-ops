import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../src/server/_routeProtection.js";
import { buildAuditMeta } from "../src/lib/opsMutationBuilders.js";
import { applyOpsMutation } from "../src/lib/opsWriteEngine.js";
import { resolveFlightTarget } from "../src/ai/flightTargetResolver.js";
import { emitAircraftStatusSideEffects, emitFlightSideEffects } from "../src/server/_opsSideEffects.js";
import { sendOperationalEmail } from "../src/server/_emailSender.js";
import { buildItineraryEmail } from "../src/server/_emailTemplate.js";
import { buildItineraryCalendarInvite } from "../src/server/_calendarInvite.js";
import { localDateTimeToUtcMs, normalizeDateIso, parseTimeToMinutes, resolveAirportTimezone } from "../src/lib/timezones.js";
import { buildCreateFlightMutation } from "../src/lib/opsMutationBuilders.js";
import { validateOpsWritePayload } from "../src/server/_validation.js";

const OPS_WRITE_ACTIONS = ["create_flight", "edit_flight", "cancel_flight", "duplicate_flight", "change_aircraft_status", "restore_demo", "create_itinerary", "create-itinerary"];
const ACTION_ALIASES = { "create-itinerary": "create_itinerary" };

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


async function createItinerary({ supabase, payload, audit, actorName }) {
  const legs = Array.isArray(payload.legs) ? payload.legs : [];
  if (legs.length < 2) throw new Error("El itinerario requiere al menos 2 tramos.");
  const itineraryGroupId = crypto.randomUUID();
  const totalLegs = legs.length;
  const routeSummary = String(payload.routeSummary || "").trim() || legs.map((l, i) => (i === 0 ? `${l.origin || "-"} → ${l.destination || "-"}` : `${l.destination || "-"}`)).join(" → ");
  const normalizedLegs = [];
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i] || {};
    const orig = String(leg.origin || "").trim();
    const dest = String(leg.destination || "").trim();
    const date = normalizeDateIso(leg.departureDate || leg.date || payload.date);
    const time = String(leg.departureTime || leg.time || "").trim();
    if (!orig || !dest || !date || !time) throw new Error(`Tramo ${i + 1} incompleto.`);
    const depMin = parseTimeToMinutes(time);
    if (!Number.isFinite(depMin)) throw new Error(`Hora inválida en tramo ${i + 1}.`);
    const tz = resolveAirportTimezone(orig, { fallbackTimeZone: "America/Merida" }).timeZone;
    const depMs = localDateTimeToUtcMs(date, depMin, tz);
    const block = Math.max(30, Number(leg.block_minutes || leg.blockMinutes || 60));
    const arrMs = depMs + block * 60 * 1000;
    if (i > 0 && depMs < normalizedLegs[i - 1].arrMs) throw new Error(`La salida del tramo ${i + 1} es anterior a la llegada estimada del tramo previo.`);
    normalizedLegs.push({ leg, orig, dest, date, time, block, arrMs });
  }

  const insertedIds = [];
  const insertedFlights = [];
  try {
    for (let i = 0; i < normalizedLegs.length; i += 1) {
      const item = normalizedLegs[i];
      const row = buildCreateFlightMutation({
        date: item.date, ac: payload.aircraft || payload.ac || item.leg.aircraft, orig: item.orig, dest: item.dest,
        time: item.time, rb: payload.requestedBy || payload.rb || item.leg.requestedBy, nt: item.leg.notes || item.leg.nt || "",
        pm: Number(item.leg.pm ?? item.leg.pax ?? 0), pw: Number(item.leg.pw || 0), pc: Number(item.leg.pc || 0), bg: Number(item.leg.bg || 0),
        st: item.leg.status || "prog", itinerary_group_id: itineraryGroupId, leg_sequence: i + 1,
        total_legs: totalLegs, route_summary: routeSummary, suppress_individual_notifications: true,
      }, audit);
      const { data, error } = await supabase.from("flights").insert([row]).select("*").single();
      if (error) throw error;
      insertedIds.push(data.id); insertedFlights.push(data);
    }
    const itineraryPayload = { ac: payload.aircraft || payload.ac, rb: payload.requestedBy || payload.rb, routeSummary, itineraryGroupId, legs: insertedFlights };
    await sendOperationalEmail({ eventType: "flight_created", payload: itineraryPayload, templateOverride: buildItineraryEmail(itineraryPayload), attachmentsOverride: [buildItineraryCalendarInvite(itineraryPayload)].filter(Boolean) });
    return { itineraryGroupId, flightIds: insertedIds, flights: insertedFlights };
  } catch (e) {
    if (insertedIds.length) await supabase.from("flights").delete().in("id", insertedIds);
    throw e;
  }
}
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

  const rawAction = String(req.body?.action || "");
  const action = ACTION_ALIASES[rawAction] || rawAction;
  if (!OPS_WRITE_ACTIONS.includes(rawAction) && !OPS_WRITE_ACTIONS.includes(action)) {
    return bad(res, 400, "Acción no permitida", { receivedAction: rawAction, allowedActions: OPS_WRITE_ACTIONS });
  }

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
    if (action === "create_itinerary") {
      const itinerary = await createItinerary({ supabase, payload, audit, actorName });
      return res.status(200).json({ ok: true, success: true, itineraryGroupId: itinerary.itineraryGroupId, flightIds: itinerary.flightIds, flights: itinerary.flights, message: "Itinerario creado correctamente." });
    }

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
