import { sendOperationalEmail } from "../_emailSender.js";
import { ensureBodyFields, requireRouteAccess } from "../_routeProtection.js";

function getRecipientsOverride(req) {
  const requestedRecipients = Array.isArray(req.body?.recipients) ? req.body.recipients : null;
  if (!requestedRecipients?.length) return null;

  const expectedInternalSecret = String(process.env.API_INTERNAL_SECRET || "").trim();
  const providedInternalSecret = String(req.headers["x-internal-secret"] || "").trim();
  if (!expectedInternalSecret || providedInternalSecret !== expectedInternalSecret) {
    return null;
  }

  return requestedRecipients;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const access = await requireRouteAccess(req, {
    requireAuth: true,
    minimumRole: "admin",
    allowInternalSecretBypassAuth: true,
    rateLimit: { max: 30, windowMs: 60_000 },
  });
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const eventType = req.body?.eventType;
  const payload = req.body?.payload || {};
  const recipientsOverride = getRecipientsOverride(req);
  const required = ensureBodyFields(req.body || {}, ["eventType"]);
  if (!required.ok) return res.status(400).json({ error: required.error });

  const result = await sendOperationalEmail({
    eventType,
    payload,
    recipientsOverride,
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
