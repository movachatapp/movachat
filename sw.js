// Nombre de la versión del caché
const CACHE_NAME = 'movachat-v2.6';

// Archivos básicos para guardar en memoria del dispositivo
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
  self.skipWaiting(); // Se activa inmediatamente sin esperar a cerrar la ventana
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activar y borrar cachés viejos
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
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia inteligente de carga (Red primero, si falla usa Caché)
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a Firebase u otros dominios externos
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Guarda la copia actualizada en segundo plano
        if (event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si no hay conexión a internet, entrega la versión guardada
        return caches.match(event.request);
      })
  );
});

// 4. Evento al tocar una notificación Push
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

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