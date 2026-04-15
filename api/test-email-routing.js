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
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 20, windowMs: 60_000 } });
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
  return res.status(200).json({
    ok: true,
    verificationOnly: true,
    requestor: preview.requestor,
    eventType: preview.eventType,
    opsRecipients: preview.opsRecipients,
    pilotRecipients: preview.pilotRecipients,
    finalRecipients: preview.finalRecipients,
    routingCheck: "Enrutamiento limitado a Ops/Pilots.",
    explanation: preview.ruleSummary,
  });
}
