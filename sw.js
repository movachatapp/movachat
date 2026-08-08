// ========================================================
// 📱 SERVICE WORKER MOVACHAT (Versión Reparada v5.9)
// ========================================================

const CACHE_NAME = 'movachat-v5.9';

// Recursos esenciales para arranque Offline y caché base
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
    }).catch((err) => console.warn('Error precargando caché:', err))
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

// 3. Estrategia Red Primero segura para scripts (Evita congelamientos si la red falla)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // SI ES CÓDIGO JS, CSS O HTML: Pedir la versión fresca y actualizar caché
  if (
    event.request.url.includes('app.js') || 
    event.request.url.includes('index.html') ||
    event.request.url.includes('styles.css')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          
          // Retorno seguro en caso de fallo crítico de red para evitar la pantalla vacía
          return new Response('/* Error de conexión */', { 
            status: 503, 
            headers: { 'Content-Type': 'text/javascript' } 
          });
        })
    );
    return;
  }

  // Para otros archivos (imágenes/fuentes), buscar en caché primero
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      });
    }).catch(() => {
      return new Response('', { status: 404 });
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