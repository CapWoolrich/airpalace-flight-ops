import { getSupabaseAdmin } from "./_shared.mjs";

const REQUIRED_QUERIES = [
  "Boston","KBOS","BOS","Tampa","KTPA","TPA","Aspen","KASE","ASE","Vail","Eagle","KEGE","EGE",
  "Houston Hobby","KHOU","HOU","San Francisco","KSFO","SFO","Las Vegas","KLAS","LAS",
  "San Antonio","KSAT","SAT","Ocho Rios","Boscobel","Ian Fleming","MKBS","OCJ",
  "Providenciales","Provo","MBPV","PLS","Grand Turk","MBGT","GDT"
];

async function main() {
  const supabase = getSupabaseAdmin();

  const coverageCountries = ["US", "MX", "CO", "PE", "JM", "TC"];
  const coverage = {};
  for (const country of coverageCountries) {
    const { count, error } = await supabase
      .from("airports_master")
      .select("id", { count: "exact", head: true })
      .eq("country_code", country)
      .eq("is_active", true);
    if (error) throw error;
    coverage[country] = count || 0;
  }

  const requiredResults = [];
  for (const query of REQUIRED_QUERIES) {
    const { data, error } = await supabase.rpc("search_airports_master", { p_query: query, p_limit: 5 });
    if (error) throw error;
    requiredResults.push({ query, hits: (data || []).map((row) => `${row.name} (${row.iata_code || "-"}/${row.icao_code || "-"})`) });
  }

  console.log("Coverage by country", coverage);
  console.table(requiredResults.map((x) => ({ query: x.query, top_hit: x.hits[0] || "NO_HIT", hit_count: x.hits.length })));

  const missing = requiredResults.filter((x) => !x.hits.length);
  if (missing.length) {
    throw new Error(`Missing required airport search results: ${missing.map((x) => x.query).join(", ")}`);
  }
}

main();
