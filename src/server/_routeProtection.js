import { createClient } from "@supabase/supabase-js";

const RATE = new Map();

function getIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function checkRateLimit(key, max = 40, windowMs = 60_000) {
  const now = Date.now();
  const bucket = RATE.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  recent.push(now);
  RATE.set(key, recent);
  return recent.length <= max;
}

export async function requireRouteAccess(req, {
  requireAuth = true,
  requireInternalSecret = false,
  rateLimit = { max: 40, windowMs: 60_000 },
} = {}) {
  if (rateLimit) {
    const key = `${getIp(req)}:${req.url || ""}`;
    if (!checkRateLimit(key, rateLimit.max, rateLimit.windowMs)) {
      return { ok: false, status: 429, error: "Too many requests" };
    }
  }

  if (requireInternalSecret) {
    const expected = String(process.env.API_INTERNAL_SECRET || "").trim();
    const provided = String(req.headers["x-internal-secret"] || "").trim();
    if (!expected || provided !== expected) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
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
    return { ok: true, user: data.user };
  }

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
