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

// --- PWA OFFLINE CACHING ---
const CACHE_NAME = 'pips-attendant-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/premium.html',
  '/style.css',
  '/app.js',
  '/avatar.png',
  '/favicon.png'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-First, falling back to cache)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

