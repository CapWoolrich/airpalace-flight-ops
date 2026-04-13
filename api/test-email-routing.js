import { computeEmailRecipients } from "./_emailRecipients.js";

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
    ownerRecipient: preview.ownerRecipient,
    opsRecipients: preview.opsRecipients,
    pilotRecipients: preview.pilotRecipients,
    finalRecipients: preview.finalRecipients,
    ownerRuleCheck: preview.ownerRecipient
      ? "Incluye solo el owner mapeado del requestor."
      : "No se incluyó owner por falta de mapeo o por regla del evento.",
    explanation: preview.ruleSummary,
  });
}
