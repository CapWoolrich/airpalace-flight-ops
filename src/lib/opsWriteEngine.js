import {
  buildAircraftStatusMutation,
  buildCancelFlightMutation,
  buildCreateFlightMutation,
  buildDuplicateFlightMutation,
  buildEditFlightMutation,
} from "./opsMutationBuilders.js";

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
    const { data, error } = await db.from("flights").insert([row]).select("*").single();
    if (error) throw error;
    return { action, flight: data || row };
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
    const { data: updated, error } = await db.from("flights").update(updates).eq("id", flightId).select("*").single();
    if (error) throw error;
    return { action, flight: updated || { ...(existing || {}), ...updates }, previousFlight: existing || null, flightId };
  }

  if (action === "cancel_flight") {
    const { data: existing } = await db.from("flights").select("*").eq("id", flightId).single();
    const { error } = await db.from("flights").update(buildCancelFlightMutation(audit)).eq("id", flightId);
    if (error) throw error;
    return { action, flight: existing || { id: flightId, ...payload }, flightId };
  }

  const { data, error } = await db.from("flights").select("*").eq("id", flightId).single();
  if (error) throw error;
  const duplicated = buildDuplicateFlightMutation(data || {}, payload, audit);
  const { data: duplicatedSaved, error: insError } = await db.from("flights").insert([duplicated]).select("*").single();
  if (insError) throw insError;
  return { action, flight: duplicatedSaved || duplicated, sourceFlight: data || null, flightId };
}
