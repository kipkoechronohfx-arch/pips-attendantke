self.addEventListener('push', e => {
  const data = e.data.json();
  console.log('Push Recieved...');
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    url: data.url
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.notification.data && e.notification.data.url) {
    e.waitUntil(clients.openWindow(e.notification.data.url));
  } else {
    e.waitUntil(clients.openWindow('/'));
  }
});
