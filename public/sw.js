const CACHE = 'agora-shell-v1';
const APP_ROOT = new URL('./', self.location.href).pathname;
const SHELL = [APP_ROOT, `${APP_ROOT}manifest.webmanifest`, `${APP_ROOT}icons/icon-192.png`, `${APP_ROOT}icons/icon-512.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('agora-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/material/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE).then((cache) => cache.put(APP_ROOT, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) ?? (await caches.match(APP_ROOT))));
    return;
  }

  event.respondWith(fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') void caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(async () => await caches.match(request) ?? Response.error()));
});
