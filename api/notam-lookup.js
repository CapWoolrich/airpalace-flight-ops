import { requireRouteAccess } from "./_routeProtection.js";

function send(res, status, payload) {
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 20, windowMs: 60_000 } });
  if (!access.ok) return send(res, access.status, { error: access.error });
  const airportCode = String(req.body?.airport_code || "").trim().toUpperCase();
  if (!airportCode || !/^[A-Z]{4}$/.test(airportCode)) {
    return send(res, 400, { error: "airport_code (ICAO de 4 letras) es requerido." });
  }

  const provider = String(process.env.NOTAM_PROVIDER || "none").toLowerCase();
  if (provider === "none") {
    return send(res, 200, {
      live_available: false,
      airport_code: airportCode,
      source: null,
      retrieved_at_utc: new Date().toISOString(),
      items: [],
      note: "No live NOTAM provider configured.",
    });
  }

  // Minimal provider abstraction for official-source integration.
  // Expected provider endpoint should itself read official/primary NOTAM sources.
  if (provider === "proxy") {
    const baseUrl = String(process.env.NOTAM_PROXY_URL || "").trim();
    const apiKey = String(process.env.NOTAM_PROXY_API_KEY || "").trim();
    if (!baseUrl) {
      return send(res, 200, {
        live_available: false,
        airport_code: airportCode,
        source: null,
        retrieved_at_utc: new Date().toISOString(),
        items: [],
        note: "NOTAM provider set to proxy, but NOTAM_PROXY_URL is missing.",
      });
    }

    try {
      const url = `${baseUrl.replace(/\/$/, "")}/notam?icao=${encodeURIComponent(airportCode)}`;
      const r = await fetch(url, {
        headers: apiKey ? { "x-api-key": apiKey } : {},
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return send(res, 502, { error: data?.error || `NOTAM provider error: HTTP ${r.status}` });
      }
      return send(res, 200, {
        live_available: true,
        airport_code: airportCode,
        source: data.source || "Configured NOTAM proxy",
        retrieved_at_utc: data.retrieved_at_utc || new Date().toISOString(),
        items: Array.isArray(data.items) ? data.items : [],
      });
    } catch (e) {
      return send(res, 502, { error: e?.message || "No se pudo consultar el proveedor NOTAM." });
    }
  }

  return send(res, 400, { error: "NOTAM_PROVIDER no soportado. Usa 'none' o 'proxy'." });
}
