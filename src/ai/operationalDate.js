export const OPS_TIMEZONE = "America/Merida";

const MONTHS = {
  enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abril: 4, abr: 4, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sept: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
  nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};

const WEEKDAYS = {
  sunday: 0, domingo: 0,
  monday: 1, lunes: 1,
  tuesday: 2, martes: 2,
  wednesday: 3, miercoles: 3, miércoles: 3,
  thursday: 4, jueves: 4,
  friday: 5, viernes: 5,
  saturday: 6, sabado: 6, sábado: 6,
};

const WEEKDAY_SHORT_TO_INDEX = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function toISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function getOpsParts(baseDate = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: OPS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(baseDate);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAY_SHORT_TO_INDEX[normalizeText(get("weekday")).slice(0, 3)] ?? 0,
  };
}

export function getOperationalTodayISO(baseDate = new Date()) {
  const p = getOpsParts(baseDate);
  return toISODate(p.year, p.month, p.day);
}

export function getOperationalTomorrowISO(baseDate = new Date()) {
  return addDays(getOperationalTodayISO(baseDate), 1);
}

export function getOperationalDateOffsetISO(days = 0, baseDate = new Date()) {
  return addDays(getOperationalTodayISO(baseDate), days);
}

export function getOperationalWeekRangeISO(baseDate = new Date()) {
  const today = getOperationalTodayISO(baseDate);
  const weekday = getOpsParts(baseDate).weekday;
  const daysFromMonday = (weekday + 6) % 7;
  const start = addDays(today, -daysFromMonday);
  const end = addDays(start, 6);
  return { start, end };
}

export function formatOperationalDate(isoDate, locale = "es-MX") {
  if (!isoDate) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: OPS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(`${isoDate}T12:00:00Z`));
  } catch {
    return isoDate;
  }
}

export function isPastOperationalDate(isoDate, baseDate = new Date()) {
  if (!isoDate) return false;
  return isoDate < getOperationalTodayISO(baseDate);
}

function nextWeekdayFrom(baseIsoDate, targetDay, forceNext) {
  const base = new Date(`${baseIsoDate}T12:00:00Z`);
  const current = base.getUTCDay();
  let delta = (targetDay - current + 7) % 7;
  if (forceNext || delta === 0) delta += 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return toISODate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

export function parseOperationalDateFromText(text, options = {}) {
  const t = normalizeText(text);
  if (!t) return null;

  const today = getOperationalTodayISO(options.baseDate);
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);

  if (t.includes("pasado mañana") || t.includes("day after tomorrow")) return { date: dayAfterTomorrow, impliedYear: false };
  if (t.includes("mañana") || t.includes("tomorrow")) return { date: tomorrow, impliedYear: false };
  if (t.includes("hoy") || t.includes("today")) return { date: today, impliedYear: false };

  const nextWeekdayMatch = t.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (nextWeekdayMatch) {
    return { date: nextWeekdayFrom(today, WEEKDAYS[nextWeekdayMatch[1]], true), impliedYear: false };
  }

  const dayName = Object.keys(WEEKDAYS).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (dayName) {
    return { date: nextWeekdayFrom(today, WEEKDAYS[dayName], false), impliedYear: false };
  }

  const refYear = Number(today.slice(0, 4));
  const dmy = t.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?/);
  if (dmy) {
    const year = dmy[3] ? Number(dmy[3]) : refYear;
    return { date: toISODate(year, Number(dmy[2]), Number(dmy[1])), impliedYear: !dmy[3], explicitYear: dmy[3] ? Number(dmy[3]) : null };
  }

  const deMes = t.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/);
  if (deMes && MONTHS[deMes[2]]) {
    const year = deMes[3] ? Number(deMes[3]) : refYear;
    return { date: toISODate(year, MONTHS[deMes[2]], Number(deMes[1])), impliedYear: !deMes[3], explicitYear: deMes[3] ? Number(deMes[3]) : null };
  }

  const mesDia = t.match(/([a-záéíóú]+)\s+(\d{1,2})(?:\s+de\s+(\d{4}))?/);
  if (mesDia && MONTHS[mesDia[1]]) {
    const year = mesDia[3] ? Number(mesDia[3]) : refYear;
    return { date: toISODate(year, MONTHS[mesDia[1]], Number(mesDia[2])), impliedYear: !mesDia[3], explicitYear: mesDia[3] ? Number(mesDia[3]) : null };
  }

  return null;
}
