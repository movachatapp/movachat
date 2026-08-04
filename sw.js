// Nombre de la versión del caché (subida a v0.6 para refrescar cambios)
const CACHE_NAME = 'movachat-v1.1';

// Archivos básicos para guardar en caché y cargar súper rápido
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/logo/icon-192.png',
  './assets/logo/icon-512.png'
];

// 1. Instalar el Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activar y limpiar cachés antiguos si los hay
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 3. Responder con caché o red
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});

// 4. Evento al hacer clic en una notificación Push emergente
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Cierra la tarjeta emergente

  // Enfoca la ventana de la app si ya está abierta, o abre una nueva
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});