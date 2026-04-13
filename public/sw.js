self.addEventListener("push", function (event) {
  let payload = { title: "AirPalace Flight Ops", body: "Nueva actualización operativa", url: "/" };
  try {
    const parsed = event.data ? event.data.json() : null;
    if (parsed) payload = { ...payload, ...parsed };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/logo-192.png",
      badge: "/logo-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
