function fdt(d) {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return d || "";
  }
}
function editorFromNotes(nt) {
  const m = String(nt || "").match(/\[By:\s*([^\]]+)\]/i);
  return (m && m[1] ? m[1].trim() : "") || "Sistema";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const phonesRaw = process.env.CALLMEBOT_PHONES || process.env.CALLMEBOT_PHONE || "";
  const phones = phonesRaw.split(",").map((p) => p.trim()).filter(Boolean);
  if (!phones.length || !process.env.CALLMEBOT_APIKEY) {
    return res.status(500).json({ error: "CALLMEBOT_PHONE o CALLMEBOT_PHONES, y CALLMEBOT_APIKEY son requeridos" });
  }

  const flight = req.body?.flight || {};
  const label = req.body?.label || "PROGRAMADO";
  if (!flight?.ac || !flight?.orig || !flight?.dest || !flight?.date) {
    return res.status(400).json({ error: "flight payload incomplete" });
  }

  const pax = Number(flight.pm || 0) + Number(flight.pw || 0) + Number(flight.pc || 0);
  const notes = (flight.nt || "").replace(/\s*\[By:\s*[^\]]+\]\s*/gi, "").trim() || "-";
  const editor = editorFromNotes(flight.nt);
  const text = [
    "*AirPalace Flight Ops*",
    `📌 ${label}`,
    `📅 ${fdt(flight.date)}`,
    `🛩️ ${flight.ac}`,
    `📍 ${flight.orig} ➜ ${flight.dest}`,
    `🕓 ${flight.time || "STBY"}`,
    `👤 Solicitó: ${flight.rb || "-"}`,
    `👥 Pax: ${pax}`,
    `📝 Notas: ${notes}`,
    `✏️ Editó: ${editor}`,
  ].join("\n");
  const results = await Promise.all(phones.map(async (phone) => {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_APIKEY)}`;
    try {
      const r = await fetch(url);
      const body = await r.text();
      return { phone, ok: r.ok, error: r.ok ? null : (body || "WhatsApp provider error") };
    } catch (e) {
      return { phone, ok: false, error: e?.message || "whatsapp send failed" };
    }
  }));

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  if (!sent) {
    return res.status(502).json({ error: "No se pudo enviar WhatsApp a ningún destinatario.", sent, failed, results });
  }
  return res.status(200).json({ ok: true, sent, failed, results, warning: failed ? `Se enviaron ${sent}, fallaron ${failed}.` : null });
}
