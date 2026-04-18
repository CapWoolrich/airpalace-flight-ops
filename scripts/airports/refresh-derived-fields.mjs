import { getSupabaseAdmin } from "./_shared.mjs";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: runwayRows, error: runwayError } = await supabase.rpc("refresh_airport_longest_runway");
  if (runwayError) throw runwayError;

  const { data: keywordRows, error: keywordError } = await supabase.rpc("refresh_airport_keywords");
  if (keywordError) throw keywordError;

  console.log({ runwayRows, keywordRows });
}

main();
