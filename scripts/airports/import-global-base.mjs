import { SOURCES, finishImportRun, getSupabaseAdmin, normalizeAirportRow, parseCsv, startImportRun, upsertAirport } from "./_shared.mjs";

const OURAIRPORTS_AIRPORTS_URL = process.env.OURAIRPORTS_AIRPORTS_URL || "https://ourairports.com/data/airports.csv";
const OURAIRPORTS_RUNWAYS_URL = process.env.OURAIRPORTS_RUNWAYS_URL || "https://ourairports.com/data/runways.csv";
const OURAIRPORTS_FREQ_URL = process.env.OURAIRPORTS_FREQ_URL || "https://ourairports.com/data/airport-frequencies.csv";

const EXCLUDED_AIRPORT_TYPES = new Set(["heliport", "seaplane_base", "balloonport", "closed"]);

function normalizeAirportType(value) {
  return String(value || "").trim().toLowerCase();
}

async function fetchCsv(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  const text = await response.text();
  return parseCsv(text);
}

async function main() {
  const supabase = getSupabaseAdmin();
  const counters = { total_processed: 0, inserted: 0, updated: 0, merged_duplicate: 0, errors: 0, notes: {} };
  const runId = await startImportRun(supabase, SOURCES.OUR_AIRPORTS.name, { airports_url: OURAIRPORTS_AIRPORTS_URL });

  try {
    console.log("Downloading OurAirports airports...");
    const airports = await fetchCsv(OURAIRPORTS_AIRPORTS_URL);

    const airportMap = new Map();
    for (const raw of airports) {
      const parsed = normalizeAirportRow(raw);
      const airportType = normalizeAirportType(parsed.airport_type);
      if (EXCLUDED_AIRPORT_TYPES.has(airportType)) {
        counters.notes = counters.notes || {};
        counters.notes.skipped_excluded_airport_types = Number(counters.notes.skipped_excluded_airport_types || 0) + 1;
        counters.notes.skipped_by_airport_type = counters.notes.skipped_by_airport_type || {};
        counters.notes.skipped_by_airport_type[airportType] = Number(counters.notes.skipped_by_airport_type[airportType] || 0) + 1;
        continue;
      }
      if (!parsed.name || !parsed.country_code) continue;
      parsed.data = { ourairports_id: raw.id, continent: raw.continent, raw };
      const result = await upsertAirport(supabase, SOURCES.OUR_AIRPORTS.name, SOURCES.OUR_AIRPORTS.priority, parsed, counters);
      if (result.ok && result.airportId) {
        const key = String(raw.id || "");
        if (key) airportMap.set(key, result.airportId);
      }
    }

    console.log("Downloading runways and frequencies...");
    const [runways, frequencies] = await Promise.all([
      fetchCsv(OURAIRPORTS_RUNWAYS_URL),
      fetchCsv(OURAIRPORTS_FREQ_URL),
    ]);

    if (airportMap.size) {
      await supabase.from("airport_runways").delete().neq("id", 0);
      await supabase.from("airport_frequencies").delete().neq("id", 0);
    }

    for (const rw of runways) {
      const airportId = airportMap.get(String(rw.airport_ref || ""));
      if (!airportId) continue;
      await supabase.from("airport_runways").insert({
        airport_id: airportId,
        ident: rw.le_ident || rw.he_ident || rw.surface || null,
        length_ft: rw.length_ft ? Number(rw.length_ft) : null,
        width_ft: rw.width_ft ? Number(rw.width_ft) : null,
        surface: rw.surface || null,
        lighted: rw.lighted === "1",
        closed: rw.closed === "1",
        le_latitude_deg: rw.le_latitude_deg ? Number(rw.le_latitude_deg) : null,
        le_longitude_deg: rw.le_longitude_deg ? Number(rw.le_longitude_deg) : null,
        he_latitude_deg: rw.he_latitude_deg ? Number(rw.he_latitude_deg) : null,
        he_longitude_deg: rw.he_longitude_deg ? Number(rw.he_longitude_deg) : null,
        data: { raw: rw },
      });
    }

    for (const freq of frequencies) {
      const airportId = airportMap.get(String(freq.airport_ref || ""));
      if (!airportId) continue;
      await supabase.from("airport_frequencies").insert({
        airport_id: airportId,
        type: freq.type || null,
        description: freq.description || null,
        frequency_mhz: freq.frequency_mhz ? Number(freq.frequency_mhz) : null,
        data: { raw: freq },
      });
    }

    const { data: longest } = await supabase.rpc("refresh_airport_longest_runway");
    const { data: keywords } = await supabase.rpc("refresh_airport_keywords");
    const { data: aliases } = await supabase.rpc("rebuild_airport_aliases");
    counters.notes = {
      ...(counters.notes || {}),
      longest_runway_rows: longest ?? null,
      keyword_rows: keywords ?? null,
      aliases_rebuilt: aliases ?? null,
    };
    await finishImportRun(supabase, runId, counters);
    console.log("Done", counters);
  } catch (error) {
    counters.errors += 1;
    counters.notes = { ...(counters.notes || {}), error: String(error?.message || error) };
    await finishImportRun(supabase, runId, counters);
    throw error;
  }
}

main();
