import { createClient } from "@supabase/supabase-js";
import { buildOpsPush } from "../src/lib/opsNotifications.js";
import { sendOperationalEmail } from "../src/server/_emailSender.js";
import { detectFlightConflicts } from "../src/ai/conflictUtils.js";
import { getOperationalTodayISO, getOperationalTomorrowISO } from "../src/ai/operationalDate.js";
import { getWebPushClient, sendPushBatch } from "../src/server/_push.js";

async function sendPushToAll(supabase, payload, pushClient) {
  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (subsError) throw subsError;

  const pushResult = await sendPushBatch(pushClient.webpush, subs || [], payload);
  if (pushResult.invalidEndpoints.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", pushResult.invalidEndpoints);
  }
  return { ok: true, sent: pushResult.sent, failed: pushResult.failed };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (!cronSecret) {
    return res.status(500).json({ error: "CRON_SECRET missing" });
  }
  const providedCronSecret = String(req.headers["x-cron-secret"] || "").trim();
  if (providedCronSecret !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase server env missing" });
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const pushClient = await getWebPushClient();
  const today = getOperationalTodayISO();
  const tomorrow = getOperationalTomorrowISO();

  const events = [];

  const { data: tomorrowFlights, error: tomorrowErr } = await supabase
    .from("flights")
    .select("id, ac, st, date, time, orig, dest, rb, nt, pm, pw, pc")
    .eq("date", tomorrow)
    .neq("st", "canc")
    .neq("st", "comp")
    .order("time", { ascending: true })
    .limit(25);
  if (tomorrowErr) throw tomorrowErr;
  (tomorrowFlights || []).forEach((f) => {
    events.push({
      key: `tomorrow_${tomorrow}_${f.id}`,
      ac: f.ac,
      flight: f,
      payload: buildOpsPush("tomorrow_flight", f),
    });
  });

  const { data: operationalFlights, error: opErr } = await supabase
    .from("flights")
    .select("id, ac, date, time, st")
    .gte("date", today)
    .neq("st", "canc")
    .neq("st", "comp");
  if (opErr) throw opErr;
  const conflicts = detectFlightConflicts(operationalFlights || [], {
    activeStatuses: ["prog", "enc"],
    dateRange: { start: today, end: "9999-12-31" },
  });
  const conflictAircraft = Array.from(new Set(conflicts.map((c) => c.ac))).filter(Boolean);
  conflictAircraft.forEach((ac) => {
    events.push({ key: `conflict_${today}_${ac}`, ac, payload: buildOpsPush("operational_conflict", { ac }) });
  });

  const sent = [];
  for (const event of events) {
    const { data: existing } = await supabase
      .from("push_notification_events")
      .select("event_key")
      .eq("event_key", event.key)
      .maybeSingle();
    if (existing?.event_key) continue;

    if (pushClient.ok) {
      await sendPushToAll(supabase, event.payload, pushClient);
    }
    if (event.key.startsWith("tomorrow_")) {
      await sendOperationalEmail({
        eventType: "tomorrow_flight_reminder",
        payload: { event_label: "Vuelo de mañana", ...(event.flight || {}), ac: event.ac || "Aeronave", date: tomorrow },
      });
    }
    if (event.key.startsWith("conflict_")) {
      await sendOperationalEmail({
        eventType: "operational_conflict",
        payload: { event_label: "Conflicto operativo", ac: event.ac || "Aeronave", date: today },
      });
    }
    await supabase.from("push_notification_events").insert([{ event_key: event.key }]);
    sent.push(event.key);
  }

  return res.status(200).json({ ok: true, today, tomorrow, sent });
}
