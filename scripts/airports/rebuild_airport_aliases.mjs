import { getSupabaseAdmin } from "./_shared.mjs";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("rebuild_airport_aliases");
  if (error) throw error;
  console.log({ aliasesRebuilt: data });
}

main();
