import { createClient } from "@supabase/supabase-js";
import { buildOpsPush } from "../src/lib/opsNotifications.js";
import { sendOperationalEmail } from "./_emailSender.js";

function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function sendPushToAll(supabase, payload) {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || process.env.VITE_PUBLIC_VAPID_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return { ok: false, warning: "VAPID env missing" };

  let webpush;
  try {
    webpush = (await import("web-push")).default;
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  } catch {
    return { ok: false, warning: "web-push package unavailable" };
  }

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (subsError) throw subsError;

  await Promise.all((subs || []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
    } catch {}
  }));
  return { ok: true, sent: (subs || []).length };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (process.env.CRON_SECRET && req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase server env missing" });
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const today = ymd(now);
  const tomorrowDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const tomorrow = ymd(tomorrowDate);

  const events = [];

  const { data: tomorrowFlights, error: tomorrowErr } = await supabase
    .from("flights")
    .select("id, ac, st, date, time, orig, dest, rb, nt, pm, pw, pc")
    .eq("date", tomorrow)
    .neq("st", "canc")
    .neq("st", "comp")
    .limit(1);
  if (tomorrowErr) throw tomorrowErr;
  if ((tomorrowFlights || []).length) {
    events.push({
      key: `tomorrow_${tomorrow}`,
      ac: tomorrowFlights[0].ac,
      flight: tomorrowFlights[0],
      payload: buildOpsPush("tomorrow_flight", { ac: tomorrowFlights[0].ac }),
    });
  }

  const { data: operationalFlights, error: opErr } = await supabase
    .from("flights")
    .select("id, ac, date, time, st")
    .gte("date", today)
    .neq("st", "canc")
    .neq("st", "comp");
  if (opErr) throw opErr;
  const idx = {};
  (operationalFlights || []).forEach((f) => {
    const k = `${f.ac}|${f.date}|${f.time || "STBY"}`;
    idx[k] = (idx[k] || 0) + 1;
  });
  const conflictKey = Object.keys(idx).find((k) => idx[k] > 1);
  if (conflictKey) {
    const ac = conflictKey.split("|")[0];
    events.push({ key: `conflict_${today}`, ac, payload: buildOpsPush("operational_conflict", { ac }) });
  }

  const sent = [];
  for (const event of events) {
    const { data: existing } = await supabase
      .from("push_notification_events")
      .select("event_key")
      .eq("event_key", event.key)
      .maybeSingle();
    if (existing?.event_key) continue;

    await sendPushToAll(supabase, event.payload);
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
