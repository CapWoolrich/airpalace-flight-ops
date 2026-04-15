import { normalizeRequesterValue } from "./agentUtils";

function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

export async function resolveFlightTarget({
  db,
  payload = {},
  action = "edit_flight",
  limit = 25,
} = {}) {
  if (!db) throw new Error("db is required");
  if (payload.flight_id) return { flightId: payload.flight_id, candidates: [] };

  const filters = {
    date: payload.date || null,
    ac: payload.ac || null,
    orig: payload.orig || null,
    dest: payload.dest || null,
    rb: payload.rb || null,
    time: payload.time || null,
  };

  const hasAnyFilter = Object.values(filters).some(Boolean);
  if (!hasAnyFilter) return { flightId: null, candidates: [] };

  let query = db
    .from("flights")
    .select("id, date, time, ac, orig, dest, rb, st")
    .neq("st", "canc")
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(limit);

  if (filters.date) query = query.eq("date", filters.date);
  if (filters.ac) query = query.eq("ac", filters.ac);
  if (filters.orig) query = query.ilike("orig", filters.orig);
  if (filters.dest) query = query.ilike("dest", filters.dest);

  const { data, error } = await query;
  if (error) throw error;

  const targetRb = normalizeRequesterValue(filters.rb);
  let candidates = (data || []).filter((f) => {
    if (targetRb && !sameText(normalizeRequesterValue(f.rb), targetRb)) return false;
    if (filters.time && String(f.time || "") !== String(filters.time || "")) return false;
    return true;
  });

  if (action === "cancel_flight") candidates = candidates.filter((f) => String(f.st || "") !== "canc");

  return {
    flightId: candidates.length === 1 ? candidates[0].id : null,
    candidates,
  };
}
