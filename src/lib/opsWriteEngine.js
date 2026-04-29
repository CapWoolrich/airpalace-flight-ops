import {
  buildAircraftStatusMutation,
  buildCancelFlightMutation,
  buildCreateFlightMutation,
  buildDuplicateFlightMutation,
  buildEditFlightMutation,
} from "./opsMutationBuilders.js";

export const FLIGHT_AUDIT_COLUMNS = new Set([
  "created_by_user_id",
  "created_by_user_email",
  "created_by_user_name",
  "created_by_email",
  "created_by_name",
  "updated_by_email",
  "updated_by_name",
  "creation_source",
]);

const AUDIT_COMPAT_WARNING = "compat:audit_fields_missing_schema_cache";

export function stripFlightAuditFields(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripFlightAuditFields(item));

  const out = {};
  Object.entries(value).forEach(([key, fieldValue]) => {
    if (FLIGHT_AUDIT_COLUMNS.has(key)) return;
    out[key] = fieldValue;
  });
  return out;
}

export function isMissingFlightAuditFieldError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) return false;

  if (!(message.includes("schema cache") || message.includes("column"))) return false;

  for (const column of FLIGHT_AUDIT_COLUMNS) {
    if (message.includes(column.toLowerCase())) return true;
  }
  return false;
}

async function runFlightMutationWithAuditFallback(runWithPayload, payload) {
  const { data, error } = await runWithPayload(payload);
  if (!error) return { data, warnings: [] };

  if (!isMissingFlightAuditFieldError(error)) throw error;

  const safePayload = stripFlightAuditFields(payload);
  const retry = await runWithPayload(safePayload);
  if (retry.error) throw retry.error;
  return { data: retry.data, warnings: [AUDIT_COMPAT_WARNING] };
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
    const { data, warnings } = await runFlightMutationWithAuditFallback(
      (insertRow) => db.from("flights").insert([insertRow]).select("*").single(),
      row,
    );
    return { action, flight: data || stripFlightAuditFields(row), ...(warnings.length ? { warnings } : {}) };
  }

  if (action === "change_aircraft_status") {
    const statusMutation = buildAircraftStatusMutation(payload, audit);
    const { error } = await db.from("aircraft_status").upsert([statusMutation]);
    if (error) throw error;
    return { action, aircraftStatus: statusMutation };
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
    };
  }

  if (action === "edit_flight") {
    const { data: existing } = await db.from("flights").select("*").eq("id", flightId).single();
    const updates = buildEditFlightMutation(payload, audit);
    const { data: updated, warnings } = await runFlightMutationWithAuditFallback(
      (nextUpdates) => db.from("flights").update(nextUpdates).eq("id", flightId).select("*").single(),
      updates,
    );
    return {
      action,
      flight: updated || { ...(existing || {}), ...stripFlightAuditFields(updates) },
      previousFlight: existing || null,
      flightId,
      ...(warnings.length ? { warnings } : {}),
    };
  }

  if (action === "cancel_flight") {
    const { data: existing } = await db.from("flights").select("*").eq("id", flightId).single();
    const cancelMutation = buildCancelFlightMutation(audit, payload);
    const { warnings } = await runFlightMutationWithAuditFallback(
      (nextUpdates) => db.from("flights").update(nextUpdates).eq("id", flightId),
      cancelMutation,
    );
    return {
      action,
      flight: existing || { id: flightId, ...payload },
      flightId,
      ...(warnings.length ? { warnings } : {}),
    };
  }

  const { data, error } = await db.from("flights").select("*").eq("id", flightId).single();
  if (error) throw error;
  const duplicated = buildDuplicateFlightMutation(data || {}, payload, audit);
  const { data: duplicatedSaved, warnings } = await runFlightMutationWithAuditFallback(
    (insertRow) => db.from("flights").insert([insertRow]).select("*").single(),
    duplicated,
  );
  return {
    action,
    flight: duplicatedSaved || stripFlightAuditFields(duplicated),
    sourceFlight: data || null,
    flightId,
    ...(warnings.length ? { warnings } : {}),
  };
}
