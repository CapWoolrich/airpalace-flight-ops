import { buildWhatsAppFlightMessage } from "../src/server/whatsappMessage.js";
import { requireRouteAccess } from "../src/server/routeProtection.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 30, windowMs: 60_000 } });
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const phone = String(process.env.CALLMEBOT_PHONE || "").trim();
    if (!phone || !process.env.CALLMEBOT_APIKEY) {
      return res.status(200).json({ ok: false, warning: "falta configurar WhatsApp en el servidor." });
    }

    const flight = req.body?.flight || {};
    const label = req.body?.label || "PROGRAMADO";
    if (!flight?.ac || !flight?.orig || !flight?.dest || !flight?.date) {
      return res.status(400).json({ error: "Payload de vuelo incompleto para WhatsApp." });
    }

    // Canonical builder: siempre genera un único cuerpo para evitar duplicados.
    const text = buildWhatsAppFlightMessage(flight, label);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_APIKEY)}`;
    try {
      const providerResponse = await fetch(url);
      const providerBody = await providerResponse.text();
      if (!providerResponse.ok) {
        return res.status(200).json({
          ok: false,
          warning: "no se pudo enviar WhatsApp al destinatario configurado.",
          sent: 0,
          failed: 1,
          results: [{ phone, ok: false, error: providerBody || "Proveedor WhatsApp rechazó el mensaje." }],
        });
      }
      return res.status(200).json({
        ok: true,
        sent: 1,
        failed: 0,
        results: [{ phone, ok: true, error: null }],
        warning: null,
      });
    } catch (e) {
      return res.status(200).json({
        ok: false,
        warning: "falla de red al enviar WhatsApp al destinatario configurado.",
        sent: 0,
        failed: 1,
        results: [{ phone, ok: false, error: e?.message || "Fallo de red con proveedor WhatsApp." }],
      });
    }
  } catch {
    return res.status(200).json({ ok: false, warning: "error inesperado al enviar WhatsApp. Intenta de nuevo." });
  }
}
