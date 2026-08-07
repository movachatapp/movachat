// ========================================================
// 📱 SERVICE WORKER MOVACHAT (Versión Reparada v1.1)
// ========================================================

const CACHE_NAME = 'movachat-v4.5';

// Solo guardamos recursos ESTÁTICOS (Imágenes, Fuentes, CSS base)
const ASSETS_TO_CACHE = [
  './styles.css',
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

// 2. Activar y borrar cachés viejas
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

// 3. Estrategia RED PRIMERO para scripts (Evita congelar contadores en caché)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // SI ES CÓDIGO JS O HTML: Pedir SIEMPRE la versión fresca de la red
  if (event.request.url.includes('app.js') || event.request.url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Para otros archivos (imágenes/CSS), buscar en caché primero
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
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

// 5. Evento al tocar la notificación
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