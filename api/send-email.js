import { sendOperationalEmail } from "../src/server/_emailSender.js";
import { ensureBodyFields, requireRouteAccess } from "../src/server/_routeProtection.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 30, windowMs: 60_000 } });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const eventType = req.body?.eventType;
  const payload = req.body?.payload || {};
  const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : null;
  const required = ensureBodyFields(req.body || {}, ["eventType"]);
  if (!required.ok) return res.status(400).json({ error: required.error });

  const result = await sendOperationalEmail({
    eventType,
    payload,
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
    attempted: result.attempted,
    sent: result.sent,
    failed: result.failed,
    provider_errors: result.provider_errors,
    subject: result.subject,
  });
}
