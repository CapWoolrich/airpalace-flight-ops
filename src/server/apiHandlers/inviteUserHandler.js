import { createClient } from "@supabase/supabase-js";
import { requireRouteAccess } from "../_routeProtection.js";
import { normalizeRole } from "../_rolePermissions.js";

function bad(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  const access = await requireRouteAccess(req, {
    requireAuth: true,
    minimumRole: "admin",
    rateLimit: { max: 15, windowSeconds: 60 },
  });
  if (!access.ok) return bad(res, access.status, access.error);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return bad(res, 500, "Supabase server env missing");

  const email = String(req.body?.email || "").trim().toLowerCase();
  const full_name = String(req.body?.full_name || "").trim();
  const role = normalizeRole(req.body?.role || "viewer");
  if (!email) return bad(res, 400, "email is required");
  if (!["admin", "ops", "viewer"].includes(role)) return bad(res, 400, "role inválido");

  const service = createClient(supabaseUrl, serviceRoleKey);
  const redirectTo = "https://airpalace.app/set-password";

  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name, role },
  });
  if (error) return bad(res, 400, error.message || "No se pudo enviar invitación");

  const userId = data?.user?.id;
  if (userId) {
    await service.from("user_roles").upsert({
      user_id: userId,
      role,
      requires_password_setup: true,
      password_set: false,
      onboarding_completed: false,
      updated_at: new Date().toISOString(),
    });
  }

  return res.status(200).json({ ok: true, message: "Invitación enviada", redirectTo });
}
