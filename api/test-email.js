import { sendOperationalEmail } from "./_emailSender.js";
import { computeEmailRecipients } from "./_emailRecipients.js";
import { requireRouteAccess } from "./_routeProtection.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && req.method === "GET") {
    return res.status(404).json({ error: "Not found" });
  }
  const access = await requireRouteAccess(req, {
    requireAuth: true,
    requireInternalSecret: isProd,
    rateLimit: { max: 8, windowMs: 60_000 },
  });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const requestor = String(req.body?.requestor || req.query?.requestor || "Jabib C");
  const routingPreview = computeEmailRecipients({
    eventType: "flight_created",
    requestor,
    env: process.env,
  });
  const recipients = routingPreview.finalRecipients;

  const result = await sendOperationalEmail({
    eventType: "flight_created",
    payload: {
      date: new Date().toISOString().slice(0, 10),
      ac: "N540JL",
      orig: "Mérida",
      dest: "Cozumel",
      time: "09:00",
      rb: requestor,
      notes: "Correo de validación de Resend",
      actor: "Sistema",
    },
    recipientsOverride: recipients,
  });

  if (!result.ok && result.error) {
    return res.status(500).json({
      ok: false,
      error: result.error,
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed,
      provider_errors: result.provider_errors,
    });
  }

  return res.status(200).json({
    ok: true,
    warning: result.warning || null,
    message: "Prueba de correo ejecutada.",
    requestor,
    from: process.env.EMAIL_FROM || null,
    reply_to: process.env.EMAIL_REPLY_TO || null,
    attempted: result.attempted,
    sent: result.sent,
    failed: result.failed,
    provider_errors: result.provider_errors,
  });
}
