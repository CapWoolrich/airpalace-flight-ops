import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase server env missing" });
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return res.status(500).json({ error: "VAPID env missing" });
  }

  let webpush = null;
  try {
    webpush = (await import("web-push")).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  } catch {
    return res.status(200).json({ ok: false, warning: "web-push package unavailable in this environment" });
  }
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (error) return res.status(500).json({ error: error.message });

  const title = req.body?.title || "AirPalace Flight Ops";
  const body = req.body?.body || "Nueva actualización operativa";
  const url = req.body?.url || "/";
  const payload = JSON.stringify({ title, body, url });

  await Promise.all((data || []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch {}
  }));

  return res.status(200).json({ ok: true, sent: (data || []).length });
}
