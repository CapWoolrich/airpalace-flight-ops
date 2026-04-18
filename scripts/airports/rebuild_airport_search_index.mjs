import { getSupabaseAdmin } from "./_shared.mjs";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: searchRows, error: searchError } = await supabase.rpc("refresh_airport_search_index");
  if (searchError) throw searchError;
  const { data: keywordRows, error: keywordError } = await supabase.rpc("refresh_airport_keywords");
  if (keywordError) throw keywordError;
  console.log({ searchRows, keywordRows });
}

main();
