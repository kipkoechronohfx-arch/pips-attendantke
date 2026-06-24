// ═══════════════════════════════════════════════════════════
//  Pips_attendant Service Worker  — v3
//  Strategy:
//    • Cache-First  → static assets (images, fonts, CSS, JS)
//    • Network-First → HTML pages (always fresh when online)
//    • Offline fallback → /offline.html for uncached pages
// ═══════════════════════════════════════════════════════════

const CACHE_NAME    = 'pips-attendant-v3';
const OFFLINE_URL   = '/offline.html';

// Core shell — pre-cached on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/premium.html',
  '/journal.html',
  '/propfirm.html',
  '/history.html',
  '/offline.html',
  '/style.css',
  '/dist.css',
  '/app.js',
  '/chat-widget.js',
  '/manifest.json',
  '/avatar.png',
  '/favicon.png',
  '/dubai_bg.png',
  '/justmarkets.png',
  '/xm.png',
  '/image.png'
];

// Static asset extensions → Cache-First
const STATIC_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico',
                     '.woff', '.woff2', '.ttf', '.css', '.js'];

function isStaticAsset(url) {
  return STATIC_EXTS.some(ext => url.pathname.endsWith(ext));
}

// ── Install: pre-cache the shell ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache failed (some assets may be missing):', err.message))
  );
});

// ── Activate: purge old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing ──────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API requests — always go to network
  if (request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Skip cross-origin requests (CDNs etc.) — let browser handle
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isStaticAsset(url)) {
    // ── Cache-First for static assets ──────────────────────
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response('Asset unavailable offline.', { status: 503 }));
      })
    );
  } else {
    // ── Network-First for HTML pages ────────────────────────
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match(OFFLINE_URL))
        )
    );
  }
});

// ── Push Notifications ────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'Pips Attendant', body: event.data ? event.data.text() : 'New update!' }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Pips Attendant', {
      body:    data.body  || 'Check the latest VIP signals.',
      icon:    data.icon  || '/favicon.png',
      badge:   data.badge || '/favicon.png',
      tag:     data.tag   || 'pips-signal',
      data:    { url: data.url || data.data?.url || '/premium.html' },
      vibrate: [200, 100, 200]
    })
  );
});

// ── Notification Click ────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/premium.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
