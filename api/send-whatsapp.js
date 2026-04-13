import { buildWhatsAppFlightMessage } from "./_whatsappMessage";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const phonesRaw = process.env.CALLMEBOT_PHONES || process.env.CALLMEBOT_PHONE || "";
    const phones = phonesRaw.split(",").map((p) => p.trim()).filter(Boolean);
    if (!phones.length || !process.env.CALLMEBOT_APIKEY) {
      return res.status(200).json({ ok: false, warning: "falta configurar WhatsApp en el servidor." });
    }

    const flight = req.body?.flight || {};
    const label = req.body?.label || "PROGRAMADO";
    if (!flight?.ac || !flight?.orig || !flight?.dest || !flight?.date) {
      return res.status(400).json({ error: "Payload de vuelo incompleto para WhatsApp." });
    }

    // Canonical builder: siempre genera un único cuerpo para evitar duplicados.
    const text = buildWhatsAppFlightMessage(flight, label);
    const results = await Promise.all(phones.map(async (phone) => {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_APIKEY)}`;
      try {
        const r = await fetch(url);
        const body = await r.text();
        return { phone, ok: r.ok, error: r.ok ? null : (body || "Proveedor WhatsApp rechazó el mensaje.") };
      } catch (e) {
        return { phone, ok: false, error: e?.message || "Fallo de red con proveedor WhatsApp." };
      }
    }));

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    if (!sent) {
      return res.status(200).json({ ok: false, warning: "no se pudo enviar WhatsApp a ningún destinatario.", sent, failed, results });
    }
    return res.status(200).json({ ok: true, sent, failed, results, warning: failed ? `${sent} mensaje(s) enviado(s) y ${failed} falló/fallaron.` : null });
  } catch {
    return res.status(200).json({ ok: false, warning: "error inesperado al enviar WhatsApp. Intenta de nuevo." });
  }
}
