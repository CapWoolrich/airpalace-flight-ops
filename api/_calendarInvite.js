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

function parseLocalParts(dateStr, timeStr) {
  const date = String(dateStr || "").split("-");
  const time = String(timeStr && timeStr !== "STBY" ? timeStr : "12:00").split(":");
  const y = Number(date[0] || 1970);
  const m = Number(date[1] || 1);
  const d = Number(date[2] || 1);
  const hh = Number(time[0] || 12);
  const mm = Number(time[1] || 0);
  return { y, m, d, hh, mm, ss: 0 };
}

function localIcsDateTime(parts) {
  return `${parts.y}${pad(parts.m)}${pad(parts.d)}T${pad(parts.hh)}${pad(parts.mm)}${pad(parts.ss || 0)}`;
}

function addMinutesLocal(parts, mins) {
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, parts.hh, parts.mm, parts.ss || 0));
  dt.setUTCMinutes(dt.getUTCMinutes() + mins);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    hh: dt.getUTCHours(),
    mm: dt.getUTCMinutes(),
    ss: dt.getUTCSeconds(),
  };
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
  const startParts = parseLocalParts(payload.date, payload.time);
  const dtStart = localIcsDateTime(startParts);
  const blockMins = Math.max(30, Number(payload.block_minutes || 60));
  const endParts = addMinutesLocal(startParts, blockMins);
  const dtEnd = localIcsDateTime(endParts);

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
