import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../src/server/routeProtection.js";
import { getWebPushClient, sendPushBatch } from "../src/server/push.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 20, windowMs: 60_000 } });
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase server env missing" });
  }
  const pushClient = await getWebPushClient();
  if (!pushClient.ok) {
    return res.status(500).json({ error: "VAPID env missing (need VAPID_PUBLIC_KEY/VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)" });
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (error) return res.status(500).json({ error: error.message });

  const title = req.body?.title || "AirPalace Flight Ops";
  const body = req.body?.body || "Nueva actualización operativa";
  const url = req.body?.url || "/";
  const payload = JSON.stringify({ title, body, url });

  const pushResult = await sendPushBatch(pushClient.webpush, data || [], { title, body, url });
  if (pushResult.invalidEndpoints.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", pushResult.invalidEndpoints);
  }

  return res.status(200).json({ ok: true, sent: pushResult.sent, failed: pushResult.failed });
}
