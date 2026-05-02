const EVENT_ROUTING = {
  flight_created: { ops: true, pilots: true },
  flight_updated: { ops: true, pilots: true },
  flight_cancelled: { ops: true, pilots: true },
  aircraft_aog: { ops: true, pilots: false },
  aircraft_maintenance: { ops: true, pilots: false },
  operational_conflict: { ops: true, pilots: false },
  tomorrow_flight_reminder: { ops: true, pilots: true },
};

const REQUESTER_KEY_ALIASES = new Map([
  ["jabib c", "jabib_c"],
  ["omar c", "omar_c"],
  ["gibran c", "gibran_c"],
  ["jose c", "jose_c"],
]);

export function parseCsvEmails(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}

function uniq(list) {
  return Array.from(new Set(list));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapRequestedByToRequesterKey(requestedBy) {
  const normalized = normalizeText(requestedBy);
  if (!normalized) return null;

  if (REQUESTER_KEY_ALIASES.has(normalized)) {
    return REQUESTER_KEY_ALIASES.get(normalized);
  }

  const underscored = normalized.replace(/\s+/g, "_");
  if (REQUESTER_KEY_ALIASES.has(underscored.replace(/_/g, " "))) {
    return REQUESTER_KEY_ALIASES.get(underscored.replace(/_/g, " "));
  }
  if (/^[a-z0-9_]+$/.test(underscored)) return underscored;
  return null;
}

export async function getRequesterEmailRecipient(requestedBy, { serviceSupabase, logger = console } = {}) {
  const requesterKey = mapRequestedByToRequesterKey(requestedBy);
  logger.info?.("[email-recipients] requester lookup", {
    requestedBy: requestedBy || "",
    requester_key: requesterKey,
  });

  if (!serviceSupabase || !requesterKey) {
    logger.info?.("[email-recipients] requester lookup skipped", {
      requester_key: requesterKey,
      hasServiceClient: Boolean(serviceSupabase),
    });
    return null;
  }

  const { data, error } = await serviceSupabase
    .from("requester_email_recipients")
    .select("requester_email")
    .eq("requester_key", requesterKey)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    logger.error?.("[email-recipients] requester lookup failed", {
      requester_key: requesterKey,
      error: error.message,
    });
    return null;
  }

  const requesterEmail = String(data?.requester_email || "").trim().toLowerCase();
  const valid = requesterEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail);
  logger.info?.("[email-recipients] requester lookup result", {
    requester_key: requesterKey,
    foundActiveRecipient: Boolean(valid),
  });
  return valid ? requesterEmail : null;
}

export function computeEmailRecipients({ eventType, requestor, env = process.env }) {
  const cfg = EVENT_ROUTING[eventType] || { ops: true, pilots: true };
  const opsRecipients = cfg.ops ? parseCsvEmails(env.OPS_EMAILS) : [];
  const pilotRecipients = cfg.pilots ? parseCsvEmails(env.PILOTS_EMAILS) : [];
  const finalRecipients = uniq(opsRecipients.concat(pilotRecipients));

  return {
    eventType,
    requestor: requestor || "",
    opsRecipients,
    pilotRecipients,
    finalRecipients,
    ruleSummary: "Enrutamiento activo para Ops/Pilots.",
  };
}
