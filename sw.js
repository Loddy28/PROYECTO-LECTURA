const CACHE_NAME = 'lector-pdf-cache-v8';
const RECURSOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './tools.js',
  './ui.js',
  './viewer.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.css'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(RECURSOS)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== 'lector-recientes-bin-v1').map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});