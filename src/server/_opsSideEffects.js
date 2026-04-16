import {
  buildAircraftStatusNotificationPayload,
  buildFlightNotificationPayload,
  buildOpsPush,
} from "../lib/opsNotifications.js";
import { buildWhatsAppFlightMessage } from "./_whatsappMessage.js";
import { sendOperationalEmail } from "./_emailSender.js";
import { getWebPushClient, sendPushBatch } from "./_push.js";

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

async function sendWhatsApp(flight, label) {
  const phone = String(process.env.CALLMEBOT_PHONE || "").trim();
  const apikey = String(process.env.CALLMEBOT_APIKEY || "").trim();
  if (!phone || !apikey) return { ok: false, warning: "whatsapp_env_missing" };
  if (!flight?.ac || !flight?.orig || !flight?.dest || !flight?.date) return { ok: false, warning: "flight_payload_incomplete" };

  const text = buildWhatsAppFlightMessage(flight, label);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, warning: "whatsapp_provider_rejected" };
    return { ok: true };
  } catch {
    return { ok: false, warning: "whatsapp_network_failure" };
  }
}

export async function emitFlightSideEffects({
  supabase,
  eventType,
  flight,
  actorName,
  sendWhatsapp = false,
} = {}) {
  const warnings = [];
  if (!supabase || !flight) return { warnings: ["side_effects_missing_context"] };

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

  try {
    const emailTypeMap = {
      create: "flight_created",
      edit: "flight_updated",
      cancel: "flight_cancelled",
      duplicate: "flight_created",
    };
    const emailLabelMap = {
      create: "Vuelo programado",
      edit: "Vuelo modificado",
      cancel: "Vuelo cancelado",
      duplicate: "Vuelo programado",
    };
    const emailResult = await sendOperationalEmail({
      eventType: emailTypeMap[eventType],
      payload: buildFlightNotificationPayload(flight, actorName, { eventLabel: emailLabelMap[eventType] }),
    });
    if (emailResult?.warning) warnings.push(`email:${emailResult.warning}`);
    if (emailResult?.ok === false && emailResult?.error) warnings.push(`email:${emailResult.error}`);
  } catch {
    warnings.push("email:unexpected_error");
  }

  if (sendWhatsapp) {
    const wa = await sendWhatsApp(flight, eventType === "edit" ? "MODIFICADO" : "PROGRAMADO");
    if (!wa.ok && wa.warning && wa.warning !== "whatsapp_env_missing") warnings.push(`whatsapp:${wa.warning}`);
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
