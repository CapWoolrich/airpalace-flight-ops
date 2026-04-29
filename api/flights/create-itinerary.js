import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../../src/server/_routeProtection.js";
import { buildAuditMeta, buildCreateFlightMutation } from "../../src/lib/opsMutationBuilders.js";
import { localDateTimeToUtcMs, normalizeDateIso, parseTimeToMinutes, resolveAirportTimezone } from "../../src/lib/timezones.js";
import { sendOperationalEmail } from "../../src/server/_emailSender.js";
import { buildItineraryEmail } from "../../src/server/_emailTemplate.js";
import { buildItineraryCalendarInvite } from "../../src/server/_calendarInvite.js";

function bad(res, status, error, extras = {}) { return res.status(status).json({ ok: false, error, ...extras }); }
function ensureSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  const access = await requireRouteAccess(req, { requireAuth: true, minimumRole: "ops", rateLimit: { max: 15, windowSeconds: 60 } });
  if (!access.ok) return bad(res, access.status, access.error);

  const supabase = ensureSupabase();
  if (!supabase) return bad(res, 500, "Supabase server env missing");

  const body = req.body || {};
  const legs = Array.isArray(body.legs) ? body.legs : [];
  if (legs.length < 2) return bad(res, 400, "El itinerario requiere al menos 2 tramos.");

  const actorName = access.user?.user_metadata?.name || access.user?.email || "Operaciones";
  const audit = buildAuditMeta({ source: "manual", actorEmail: access.user?.email || "", actorName, actorUserId: access.user?.id || "" });
  const itineraryGroupId = crypto.randomUUID();
  const totalLegs = legs.length;
  const routeSummary = String(body.routeSummary || "").trim() || legs.map((l, i) => (i === 0 ? `${l.origin || "-"} → ${l.destination || "-"}` : `${l.destination || "-"}`)).join(" → ");

  const normalizedLegs = [];
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i] || {};
    const orig = String(leg.origin || "").trim();
    const dest = String(leg.destination || "").trim();
    const date = normalizeDateIso(leg.departureDate || leg.date || body.date);
    const time = String(leg.departureTime || leg.time || "").trim();
    if (!orig || !dest || !date || !time) return bad(res, 400, `Tramo ${i + 1} incompleto.`);
    const depMin = parseTimeToMinutes(time);
    if (!Number.isFinite(depMin)) return bad(res, 400, `Hora inválida en tramo ${i + 1}.`);
    const tz = resolveAirportTimezone(orig, { fallbackTimeZone: "America/Merida" }).timeZone;
    const depMs = localDateTimeToUtcMs(date, depMin, tz);
    const block = Math.max(30, Number(leg.block_minutes || leg.blockMinutes || 60));
    const arrMs = depMs + block * 60 * 1000;
    if (i > 0 && depMs < normalizedLegs[i - 1].arrMs) return bad(res, 400, `La salida del tramo ${i + 1} es anterior a la llegada estimada del tramo previo.`);
    normalizedLegs.push({ leg, orig, dest, date, time, depMs, arrMs, block });
  }

  const insertedIds = [];
  const insertedFlights = [];
  try {
    for (let i = 0; i < normalizedLegs.length; i += 1) {
      const item = normalizedLegs[i];
      const payload = {
        date: item.date,
        ac: body.aircraft || body.ac || item.leg.aircraft,
        orig: item.orig,
        dest: item.dest,
        time: item.time,
        rb: body.requestedBy || body.rb || item.leg.requestedBy,
        nt: item.leg.notes || item.leg.nt || "",
        pm: Number(item.leg.pm ?? item.leg.pax ?? 0),
        pw: Number(item.leg.pw || 0),
        pc: Number(item.leg.pc || 0),
        bg: Number(item.leg.bg || 0),
        st: item.leg.status || "prog",
        block_minutes: item.block,
        itinerary_group_id: itineraryGroupId,
        leg_sequence: i + 1,
        total_legs: totalLegs,
        route_summary: routeSummary,
        suppress_individual_notifications: true,
      };
      const row = buildCreateFlightMutation(payload, audit);
      const { data, error } = await supabase.from("flights").insert([row]).select("*").single();
      if (error) throw error;
      insertedIds.push(data.id);
      insertedFlights.push(data);
    }

    const itineraryPayload = { ac: body.aircraft || body.ac, rb: body.requestedBy || body.rb, routeSummary, itineraryGroupId, legs: insertedFlights };
    await sendOperationalEmail({ eventType: "flight_created", payload: itineraryPayload, templateOverride: buildItineraryEmail(itineraryPayload), attachmentsOverride: [buildItineraryCalendarInvite(itineraryPayload)].filter(Boolean) });

    return res.status(200).json({ ok: true, success: true, itineraryGroupId, flightIds: insertedIds, flights: insertedFlights });
  } catch (e) {
    if (insertedIds.length) await supabase.from("flights").delete().in("id", insertedIds);
    return bad(res, 500, e?.message || "Error creando itinerario");
  }
}
