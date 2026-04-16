import { createClient } from "@supabase/supabase-js";

// In-memory fixed-window limiter. Ephemeral by design (resets on process restart).
const RATE_LIMIT_STORE = new Map();
const ROLE_ORDER = { viewer: 1, ops: 2, admin: 3 };

function getIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function checkRateLimit(key, max = 40, windowMs = 60_000) {
  const now = Date.now();
  const bucket = RATE_LIMIT_STORE.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  recent.push(now);
  RATE_LIMIT_STORE.set(key, recent);
  return recent.length <= max;
}

function normalizeRole(role) {
  const next = String(role || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_ORDER, next) ? next : "viewer";
}

function hasRoleAtLeast(role, minimumRole) {
  if (!minimumRole) return true;
  return (ROLE_ORDER[normalizeRole(role)] || 0) >= (ROLE_ORDER[normalizeRole(minimumRole)] || 0);
}

export function hasValidInternalSecret(req) {
  const expected = String(process.env.API_INTERNAL_SECRET || "").trim();
  const provided = String(req.headers["x-internal-secret"] || "").trim();
  return !!expected && provided === expected;
}

async function resolveUserRole(userId) {
  if (!userId) return "viewer";
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return "viewer";

  try {
    const service = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "viewer";
    return normalizeRole(data?.role || "viewer");
  } catch {
    return "viewer";
  }
}

export async function requireRouteAccess(req, {
  requireAuth = true,
  requireInternalSecret = false,
  allowInternalSecretBypassAuth = false,
  minimumRole = null,
  rateLimit = { max: 40, windowMs: 60_000 },
} = {}) {
  if (rateLimit) {
    const key = `${getIp(req)}:${req.url || ""}`;
    if (!checkRateLimit(key, rateLimit.max, rateLimit.windowMs)) {
      return { ok: false, status: 429, error: "Too many requests" };
    }
  }

  const internalSecretIsValid = hasValidInternalSecret(req);
  if (requireInternalSecret) {
    if (!internalSecretIsValid) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }
  if (allowInternalSecretBypassAuth && internalSecretIsValid) {
    return { ok: true, internal: true, role: "admin" };
  }

  if (requireAuth) {
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return { ok: false, status: 401, error: "Missing bearer token" };

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishable) {
      return { ok: false, status: 500, error: "Supabase auth env missing" };
    }
    const supabase = createClient(supabaseUrl, publishable);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return { ok: false, status: 401, error: "Invalid auth token" };
    const role = await resolveUserRole(data.user.id);
    if (!hasRoleAtLeast(role, minimumRole)) return { ok: false, status: 403, error: "Insufficient role" };
    return { ok: true, user: data.user, role };
  }

  if (!hasRoleAtLeast("viewer", minimumRole)) return { ok: false, status: 403, error: "Insufficient role" };
  return { ok: true };
}

export function ensureBodyFields(body, fields = []) {
  for (const f of fields) {
    if (body?.[f] === undefined || body?.[f] === null || body?.[f] === "") {
      return { ok: false, error: `${f} is required` };
    }
  }
  return { ok: true };
}
