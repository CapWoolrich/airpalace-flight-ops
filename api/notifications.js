import sendEmailHandler from "../src/server/apiHandlers/sendEmailHandler.js";
import sendWhatsappHandler from "../src/server/apiHandlers/sendWhatsappHandler.js";
import sendPushNotificationHandler from "../src/server/apiHandlers/sendPushNotificationHandler.js";
import savePushSubscriptionHandler from "../src/server/apiHandlers/savePushSubscriptionHandler.js";
import opsRemindersHandler from "../src/server/apiHandlers/opsRemindersHandler.js";
import opsSideEffectsHandler from "../src/server/apiHandlers/opsSideEffectsHandler.js";

const MAP = {
  "send-email": sendEmailHandler,
  "send-whatsapp": sendWhatsappHandler,
  "send-push-notification": sendPushNotificationHandler,
  "save-push-subscription": savePushSubscriptionHandler,
  "ops-reminders": opsRemindersHandler,
  "ops-side-effects": opsSideEffectsHandler,
};

export default async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || "").trim();
  const target = MAP[action];
  if (!target) return res.status(400).json({ ok: false, error: "action inválida", allowed: Object.keys(MAP) });
  return target(req, res);
}
