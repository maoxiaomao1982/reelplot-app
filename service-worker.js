// Service Worker for 视频制作流程管理 PWA
// Caches app shell + CDN libraries for offline use

const CACHE_VERSION = 'v1.0.2';
const CACHE_NAME = 'video-production-' + CACHE_VERSION;

// App shell files to cache immediately
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// CDN libraries to cache (cache-first strategy)
const CDN_URLS = [
  'https://cdn.bootcdn.net/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.staticfile.org/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.bootcdn.net/ajax/libs/tesseract.js/5.1.1/tesseract.min.js',
  'https://cdn.staticfile.org/tesseract.js/5.1.1/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js'
];

// Install: cache app shell immediately
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL).catch(function(err) {
        console.warn('SW: Some app shell files failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: different strategies for different resources
self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // CDN scripts: cache-first (try cache, then network, cache the response)
  if (CDN_URLS.some(function(cdn) { return url.href.startsWith(cdn) || cdn.startsWith(url.href); }) ||
      url.hostname.includes('tesseract') || url.hostname.includes('unpkg') ||
      url.hostname.includes('jsdelivr') || url.hostname.includes('cdnjs') ||
      url.hostname.includes('bootcdn') || url.hostname.includes('staticfile')) {
    event.respondWith(
      caches.match(request).then(function(cached) {
        if (cached) return cached;
        return fetch(request).then(function(response) {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(request, clone).catch(function() {});
            });
          }
          return response;
        }).catch(function() {
          return cached || new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // Tesseract worker/wasm/language data: cache-first
  if (url.pathname.includes('tesseract') || url.pathname.includes('.wasm') ||
      url.pathname.includes('worker') || url.pathname.includes('traineddata')) {
    event.respondWith(
      caches.match(request).then(function(cached) {
        if (cached) return cached;
        return fetch(request).then(function(response) {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(request, clone).catch(function() {});
            });
          }
          return response;
        }).catch(function() {
          return cached || new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // App shell: stale-while-revalidate
  if (url.origin === self.location.origin) {
    // Network-first: always serve the freshest index.html / app shell so
    // redeploys take effect immediately; fall back to cache only when offline.
    event.respondWith(
      fetch(request).then(function(response) {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, clone).catch(function() {});
          });
        }
        return response;
      }).catch(function() {
        return caches.match(request);
      })
    );
    return;
  }

  // Default: try network, fallback to cache
  event.respondWith(
    fetch(request).catch(function() {
      return caches.match(request);
    })
  );
});
