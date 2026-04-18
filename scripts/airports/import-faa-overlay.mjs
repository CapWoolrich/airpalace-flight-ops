import fs from "node:fs/promises";
import { SOURCES, finishImportRun, getSupabaseAdmin, normalizeAirportRow, parseCsv, startImportRun, upsertAirport } from "./_shared.mjs";

const FAA_CSV_PATH = process.env.FAA_CSV_PATH || "./data/faa/faa_airports.csv";

async function main() {
  const supabase = getSupabaseAdmin();
  const counters = { total_processed: 0, inserted: 0, updated: 0, merged_duplicate: 0, errors: 0, notes: { file: FAA_CSV_PATH } };
  const runId = await startImportRun(supabase, SOURCES.FAA.name, { file: FAA_CSV_PATH });

  try {
    const csv = await fs.readFile(FAA_CSV_PATH, "utf8");
    const rows = parseCsv(csv);

    for (const raw of rows) {
      const parsed = normalizeAirportRow({
        ...raw,
        icao_code: raw.icao_code || raw.gps_code || raw.ident,
        iata_code: raw.iata_code || raw.iata,
        municipality: raw.city || raw.municipality,
        region: raw.state || raw.region,
        country_code: "US",
      });
      if (!parsed.name) continue;
      parsed.data = { faa: raw };
      await upsertAirport(supabase, SOURCES.FAA.name, SOURCES.FAA.priority, parsed, counters);
    }

    const { data: keywordRows } = await supabase.rpc("refresh_airport_keywords");
    counters.notes.keyword_rows = keywordRows ?? null;
    await finishImportRun(supabase, runId, counters);
    console.log("FAA overlay import finished", counters);
  } catch (error) {
    counters.errors += 1;
    counters.notes.error = String(error?.message || error);
    await finishImportRun(supabase, runId, counters);
    throw error;
  }
}

main();
