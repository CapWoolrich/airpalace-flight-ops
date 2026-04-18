import { getSupabaseAdmin } from "./_shared.mjs";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("airports_import_runs")
    .select("id,source,started_at,finished_at,total_processed,inserted_count,updated_count,merged_duplicate_count,error_count,notes")
    .order("id", { ascending: false })
    .limit(20);
  if (error) throw error;

  const totals = data.reduce(
    (acc, row) => {
      acc.total_processed += row.total_processed || 0;
      acc.inserted += row.inserted_count || 0;
      acc.updated += row.updated_count || 0;
      acc.merged += row.merged_duplicate_count || 0;
      acc.errors += row.error_count || 0;
      return acc;
    },
    { total_processed: 0, inserted: 0, updated: 0, merged: 0, errors: 0 }
  );

  console.table(data);
  console.log("Aggregate", totals);
}

main();
