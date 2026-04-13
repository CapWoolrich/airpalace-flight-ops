import { sendOperationalEmail } from "./_emailSender.js";

const OWNER_BY_REQUESTOR = {
  "jabib c": "jachapur@thepalacecompany.com",
  "anuar c": "achapur@thepalacecompany.com",
  "omar c": "ochapur@thepalacecompany.com",
  "gibran c": "gchapur@thepalacecompany.com",
  "jose c": "jchapur@thepalacecompany.com",
};

function parseCsv(raw) {
  return String(raw || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });
  const requestor = String(req.body?.requestor || req.query?.requestor || "Jabib C");
  const mapped = OWNER_BY_REQUESTOR[requestor.trim().toLowerCase()] || null;
  const recipients = Array.from(new Set(parseCsv(process.env.OPS_EMAILS).concat(mapped ? [mapped] : [])));

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
    mapped_owner_email: mapped,
    from: process.env.EMAIL_FROM || null,
    reply_to: process.env.EMAIL_REPLY_TO || null,
    attempted: result.attempted,
    sent: result.sent,
    failed: result.failed,
    provider_errors: result.provider_errors,
  });
}
