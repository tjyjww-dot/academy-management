// 수학탐구 웹 푸시 알림 Service Worker
self.addEventListener('push', function(event) {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/', dateOfArrival: Date.now() },
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(data.title || '수학탐구', options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', function(event) { self.skipWaiting(); });
self.addEventListener('activate', function(event) { event.waitUntil(self.clients.claim()); });
