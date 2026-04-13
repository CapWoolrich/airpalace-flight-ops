import { sendOperationalEmail } from "./_emailSender.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Método no permitido." });

  const result = await sendOperationalEmail({
    eventType: "flight_created",
    payload: {
      date: new Date().toISOString().slice(0, 10),
      ac: "N540JL",
      orig: "Mérida",
      dest: "Cozumel",
      time: "09:00",
      rb: "Prueba sistema",
      notes: "Correo de validación de Resend",
      actor: "Sistema",
    },
    opsOnly: true,
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
    from: process.env.EMAIL_FROM || null,
    reply_to: process.env.EMAIL_REPLY_TO || null,
    attempted: result.attempted,
    sent: result.sent,
    failed: result.failed,
    provider_errors: result.provider_errors,
  });
}
