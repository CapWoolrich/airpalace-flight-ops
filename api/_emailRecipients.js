const EVENT_ROUTING = {
  flight_created: { ops: true, pilots: true },
  flight_updated: { ops: true, pilots: true },
  flight_cancelled: { ops: true, pilots: true },
  aircraft_aog: { ops: true, pilots: false },
  aircraft_maintenance: { ops: true, pilots: false },
  operational_conflict: { ops: true, pilots: false },
  tomorrow_flight_reminder: { ops: true, pilots: true },
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
    ruleSummary: "Enrutamiento activo para Ops/Pilots. Destinatarios owner deshabilitados.",
  };
}
