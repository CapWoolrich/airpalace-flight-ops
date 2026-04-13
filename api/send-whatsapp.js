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
  if (!process.env.CALLMEBOT_PHONE || !process.env.CALLMEBOT_APIKEY) {
    return res.status(500).json({ error: "CALLMEBOT_PHONE/CALLMEBOT_APIKEY missing" });
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
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(process.env.CALLMEBOT_PHONE)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_APIKEY)}`;

  try {
    const r = await fetch(url);
    const body = await r.text();
    if (!r.ok) return res.status(502).json({ error: body || "WhatsApp provider error" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "whatsapp send failed" });
  }
}
