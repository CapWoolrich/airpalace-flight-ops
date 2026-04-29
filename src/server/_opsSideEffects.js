import {
  buildAircraftStatusNotificationPayload,
  buildFlightNotificationPayload,
  buildOpsPush,
} from "../lib/opsNotifications.js";
import { buildWhatsAppFlightMessage } from "./_whatsappMessage.js";
import { sendOperationalEmail } from "./_emailSender.js";
import { getWebPushClient, sendPushBatch } from "./_push.js";

const WHATSAPP_TIMEOUT_MS = 10_000;

async function sendPushToSubscribers(supabase, payload) {
  const pushClient = await getWebPushClient();
  if (!pushClient.ok) return { ok: false, warning: pushClient.error };

  const { data, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (error) return { ok: false, warning: error.message || "push_subscriptions read failed" };

  const pushResult = await sendPushBatch(pushClient.webpush, data || [], payload);
  if (pushResult.invalidEndpoints.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", pushResult.invalidEndpoints);
  }
  return { ok: true, sent: pushResult.sent, failed: pushResult.failed };
}

function summarizeProviderBody(raw) {
  const clean = String(raw || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "empty_response";
  return clean.slice(0, 160);
}

async function sendWhatsApp(flight, label) {
  const phone = String(process.env.CALLMEBOT_PHONE || "").trim();
  const apikey = String(process.env.CALLMEBOT_APIKEY || "").trim();
  if (!phone || !apikey) return { ok: false, warning: "whatsapp_env_missing" };
  if (!flight?.ac || !flight?.orig || !flight?.dest || !flight?.date) return { ok: false, warning: "flight_payload_incomplete" };

  const text = buildWhatsAppFlightMessage(flight, label);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHATSAPP_TIMEOUT_MS);

  try {
    const r = await fetch(url, { signal: controller.signal });
    const providerBody = summarizeProviderBody(await r.text().catch(() => ""));
    if (!r.ok) return { ok: false, warning: `whatsapp_provider_rejected:${providerBody}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, warning: `whatsapp_network_failure:${String(error?.message || "unknown_error").slice(0, 120)}` };
  } finally {
    clearTimeout(timeout);
  }
}

export function shouldEmitFlightWhatsApp(eventType) {
  const normalized = String(eventType || "").toLowerCase();
  return ["create", "duplicate", "cancel"].includes(normalized);
}

export function mapFlightWhatsAppLabel(eventType) {
  const normalized = String(eventType || "").toLowerCase();
  if (normalized === "create" || normalized === "duplicate") return "PROGRAMADO";
  if (normalized === "cancel") return "CANCELADO";
  return null;
}

export function mapFlightEmailEventType(eventType) {
  const normalized = String(eventType || "").toLowerCase();
  if (normalized === "create" || normalized === "duplicate") return "flight_created";
  if (normalized === "edit") return "flight_updated";
  if (normalized === "cancel") return "flight_cancelled";
  return null;
}

export function shouldEmitFlightEmail(eventType) {
  return !!mapFlightEmailEventType(eventType);
}

export async function emitFlightSideEffects({
  supabase,
  eventType,
  flight,
  actorName,
} = {}) {
  const warnings = [];
  if (!supabase || !flight) return { warnings: ["side_effects_missing_context"] };
  const suppressIndividual = flight?.suppressIndividualNotifications || flight?.suppress_individual_notifications;

  try {
    const pushTypeMap = {
      create: "flight_programmed",
      edit: "flight_modified",
      cancel: "flight_cancelled",
      duplicate: "flight_programmed",
    };
    const pushPayload = buildOpsPush(pushTypeMap[eventType], flight);
    const pushRes = await sendPushToSubscribers(supabase, pushPayload);
    if (pushRes.warning) warnings.push(`push:${pushRes.warning}`);
  } catch {
    warnings.push("push:unexpected_error");
  }

  if (!suppressIndividual && shouldEmitFlightEmail(eventType)) {
    try {
      const emailEventType = mapFlightEmailEventType(eventType);
      const emailLabelByType = {
        flight_created: "Vuelo programado",
        flight_updated: "Vuelo modificado",
        flight_cancelled: "Vuelo cancelado",
      };
      const emailResult = await sendOperationalEmail({
        eventType: emailEventType,
        payload: buildFlightNotificationPayload(flight, actorName, {
          eventLabel: emailLabelByType[emailEventType] || "Actualización de vuelo",
        }),
      });
      if (emailResult?.warning) warnings.push(`email:${emailResult.warning}`);
      if (emailResult?.ok === false && emailResult?.error) warnings.push(`email:${emailResult.error}`);
    } catch {
      warnings.push("email:unexpected_error");
    }
  }

  if (!suppressIndividual && shouldEmitFlightWhatsApp(eventType)) {
    const whatsappLabel = mapFlightWhatsAppLabel(eventType);
    if (!whatsappLabel) {
      warnings.push("whatsapp:unsupported_event_type");
    } else {
      const wa = await sendWhatsApp(flight, whatsappLabel);
      if (!wa.ok && wa.warning) warnings.push(`whatsapp:${wa.warning}`);
    }
  }

  return { warnings };
}

export async function emitAircraftStatusSideEffects({
  supabase,
  ac,
  status,
  maintenanceEndDate,
  actorName,
} = {}) {
  const warnings = [];
  if (!supabase || !ac || !status) return { warnings };
  if (!["aog", "mantenimiento"].includes(String(status))) return { warnings };

  try {
    const pushPayload = status === "aog"
      ? buildOpsPush("aog", { ac })
      : buildOpsPush("maintenance", { ac, maintenanceEndDate });
    const pushRes = await sendPushToSubscribers(supabase, pushPayload);
    if (pushRes.warning) warnings.push(`push:${pushRes.warning}`);
  } catch {
    warnings.push("push:unexpected_error");
  }

  try {
    const emailResult = await sendOperationalEmail({
      eventType: status === "aog" ? "aircraft_aog" : "aircraft_maintenance",
      payload: status === "aog"
        ? buildAircraftStatusNotificationPayload({ ac, actorName, eventLabel: "AOG" })
        : buildAircraftStatusNotificationPayload({ ac, actorName, maintenanceEndDate, eventLabel: "Mantenimiento" }),
    });
    if (emailResult?.warning) warnings.push(`email:${emailResult.warning}`);
    if (emailResult?.ok === false && emailResult?.error) warnings.push(`email:${emailResult.error}`);
  } catch {
    warnings.push("email:unexpected_error");
  }

  return { warnings };
}
