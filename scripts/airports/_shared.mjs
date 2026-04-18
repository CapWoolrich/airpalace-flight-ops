import { createClient } from "@supabase/supabase-js";

export const SOURCES = {
  OUR_AIRPORTS: { name: "ourairports", priority: 100 },
  FAA: { name: "faa_nasr", priority: 1000 },
  OPENFLIGHTS: { name: "openflights", priority: 50 },
};

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function getSupabaseAdmin() {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function startImportRun(supabase, source, notes = {}) {
  const { data, error } = await supabase
    .from("airports_import_runs")
    .insert({ source, notes, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishImportRun(supabase, runId, counters) {
  const payload = {
    finished_at: new Date().toISOString(),
    total_processed: counters.total_processed || 0,
    inserted_count: counters.inserted || 0,
    updated_count: counters.updated || 0,
    merged_duplicate_count: counters.merged_duplicate || 0,
    error_count: counters.errors || 0,
    notes: counters.notes || {},
  };
  const { error } = await supabase.from("airports_import_runs").update(payload).eq("id", runId);
  if (error) throw error;
}

export function normalizeAirportRow(raw) {
  return {
    icao_code: clean(raw.icao_code || raw.ident),
    iata_code: clean(raw.iata_code),
    faa_lid: clean(raw.faa_lid),
    local_code: clean(raw.local_code),
    name: clean(raw.name),
    municipality: clean(raw.municipality),
    region: clean(raw.region || raw.iso_region),
    country_code: clean(raw.country_code || raw.iso_country)?.toUpperCase(),
    latitude_deg: toNumber(raw.latitude_deg),
    longitude_deg: toNumber(raw.longitude_deg),
    elevation_ft: toInteger(raw.elevation_ft),
    timezone: clean(raw.timezone),
    airport_type: clean(raw.airport_type || raw.type),
    scheduled_service: toBoolean(raw.scheduled_service),
    gps_code: clean(raw.gps_code),
    home_link: clean(raw.home_link),
    wikipedia_link: clean(raw.wikipedia_link),
  };
}

function clean(v) {
  const out = String(v ?? "").trim();
  return out || null;
}
function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toInteger(v) {
  const n = toNumber(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function toBoolean(v) {
  if (v === null || v === undefined || v === "") return null;
  const normalized = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return null;
}

export function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values
    .filter((r) => r.length && r.some((cell) => String(cell || "").trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ""])));
}

export async function upsertAirport(supabase, source, sourcePriority, row, counters) {
  const params = {
    p_source: source,
    p_source_priority: sourcePriority,
    p_icao_code: row.icao_code,
    p_iata_code: row.iata_code,
    p_faa_lid: row.faa_lid,
    p_local_code: row.local_code,
    p_name: row.name,
    p_municipality: row.municipality,
    p_region: row.region,
    p_country_code: row.country_code,
    p_latitude_deg: row.latitude_deg,
    p_longitude_deg: row.longitude_deg,
    p_elevation_ft: row.elevation_ft,
    p_timezone: row.timezone,
    p_airport_type: row.airport_type,
    p_scheduled_service: row.scheduled_service,
    p_gps_code: row.gps_code,
    p_home_link: row.home_link,
    p_wikipedia_link: row.wikipedia_link,
    p_data: row.data || {},
  };
  const { data, error } = await supabase.rpc("upsert_airport_master", params);
  if (error) {
    counters.errors += 1;
    return { ok: false, error };
  }
  const action = data?.[0]?.action;
  counters.total_processed += 1;
  if (action === "inserted") counters.inserted += 1;
  else if (action === "updated") counters.updated += 1;
  else if (action === "merged_duplicate") counters.merged_duplicate += 1;
  return { ok: true, action, airportId: data?.[0]?.airport_id || null };
}
