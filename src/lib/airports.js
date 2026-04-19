import { supabase } from "../supabase.js";
import { APR } from "../app/data.js";

let airportCache = buildInitialCache(APR);

function buildInitialCache(rows) {
  const map = new Map();
  rows.forEach((row) => registerAirport(row, map));
  return map;
}

function keyParts(value) {
  return String(value || "").trim().toUpperCase();
}

export function registerAirport(raw, targetMap = airportCache) {
  if (!raw) return null;
  const normalized = {
    c: raw.c || raw.name || "",
    i4: keyParts(raw.i4 || raw.icao_code),
    i3: keyParts(raw.i3 || raw.iata_code),
    la: toNumber(raw.la ?? raw.latitude_deg),
    lo: toNumber(raw.lo ?? raw.longitude_deg),
    co: keyParts(raw.co || raw.country_code),
    municipality: raw.municipality || null,
    region: raw.region || null,
    tz: raw.tz || raw.timezone || null,
    source_priority: Number(raw.source_priority || 0),
  };
  if (!normalized.c) return null;

  [normalized.c, normalized.i4, normalized.i3]
    .map((item) => keyParts(item))
    .filter(Boolean)
    .forEach((key) => {
      const current = targetMap.get(key);
      if (!current || current.source_priority <= normalized.source_priority) targetMap.set(key, normalized);
    });

  return normalized;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function findAirportByAny(value) {
  const key = keyParts(value);
  if (!key) return null;
  return airportCache.get(key) || null;
}

export function getCachedAirports() {
  return Array.from(new Set(Array.from(airportCache.values())));
}

export function formatAirportOption(option) {
  const name = option.c || "Unknown Airport";
  const city = option.municipality || name;
  const country = option.co || "--";
  const codes = [option.i3, option.i4].filter(Boolean).join(" / ") || "N/A";
  return `${name} — ${city}, ${country} (${codes})`;
}

export async function searchAirports(query, limit = 12) {
  const q = String(query || "").trim();
  if (!q) return getCachedAirports().slice(0, limit);

  const { data, error } = await supabase.rpc("search_airports_master", { p_query: q, p_limit: limit });
  if (error || !Array.isArray(data)) {
    const lower = q.toLowerCase();
    return getCachedAirports()
      .filter((a) => {
        return [a.c, a.i3, a.i4, a.municipality, a.region, a.co].some((field) => String(field || "").toLowerCase().includes(lower));
      })
      .slice(0, limit);
  }

  const rows = data.map((row) => registerAirport({
    c: row.name,
    i4: row.icao_code,
    i3: row.iata_code,
    la: row.latitude_deg,
    lo: row.longitude_deg,
    co: row.country_code,
    municipality: row.municipality,
    region: row.region,
    tz: row.timezone,
    source_priority: row.source_priority,
  }));

  return rows.filter(Boolean).slice(0, limit);
}

function isIataCode(value) {
  return /^[A-Z]{3}$/.test(keyParts(value));
}

function isIcaoCode(value) {
  return /^[A-Z]{4}$/.test(keyParts(value));
}

function pickBestSearchMatch(value, results) {
  var target = String(value || "").trim().toLowerCase();
  if (!target) return null;
  if (!Array.isArray(results) || !results.length) return null;

  var exactName = results.find(function (airport) {
    return String(airport?.c || "").trim().toLowerCase() === target;
  });
  if (exactName) return exactName;

  var exactMunicipality = results.find(function (airport) {
    return String(airport?.municipality || "").trim().toLowerCase() === target;
  });
  if (exactMunicipality) return exactMunicipality;

  return results.find(function (airport) {
    return Boolean(String(airport?.i3 || "").trim() || String(airport?.i4 || "").trim());
  }) || null;
}

export async function hydrateAirportCacheForValues(values) {
  var list = Array.isArray(values) ? values : [];
  var uniqueRaw = Array.from(new Set(list.map(function (value) {
    return String(value || "").trim();
  }).filter(Boolean)));
  var resolvedCount = 0;

  for (var i = 0; i < uniqueRaw.length; i += 1) {
    var rawValue = uniqueRaw[i];
    var upperValue = keyParts(rawValue);
    if (isIataCode(upperValue) || isIcaoCode(upperValue)) continue;
    if (findAirportByAny(rawValue)) continue;

    var options = await searchAirports(rawValue, 5);
    var selected = pickBestSearchMatch(rawValue, options);
    if (!selected) continue;

    var before = findAirportByAny(rawValue);
    registerAirport(selected);
    var after = findAirportByAny(rawValue);
    if (!before && after) resolvedCount += 1;
  }

  return resolvedCount;
}
