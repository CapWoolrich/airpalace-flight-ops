import { computeEmailRecipients } from "./_emailRecipients.js";
import { requireRouteAccess } from "./_routeProtection.js";

const ALLOWED_EVENTS = [
  "flight_created",
  "flight_updated",
  "flight_cancelled",
  "aircraft_aog",
  "aircraft_maintenance",
  "operational_conflict",
  "tomorrow_flight_reminder",
];

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }
  const isProd = process.env.NODE_ENV === "production";
  const access = await requireRouteAccess(req, {
    requireAuth: true,
    requireInternalSecret: isProd,
    rateLimit: { max: 20, windowMs: 60_000 },
  });
  if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

  const requestor = String(req.body?.requestor || req.query?.requestor || "").trim();
  const eventType = String(req.body?.eventType || req.query?.eventType || "flight_created").trim();

  if (!requestor) {
    return res.status(400).json({ ok: false, error: "requestor es requerido para verificar el enrutamiento." });
  }
  if (!ALLOWED_EVENTS.includes(eventType)) {
    return res.status(400).json({
      ok: false,
      error: "eventType inválido para prueba de enrutamiento.",
      allowedEventTypes: ALLOWED_EVENTS,
    });
  }

  // Verificación segura: no envía correo, solo calcula destinatarios.
  const preview = computeEmailRecipients({ eventType, requestor, env: process.env });
  const response = {
    ok: true,
    verificationOnly: true,
    requestor: preview.requestor,
    eventType: preview.eventType,
    routingCheck: "Enrutamiento limitado a Ops/Pilots.",
    explanation: preview.ruleSummary,
  };
  if (isProd) {
    return res.status(200).json({
      ...response,
      recipientsRedacted: true,
      opsRecipientsCount: Array.isArray(preview.opsRecipients) ? preview.opsRecipients.length : 0,
      pilotRecipientsCount: Array.isArray(preview.pilotRecipients) ? preview.pilotRecipients.length : 0,
      finalRecipientsCount: Array.isArray(preview.finalRecipients) ? preview.finalRecipients.length : 0,
    });
  }
  return res.status(200).json({
    ...response,
    opsRecipients: preview.opsRecipients,
    pilotRecipients: preview.pilotRecipients,
    finalRecipients: preview.finalRecipients,
  });
}
