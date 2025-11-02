const CACHE_NAME = 'chromachat-cache-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([
          OFFLINE_URL,
          '/manifest.webmanifest',
          '/icons/icon-192.png',
          '/icons/icon-512.png'
        ])
      )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const isSameOrigin = new URL(request.url).origin === self.location.origin;

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(request);

        if (isSameOrigin && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put(request, networkResponse.clone()));
        }

        return networkResponse;
      } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        if (request.mode === 'navigate') {
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) {
            return offlinePage;
          }
        }

        return new Response('离线状态，资源不可用', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});

