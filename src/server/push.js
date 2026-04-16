export function readVapidEnv() {
  return {
    vapidPublic: process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || process.env.VITE_PUBLIC_VAPID_KEY,
    vapidPrivate: process.env.VAPID_PRIVATE_KEY,
    vapidSubject: process.env.VAPID_SUBJECT,
  };
}

export async function getWebPushClient() {
  const { vapidPublic, vapidPrivate, vapidSubject } = readVapidEnv();
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return { ok: false, error: "VAPID env missing" };
  }

  try {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    return { ok: true, webpush };
  } catch {
    return { ok: false, error: "web-push package unavailable" };
  }
}

export async function sendPushBatch(webpush, subscriptions = [], payload = {}) {
  let sent = 0;
  let failed = 0;
  const invalidEndpoints = [];

  await Promise.all((subscriptions || []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (e) {
      failed += 1;
      if (Number(e?.statusCode) === 404 || Number(e?.statusCode) === 410) {
        invalidEndpoints.push(sub.endpoint);
      }
    }
  }));

  return { sent, failed, invalidEndpoints };
}
