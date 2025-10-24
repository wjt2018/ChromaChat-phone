const CACHE_NAME = 'chromachat-cache-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL, '/manifest.webmanifest', '/icons/icon.svg']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('离线状态，资源不可用。', { status: 503, statusText: 'Offline' });
        })
      )
  );
});
