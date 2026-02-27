// Service Worker for Push Notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || "",
      icon: data.icon || "/logo.png",
      badge: data.badge || "/logo.png",
      image: data.image || undefined,
      vibrate: [200, 100, 200],
      data: {
        url: data.url || "/",
      },
    };

    event.waitUntil(self.registration.showNotification(data.title || "Benjamin Franklin", options));
  } catch (err) {
    console.error("[sw] Failed to process push event:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          if ("navigate" in client) {
            return client.navigate(targetUrl).then((c) => c && c.focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
