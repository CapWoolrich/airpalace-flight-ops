function fmtDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function flightRoute(payload = {}) {
  if (!payload.orig || !payload.dest) return "-";
  return `${payload.orig} → ${payload.dest}`;
}

function paxCount(payload = {}) {
  if (payload.pax !== undefined && payload.pax !== null) return Number(payload.pax || 0);
  return Number(payload.pm || 0) + Number(payload.pw || 0) + Number(payload.pc || 0);
}

function templateRows(payload = {}) {
  return [
    ["Tipo", payload.event_label || "-"],
    ["Fecha", fmtDate(payload.date)],
    ["Aeronave", payload.ac || "-"],
    ["Ruta", flightRoute(payload)],
    ["Salida", payload.time || "STBY"],
    ["ETA local", payload.eta_local || "-"],
    ["Solicitó", payload.rb || "-"],
    ["PAX", String(paxCount(payload))],
    ["Notas", payload.notes || payload.nt || "-"],
    ["Editó/Creó", payload.actor || payload.edited_by || payload.created_by || "-"],
  ];
}

function renderHtml(rows, headline) {
  const rowsHtml = rows
    .map(([k, v]) => `<tr><td style="padding:6px 10px;color:#64748b;font-size:13px;">${k}</td><td style="padding:6px 10px;color:#0f172a;font-size:13px;font-weight:600;">${v}</td></tr>`)
    .join("");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <div style="background:#0f172a;color:#fff;padding:16px 18px;font-size:18px;font-weight:700;">AirPalace Flight Ops</div>
        <div style="padding:16px 18px;">
          <div style="font-size:15px;color:#0f172a;font-weight:700;margin-bottom:10px;">${headline}</div>
          <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
          <p style="margin-top:14px;color:#475569;font-size:12px;">Mensaje operacional automático. Favor de validar cualquier ajuste con el área de operaciones.</p>
        </div>
      </div>
    </div>
  `;
}

function renderText(rows, headline) {
  return [
    "AirPalace Flight Ops",
    headline,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Mensaje operacional automático.",
  ].join("\n");
}

export function buildOperationalEmail(eventType, payload = {}) {
  const route = flightRoute(payload);
  const dateShort = fmtDate(payload.date).replace(",", "");
  const maintenanceEnd = payload.maintenance_end_date ? new Date(`${payload.maintenance_end_date}T12:00:00`).toLocaleDateString("es-MX") : "";
  let subject = "AirPalace Flight Ops";
  let headline = "Actualización operacional";
  let eventLabel = "Actualización";

  switch (eventType) {
    case "flight_created":
      subject = `Vuelo programado | ${payload.ac || "-"} | ${route} | ${dateShort}`;
      headline = "✈️ Vuelo programado";
      eventLabel = "Vuelo programado";
      break;
    case "flight_updated":
      subject = `Vuelo modificado | ${payload.ac || "-"} | ${route}`;
      headline = "🛫 Vuelo modificado";
      eventLabel = "Vuelo modificado";
      break;
    case "flight_cancelled":
      subject = `Vuelo cancelado | ${payload.ac || "-"} | ${route}`;
      headline = "❌ Vuelo cancelado";
      eventLabel = "Vuelo cancelado";
      break;
    case "aircraft_aog":
      subject = `Alerta AOG | ${payload.ac || "-"}`;
      headline = "🚨 Alerta AOG";
      eventLabel = "AOG";
      break;
    case "aircraft_maintenance":
      subject = `Mantenimiento | ${payload.ac || "-"}${maintenanceEnd ? ` hasta ${maintenanceEnd}` : ""}`;
      headline = "🛠️ Aeronave en mantenimiento";
      eventLabel = "Mantenimiento";
      break;
    case "operational_conflict":
      subject = `Conflicto operativo detectado | ${payload.ac || "-"}`;
      headline = "⚠️ Conflicto operativo";
      eventLabel = "Conflicto operativo";
      break;
    case "tomorrow_flight_reminder":
      subject = `Recordatorio | Vuelo de mañana | ${payload.ac || "-"}`;
      headline = "📌 Recordatorio de vuelo de mañana";
      eventLabel = "Vuelo de mañana";
      break;
    default:
      break;
  }

  const rows = templateRows({ ...payload, event_label: eventLabel });
  return {
    subject,
    html: renderHtml(rows, headline),
    text: renderText(rows, headline),
  };
}
