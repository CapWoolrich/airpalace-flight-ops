import {
  buildAircraftStatusMutation,
  buildCancelFlightMutation,
  buildCreateFlightMutation,
  buildDuplicateFlightMutation,
  buildEditFlightMutation,
} from "./opsMutationBuilders.js";

const FLIGHT_AUDIT_COLUMNS = new Set([
  "created_by_user_id",
  "created_by_user_email",
  "created_by_user_name",
  "created_by_email",
  "created_by_name",
  "updated_by_email",
  "updated_by_name",
  "creation_source",
]);

function stripFlightAuditFields(row = {}) {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !FLIGHT_AUDIT_COLUMNS.has(k)));
}

function isSchemaCacheMissingAuditColumnError(error) {
  const msg = String(error?.message || "").toLowerCase();
  if (!msg.includes("schema cache") && !msg.includes("could not find the")) return false;
  const code = String(error?.code || "").toUpperCase();
  if (code && code !== "PGRST204") {
    // Keep fallback narrow; only known missing-column/schema-cache style errors.
    return false;
  }
  return [
    "created_by_user_id",
    "created_by_user_email",
    "created_by_user_name",
    "created_by_email",
    "created_by_name",
    "updated_by_email",
    "updated_by_name",
    "creation_source",
  ].some((col) => msg.includes(col));
}

async function insertFlightWithAuditFallback(db, row) {
  const first = await db.from("flights").insert([row]).select("*").single();
  if (!first.error) return { data: first.data || row, warnings: [] };
  if (!isSchemaCacheMissingAuditColumnError(first.error)) throw first.error;

  const retryRow = stripFlightAuditFields(row);
  const retry = await db.from("flights").insert([retryRow]).select("*").single();
  if (retry.error) throw retry.error;
  return {
    data: retry.data || retryRow,
    warnings: ["compat:audit_fields_missing_schema_cache"],
  };
}

async function updateFlightWithAuditFallback(db, flightId, updates, { selectSingle = false } = {}) {
  const runUpdate = async (payload) => {
    let q = db.from("flights").update(payload).eq("id", flightId);
    if (selectSingle) q = q.select("*").single();
    return q;
  };

  const first = await runUpdate(updates);
  if (!first.error) return { data: first.data || null, warnings: [] };
  if (!isSchemaCacheMissingAuditColumnError(first.error)) throw first.error;

  const retry = await runUpdate(stripFlightAuditFields(updates));
  if (retry.error) throw retry.error;
  return {
    data: retry.data || null,
    warnings: ["compat:audit_fields_missing_schema_cache"],
  };
}

export async function applyOpsMutation({
  db,
  action,
  payload = {},
  audit = {},
  resolveFlight = null,
} = {}) {
  if (!db) throw new Error("db is required");

  if (action === "create_flight") {
    const row = buildCreateFlightMutation(payload, audit);
    const inserted = await insertFlightWithAuditFallback(db, row);
    return { action, flight: inserted.data, warnings: inserted.warnings };
  }

  if (action === "change_aircraft_status") {
    const statusMutation = buildAircraftStatusMutation(payload, audit);
    const { error } = await db.from("aircraft_status").upsert([statusMutation]);
    if (error) throw error;
    return { action, aircraftStatus: statusMutation, warnings: [] };
  }

  if (!["edit_flight", "cancel_flight", "duplicate_flight"].includes(action)) {
    throw new Error("Unsupported action");
  }

  const resolved = resolveFlight ? await resolveFlight(payload, action) : { flightId: payload.flight_id || null, candidates: [] };
  const flightId = payload.flight_id || resolved.flightId;

  if (!flightId) {
    return {
      action,
      error: "flight_not_resolved",
      candidates: resolved.candidates || [],
      message: !resolved.candidates?.length
        ? "No encontré un vuelo que coincida para editar/cancelar."
        : "Referencia ambigua: encontré múltiples vuelos. Agrega fecha/hora/aeronave para continuar.",
      warnings: [],
    };
  }

  if (action === "edit_flight") {
    const { data: existing } = await db.from("flights").select("*").eq("id", flightId).single();
    const updates = buildEditFlightMutation(payload, audit);
    const updated = await updateFlightWithAuditFallback(db, flightId, updates, { selectSingle: true });
    return {
      action,
      flight: updated.data || { ...(existing || {}), ...updates },
      previousFlight: existing || null,
      flightId,
      warnings: updated.warnings,
    };
  }

  if (action === "cancel_flight") {
    const { data: existing } = await db.from("flights").select("*").eq("id", flightId).single();
    const cancelled = await updateFlightWithAuditFallback(db, flightId, buildCancelFlightMutation(audit));
    return { action, flight: existing || { id: flightId, ...payload }, flightId, warnings: cancelled.warnings };
  }

  const { data, error } = await db.from("flights").select("*").eq("id", flightId).single();
  if (error) throw error;
  const duplicated = buildDuplicateFlightMutation(data || {}, payload, audit);
  const inserted = await insertFlightWithAuditFallback(db, duplicated);
  return {
    action,
    flight: inserted.data,
    sourceFlight: data || null,
    flightId,
    warnings: inserted.warnings,
  };
}

export const __opsWriteCompat = {
  stripFlightAuditFields,
  isSchemaCacheMissingAuditColumnError,
};
