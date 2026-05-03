import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../_routeProtection.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 30, windowMs: 60_000 } });
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase server env missing" });
  }

  const subscription = req.body?.subscription;
  if (!subscription?.endpoint) return res.status(400).json({ error: "subscription missing" });

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const userId = access?.user?.id || null;
  if (!userId) return res.status(401).json({ error: "Missing authenticated user" });
  const row = {
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys?.p256dh || "",
    auth: subscription.keys?.auth || "",
    subscription_json: subscription,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("push_subscriptions").upsert([row], { onConflict: "endpoint" });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
