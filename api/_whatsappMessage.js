function formatDateLabel(d) {
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

export function buildWhatsAppFlightMessage(flight = {}, label = "PROGRAMADO") {
  const pax = Number(flight.pm || 0) + Number(flight.pw || 0) + Number(flight.pc || 0);
  const notes = String(flight.nt || "").replace(/\s*\[By:\s*[^\]]+\]\s*/gi, "").trim() || "-";

  return [
    "*AirPalace Flight Ops*",
    `📌 ${label}`,
    `📅 ${formatDateLabel(flight.date)}`,
    `🛩️ ${flight.ac || "-"}`,
    `📍 ${(flight.orig || "-")} ➜ ${(flight.dest || "-")}`,
    `🕓 ${flight.time || "STBY"}`,
    `👤 Solicitó: ${flight.rb || "-"}`,
    `👥 Pax: ${pax}`,
    `📝 Notas: ${notes}`,
    `✏️ Editó: ${editorFromNotes(flight.nt)}`,
  ].join("\n");
}
