// ========================================================
// 📱 SERVICE WORKER MOVACHAT (Versión Corregida)
// ========================================================

const CACHE_NAME = 'movachat-v3.9';

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
  self.skipWaiting();
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

// 3. Carga de red segura (Evita errores de conversión Response)
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones externas (Firebase, Google APIs, etc.) y peticiones no-GET
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Verificar que la respuesta sea válida antes de guardarla
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si no hay red, entrega la versión guardada en caché
        return caches.match(event.request);
      })
  );
});

// 🚀 4. RECEPTOR DE NOTIFICACIONES PUSH
self.addEventListener('push', (event) => {
  let data = { titulo: 'MovaChat 💬', cuerpo: 'Tienes un nuevo mensaje recibido 📩', icono: './assets/logo/icon-192.png' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.cuerpo = event.data.text();
    }
  }

  const opciones = {
    body: data.cuerpo || data.texto || 'Tienes un nuevo mensaje recibido 📩',
    icon: data.icono || data.avatarUrl || './assets/logo/icon-192.png',
    badge: './assets/logo/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: self.registration.scope
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo || data.nombreRemitente || 'MovaChat', opciones)
  );
});

// 5. Evento al tocar la notificación en el teléfono
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