function clean(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function buildAuditMeta({
  source = "manual",
  actorEmail = "",
  actorName = "",
  actorUserId = "",
} = {}) {
  const email = clean(actorEmail);
  const name = clean(actorName) || (email.includes("@") ? email.split("@")[0] : "");
  const userId = clean(actorUserId);
  return {
    created_by_user_id: userId || null,
    created_by_user_email: email || null,
    created_by_user_name: name || null,
    created_by_email: email || null,
    created_by_name: name || null,
    updated_by_email: email || null,
    updated_by_name: name || null,
    creation_source: source,
  };
}

export function withFlightCreateMeta(baseRow = {}, audit = {}) {
  return {
    ...baseRow,
    created_by_user_id: audit.created_by_user_id || null,
    created_by_user_email: audit.created_by_user_email || null,
    created_by_user_name: audit.created_by_user_name || null,
    created_by_email: audit.created_by_email || null,
    created_by_name: audit.created_by_name || null,
    updated_by_email: audit.updated_by_email || null,
    updated_by_name: audit.updated_by_name || null,
    creation_source: audit.creation_source || "manual",
    updated_at: audit.nowIso || new Date().toISOString(),
  };
}

export function withFlightUpdateMeta(baseUpdates = {}, audit = {}) {
  return {
    ...baseUpdates,
    updated_by_email: audit.updated_by_email || null,
    updated_by_name: audit.updated_by_name || null,
    updated_at: audit.nowIso || new Date().toISOString(),
  };
}

function normalizeMaintDate(value) {
  if (!value) return null;
  const asText = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(asText) ? asText : null;
}

export function buildAircraftStatusMutation(payload = {}, audit = {}) {
  const nextStatus = String(payload.status_change || payload.status || "").toLowerCase();
  const start = normalizeMaintDate(payload.maintenance_start_date || payload.date);
  const end = normalizeMaintDate(payload.maintenance_end_date);
  const isMaintLike = nextStatus === "mantenimiento" || nextStatus === "aog";

  return {
    ac: payload.ac,
    status: nextStatus,
    maintenance_start_date: isMaintLike ? start : null,
    maintenance_end_date: isMaintLike ? end : null,
    updated_at: audit.nowIso || new Date().toISOString(),
  };
}
