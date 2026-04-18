import { localDateTimeToUtcMs, normalizeDateIso, parseTimeToMinutes, resolveAirportTimezone } from "../lib/timezones.js";

function esc(v) {
  return String(v || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toUtcIcsStamp(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildUid(payload = {}) {
  const raw = payload.flight_id || payload.id || [payload.ac, payload.date, payload.time, payload.orig, payload.dest].filter(Boolean).join("-");
  return `flight-${String(raw).replace(/[^a-zA-Z0-9_\-]/g, "")}@airpalace.app`;
}

export function buildFlightIcs(eventType, payload = {}) {
  if (!["flight_created", "flight_updated", "flight_cancelled"].includes(eventType)) return null;
  if (!payload?.date) return null;

  const uid = buildUid(payload);
  const dtStamp = toUtcIcsStamp(new Date()) || "19700101T000000Z";
  const depDate = normalizeDateIso(payload.date);
  const depMinutes = parseTimeToMinutes(payload.time || "12:00");
  const depTz = resolveAirportTimezone(payload.orig, { fallbackTimeZone: "America/Merida" }).timeZone;
  if (!depDate || !Number.isFinite(depMinutes) || !depTz) return null;

  const startUtcMs = localDateTimeToUtcMs(depDate, depMinutes, depTz);
  const blockMins = Math.max(30, Number(payload.block_minutes || 60));
  const endUtcMs = startUtcMs + blockMins * 60 * 1000;
  const dtStart = toUtcIcsStamp(startUtcMs);
  const dtEnd = toUtcIcsStamp(endUtcMs);
  if (!dtStart || !dtEnd) return null;

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
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
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
