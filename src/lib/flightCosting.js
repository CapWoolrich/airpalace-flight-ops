import { normalizeDateIso, parseTimeToMinutes } from "./timezones.js";

const N540JL_VARIABLE_HOURLY_USD = 1958;
const PHENOM300E_FIXED_HOURLY_USD = 3420;
const PHENOM300E_VARIABLE_HOURLY_USD = 2280;
const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function formatUsd(value) {
  return CURRENCY_FORMATTER.format(round2(value));
}

function normalizeProfileRow(row = {}) {
  return {
    aircraft_code: String(row.aircraft_code || "").trim().toUpperCase(),
    fixed_hourly_usd: Number(row.fixed_hourly_usd || 0) || 0,
    variable_hourly_usd: Number(row.variable_hourly_usd || 0) || 0,
    note: String(row.note || "").trim(),
    effective_date: row.effective_date || null,
  };
}

function pickLatestProfile(rows = [], aircraftCode = "") {
  const target = String(aircraftCode || "").trim().toUpperCase();
  const sorted = rows
    .map(normalizeProfileRow)
    .filter((row) => row.aircraft_code === target)
    .sort((a, b) => String(b.effective_date || "").localeCompare(String(a.effective_date || "")));
  return sorted[0] || null;
}

function resolveProfileRowsByAircraft(rows = []) {
  const n540Row = pickLatestProfile(rows, "N540JL");
  const phenomRow = pickLatestProfile(rows, "PHENOM300E");
  return { n540Row, phenomRow };
}

export function calcFlightHours({
  departureDate,
  departureTime,
  arrivalDate,
  arrivalTime,
  fallbackHours = 0,
} = {}) {
  const depDate = normalizeDateIso(departureDate);
  const arrDate = normalizeDateIso(arrivalDate);
  const depMins = parseTimeToMinutes(departureTime);
  const arrMins = parseTimeToMinutes(arrivalTime);
  if (!depDate || !arrDate || !Number.isFinite(depMins) || !Number.isFinite(arrMins)) {
    return round2(fallbackHours);
  }

  const dep = new Date(`${depDate}T00:00:00Z`).getTime() + depMins * 60000;
  const arr = new Date(`${arrDate}T00:00:00Z`).getTime() + arrMins * 60000;
  if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return round2(fallbackHours);
  return round2((arr - dep) / 3600000);
}

export function estimateFlightCost({
  aircraftCode,
  hours,
  profileRows = [],
  n540FixedHourlyOverride = null,
} = {}) {
  const ac = String(aircraftCode || "").trim().toUpperCase();
  const safeHours = round2(hours);
  const { n540Row, phenomRow } = resolveProfileRowsByAircraft(profileRows);

  let fixedHourlyUsd = 0;
  let variableHourlyUsd = 0;
  let note = "Promedio estimado con base histórica. No representa costo contable final.";
  let profileKey = "";

  if (ac === "N540JL") {
    fixedHourlyUsd = Number(
      n540FixedHourlyOverride ??
      n540Row?.fixed_hourly_usd ??
      0
    ) || 0;
    variableHourlyUsd = Number(n540Row?.variable_hourly_usd || N540JL_VARIABLE_HOURLY_USD) || 0;
    profileKey = "N540JL_EST_2026_FIXED_2024_2025_VARIABLE";
    if (!fixedHourlyUsd) {
      note = `${note} Falta capturar costo fijo 2026 para N540JL.`;
    }
  } else if (ac === "N35EA" || ac === "PHENOM300E") {
    fixedHourlyUsd = Number(phenomRow?.fixed_hourly_usd || PHENOM300E_FIXED_HOURLY_USD) || 0;
    variableHourlyUsd = Number(phenomRow?.variable_hourly_usd || PHENOM300E_VARIABLE_HOURLY_USD) || 0;
    profileKey = "PHENOM300E_PROVISIONAL_60_40";
  } else {
    profileKey = "UNCONFIGURED";
    note = `${note} Aeronave sin perfil de costos configurado.`;
  }

  const fixedTotalUsd = round2(fixedHourlyUsd * safeHours);
  const variableTotalUsd = round2(variableHourlyUsd * safeHours);
  const totalUsd = round2(fixedTotalUsd + variableTotalUsd);

  return {
    hours: safeHours,
    fixedHourlyUsd: round2(fixedHourlyUsd),
    variableHourlyUsd: round2(variableHourlyUsd),
    fixedTotalUsd,
    variableTotalUsd,
    totalUsd,
    note,
    profileKey,
  };
}
