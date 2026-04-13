function esc(v) {
  return String(v || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function localIcsDateTime(dateStr, timeStr) {
  const baseTime = timeStr && timeStr !== "STBY" ? `${timeStr}:00` : "12:00:00";
  const d = new Date(`${dateStr}T${baseTime}`);
  if (Number.isNaN(d.getTime())) return "19700101T120000";
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function timezoneForDeparture(orig) {
  const key = String(orig || "").toLowerCase();
  if (key.includes("merida") || key.includes("mérida") || key.includes("mmmd") || key.includes("mid")) return "America/Merida";
  if (key.includes("cancun") || key.includes("cancún") || key.includes("mmun") || key.includes("cun")) return "America/Cancun";
  if (key.includes("cozumel") || key.includes("mmcz") || key.includes("czm")) return "America/Cancun";
  return "America/Merida";
}

function vtimezoneBlock(tzid) {
  if (tzid === "America/Cancun") {
    return [
      "BEGIN:VTIMEZONE",
      "TZID:America/Cancun",
      "X-LIC-LOCATION:America/Cancun",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0500",
      "TZNAME:EST",
      "DTSTART:19700101T000000",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
  }
  return [
    "BEGIN:VTIMEZONE",
    "TZID:America/Merida",
    "X-LIC-LOCATION:America/Merida",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0600",
    "TZNAME:CST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

function buildUid(payload = {}) {
  const raw = payload.flight_id || payload.id || [payload.ac, payload.date, payload.time, payload.orig, payload.dest].filter(Boolean).join("-");
  return `flight-${String(raw).replace(/[^a-zA-Z0-9_\-]/g, "")}@airpalace.app`;
}

export function buildFlightIcs(eventType, payload = {}) {
  if (!["flight_created", "flight_updated", "flight_cancelled"].includes(eventType)) return null;
  if (!payload?.date) return null;

  const uid = buildUid(payload);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const tzid = timezoneForDeparture(payload.orig);
  const dtStart = localIcsDateTime(payload.date, payload.time);
  const blockMins = Math.max(30, Number(payload.block_minutes || 60));
  const end = new Date(new Date(`${payload.date}T${payload.time && payload.time !== "STBY" ? payload.time : "12:00"}:00`).getTime() + blockMins * 60000);
  const dtEnd = Number.isNaN(end.getTime())
    ? localIcsDateTime(payload.date, "13:00")
    : `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}${pad(end.getSeconds())}`;

  const sequence = Number(payload.sequence || (eventType === "flight_created" ? 0 : 1));
  const method = eventType === "flight_cancelled" ? "CANCEL" : "REQUEST";
  const status = eventType === "flight_cancelled" ? "CANCELLED" : "CONFIRMED";
  const summaryPrefix = eventType === "flight_cancelled" ? "CANCELADO" : eventType === "flight_updated" ? "ACTUALIZADO" : "PROGRAMADO";
  const summary = `${summaryPrefix} ${payload.ac || "Aeronave"} ${payload.orig || "-"}-${payload.dest || "-"}`;

  const description = [
    `Ruta: ${payload.orig || "-"} -> ${payload.dest || "-"}`,
    `Aeronave: ${payload.ac || "-"}`,
    `Solicitó: ${payload.rb || "-"}`,
    `PAX: ${Number(payload.pm || 0) + Number(payload.pw || 0) + Number(payload.pc || 0)}`,
    `Notas: ${payload.notes || payload.nt || "-"}`,
  ].join("\\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "PRODID:-//AirPalace//Flight Ops//ES",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...vtimezoneBlock(tzid),
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `DTSTART;TZID=${tzid}:${dtStart}`,
    `DTEND;TZID=${tzid}:${dtEnd}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(`${payload.orig || "-"} -> ${payload.dest || "-"}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return {
    filename: `airpalace-${payload.ac || "flight"}-${payload.date || "event"}.ics`,
    content: Buffer.from(ics, "utf8").toString("base64"),
    type: "text/calendar; charset=utf-8; method=" + method,
  };
}
