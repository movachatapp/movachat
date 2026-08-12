// ========================================================
// 📱 SERVICE WORKER MOVACHAT (Versión Optimizada v1.0.0.0.0.4)
// ========================================================

const CACHE_NAME = 'movachat-v1.0.0.0.0.4';

// Recursos estáticos base
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './assets/logo/icon-192.png',
  './assets/logo/icon-512.png',
  './assets/logo/badge-72.png',
  './assets/sounds/enviado.mp3',
  './assets/sounds/grabando.mp3',
  './assets/sounds/recibido.mp3'
];

// 1. Instalar el Service Worker con tolerancia a fallos en archivos individuales
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`⚠️ No se pudo precachar el recurso: ${url}`, err);
          })
        )
      );
    })
  );
});

// 2. Activar y borrar cachés antiguas
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

// 3. Estrategia RED PRIMERO para código/estilos y CACHÉ PRIMERO para multimedia
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no sean GET o que provengan de extensiones/APIs externas como Firebase WS
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = event.request.url;

  // CÓDIGO Y ESTILOS DINÁMICOS (HTML, JS, CSS): Siempre pedir versión fresca de la red
  if (url.endsWith('.js') || url.endsWith('.css') || url.includes('.html') || url === self.location.origin + '/') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // OTROS RECURSOS (Imágenes, Fuentes, Audios): Buscar en caché primero
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});

// 4. RECEPTOR DE NOTIFICACIONES PUSH EN SEGUNDO PLANO
self.addEventListener('push', (event) => {
  let data = { 
    titulo: 'MovaChat 💬', 
    cuerpo: 'Tienes un nuevo mensaje recibido 📩', 
    icono: './assets/logo/icon-192.png' 
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.cuerpo = event.data.text();
    }
  }

  const opciones = {
    body: data.cuerpo || 'Tienes un nuevo mensaje recibido 📩',
    icon: data.icono || './assets/logo/icon-192.png',
    badge: './assets/logo/badge-72.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'nuevo-mensaje',
    renotify: true,
    data: { url: self.registration.scope }
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo || 'MovaChat', opciones)
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