import { buildOperationalEmail } from "./_emailTemplate.js";

function parseCsvEmails(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

const ROUTING = {
  flight_created: ["ops", "pilots", "owners"],
  flight_updated: ["ops", "pilots", "owners"],
  flight_cancelled: ["ops", "pilots", "owners"],
  aircraft_aog: ["ops", "owners"],
  aircraft_maintenance: ["ops", "owners"],
  operational_conflict: ["ops", "owners"],
  tomorrow_flight_reminder: ["ops", "pilots"],
};

function recipientsFromGroups(eventType) {
  const groups = {
    ops: parseCsvEmails(process.env.OPS_EMAILS),
    pilots: parseCsvEmails(process.env.PILOTS_EMAILS),
    owners: parseCsvEmails(process.env.OWNERS_EMAILS),
  };
  const route = ROUTING[eventType] || [];
  return uniq(route.flatMap((g) => groups[g] || []));
}

function missingEnvError() {
  if (!process.env.RESEND_API_KEY) return "Falta configurar RESEND_API_KEY.";
  if (!process.env.EMAIL_FROM) return "Falta configurar EMAIL_FROM.";
  return null;
}

export async function sendOperationalEmail({
  eventType,
  payload = {},
  recipientsOverride = null,
  opsOnly = false,
}) {
  const missing = missingEnvError();
  if (missing) return { ok: false, error: missing, attempted: [], sent: [], failed: [], provider_errors: [] };

  const mode = String(process.env.EMAIL_MODE || "production").toLowerCase();
  const recipients = uniq(
    recipientsOverride?.length
      ? recipientsOverride
      : opsOnly
        ? parseCsvEmails(process.env.OPS_EMAILS)
        : recipientsFromGroups(eventType)
  );

  if (!recipients.length) {
    return {
      ok: true,
      warning: "No se encontró una lista de destinatarios para este evento.",
      attempted: [],
      sent: [],
      failed: [],
      provider_errors: [],
    };
  }

  if (mode !== "production") {
    return {
      ok: true,
      warning: `EMAIL_MODE=${mode}: envío omitido.`,
      attempted: recipients,
      sent: [],
      failed: [],
      provider_errors: [],
    };
  }

  const template = buildOperationalEmail(eventType, payload);
  const from = process.env.EMAIL_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  const sendOne = async (to) => {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: replyTo,
          subject: template.subject,
          html: template.html,
          text: template.text,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return {
          to,
          ok: false,
          error: typeof data?.message === "string" ? data.message : "Proveedor rechazó el correo",
        };
      }
      return { to, ok: true, id: data?.id || null };
    } catch (e) {
      return { to, ok: false, error: e?.message || "Error de red al enviar correo" };
    }
  };

  const results = await Promise.all(recipients.map(sendOne));
  const sent = results.filter((r) => r.ok).map((r) => r.to);
  const failedItems = results.filter((r) => !r.ok);
  const failed = failedItems.map((r) => r.to);
  const providerErrors = failedItems.map((r) => ({ recipient: r.to, message: r.error }));

  return {
    ok: sent.length > 0,
    warning: sent.length > 0 && failed.length > 0 ? "El proveedor rechazó uno o más correos." : null,
    attempted: recipients,
    sent,
    failed,
    provider_errors: providerErrors,
    subject: template.subject,
  };
}
