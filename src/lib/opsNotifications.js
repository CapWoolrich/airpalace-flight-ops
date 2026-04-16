function cleanNote(note) {
  return String(note || "").replace(/\s*\[By:\s*[^\]]+\]\s*/gi, "").trim();
}

function actorLabel(actorName) {
  const actor = String(actorName || "").trim();
  return actor || "Sistema";
}

function monthShortEs(dateStr) {
  try {
    const formatted = new Date(`${dateStr}T12:00:00`).toLocaleDateString("es-MX", { month: "short" });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1).replace(".", "");
  } catch {
    return "";
  }
}

export function formatFlightDateTime(dateStr, timeStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return `${dateStr}${timeStr ? ` ${timeStr}` : ""}`;
  const day = d.getDate();
  const month = monthShortEs(dateStr);
  return `${day} ${month}${timeStr ? ` ${timeStr}` : ""}`.trim();
}

export function buildFlightNotificationPayload(flight = {}, actorName = "", extras = {}) {
  return {
    event_label: extras.eventLabel || "",
    id: flight?.id || null,
    flight_id: flight?.id || null,
    date: flight?.date || "",
    ac: flight?.ac || "",
    orig: flight?.orig || "",
    dest: flight?.dest || "",
    time: flight?.time || "STBY",
    rb: flight?.rb || "",
    pm: Number(flight?.pm || 0),
    pw: Number(flight?.pw || 0),
    pc: Number(flight?.pc || 0),
    notes: cleanNote(flight?.nt),
    actor: actorLabel(actorName),
    edited_by: actorLabel(actorName),
    created_by: actorLabel(actorName),
    ...extras,
  };
}

export function buildAircraftStatusNotificationPayload({ ac = "", maintenanceEndDate = "", actorName = "", eventLabel = "" } = {}) {
  return {
    event_label: eventLabel,
    ac,
    maintenance_end_date: maintenanceEndDate || "",
    actor: actorLabel(actorName),
  };
}

export function buildOpsPush(eventType, payload = {}) {
  const ac = payload.ac || "Aeronave";
  const route = payload.orig && payload.dest ? `${payload.orig} → ${payload.dest}` : "";
  const dateTime = formatFlightDateTime(payload.date, payload.time || "");
  const endDate = payload.maintenanceEndDate
    ? new Date(`${payload.maintenanceEndDate}T12:00:00`).toLocaleDateString("es-MX")
    : "";

  switch (eventType) {
    case "flight_programmed":
      return {
        title: "Vuelo programado",
        body: `Vuelo programado: ${ac}${route ? ` · ${route}` : ""}${dateTime ? ` · ${dateTime}` : ""}`,
        url: "/?view=list",
      };
    case "flight_modified":
      return {
        title: "Vuelo modificado",
        body: `Vuelo modificado: ${ac}${route ? ` · ${route}` : ""}${dateTime ? ` · ${dateTime}` : ""}`,
        url: "/?view=list",
      };
    case "flight_cancelled":
      return {
        title: "Vuelo cancelado",
        body: `Vuelo cancelado: ${ac}${route ? ` · ${route}` : ""}`,
        url: "/?view=list&filter=cancelled",
      };
    case "aog":
      return {
        title: "AOG",
        body: `Alerta AOG: ${ac} quedó fuera de servicio`,
        url: "/?view=gest",
      };
    case "maintenance":
      return {
        title: "Mantenimiento",
        body: `Mantenimiento: ${ac}${endDate ? ` en mantenimiento hasta ${endDate}` : " en mantenimiento"}`,
        url: "/?view=gest",
      };
    case "operational_conflict":
      return {
        title: "Conflicto operativo",
        body: `Conflicto operativo detectado en ${ac}`,
        url: "/?view=list&filter=conflicts",
      };
    case "tomorrow_flight":
      return {
        title: "Vuelo de mañana",
        body: `Recordatorio: tienes un vuelo mañana en ${ac}`,
        url: "/?view=list&filter=tomorrow",
      };
    default:
      return {
        title: "AirPalace Flight Ops",
        body: "Nueva actualización operativa",
        url: "/",
      };
  }
}
