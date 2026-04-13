const EVENT_ROUTING = {
  flight_created: { ops: true, pilots: true, ownerByRequestor: true },
  flight_updated: { ops: true, pilots: true, ownerByRequestor: true },
  flight_cancelled: { ops: true, pilots: true, ownerByRequestor: true },
  aircraft_aog: { ops: true, pilots: false, ownerByRequestor: false },
  aircraft_maintenance: { ops: true, pilots: false, ownerByRequestor: false },
  operational_conflict: { ops: true, pilots: false, ownerByRequestor: false },
  tomorrow_flight_reminder: { ops: true, pilots: true, ownerByRequestor: true },
};

export const OWNER_BY_REQUESTOR = {
  "jabib c": "jachapur@thepalacecompany.com",
  "anuar c": "achapur@thepalacecompany.com",
  "omar c": "ochapur@thepalacecompany.com",
  "gibran c": "gchapur@thepalacecompany.com",
  "jose c": "jchapur@thepalacecompany.com",
};

export function parseCsvEmails(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}

function uniq(list) {
  return Array.from(new Set(list));
}

export function resolveOwnerRecipient(requestor) {
  const key = String(requestor || "").trim().toLowerCase();
  return OWNER_BY_REQUESTOR[key] || null;
}

export function computeEmailRecipients({ eventType, requestor, env = process.env }) {
  const cfg = EVENT_ROUTING[eventType] || { ops: true, pilots: true, ownerByRequestor: false };
  const opsRecipients = cfg.ops ? parseCsvEmails(env.OPS_EMAILS) : [];
  const pilotRecipients = cfg.pilots ? parseCsvEmails(env.PILOTS_EMAILS) : [];
  const ownerRecipient = cfg.ownerByRequestor ? resolveOwnerRecipient(requestor) : null;
  const finalRecipients = uniq(opsRecipients.concat(pilotRecipients, ownerRecipient ? [ownerRecipient] : []));

  return {
    eventType,
    requestor: requestor || "",
    ownerRecipient,
    opsRecipients,
    pilotRecipients,
    finalRecipients,
    ruleSummary: ownerRecipient
      ? "Se incluyó únicamente el owner correspondiente al requestor."
      : "No hay owner mapeado para este requestor o el evento no requiere owner.",
  };
}
