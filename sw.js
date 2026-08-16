// ========================================================
// 📱 SERVICE WORKER MOVACHAT (Versión Optimizada)
// ========================================================

const CACHE_NAME = 'movachat-v1.0.0.5';

// Recursos estáticos a descargar e instalar inmediatamente
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

// 1. Instalar el Service Worker con descarga tolerante a fallos
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activar el nuevo SW inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('📦 Precachando iconos, sonidos y recursos estáticos de MovaChat...');
      
      // Intentar cachar cada recurso individualmente para evitar que un fallo bloquee la PWA
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn(`⚠️ No se pudo precachar el recurso: ${url}`, err);
          }
        })
      );
    })
  );
});

// 2. Activar y limpiar cachés obsoletas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia de red/caché
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = event.request.url;

  // Archivos JS/HTML siempre frescos desde la red
  if (url.endsWith('.js') || url.includes('.html') || url === self.location.origin + '/') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Audios, imágenes, CSS e iconos: Caché primero, luego red
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

// 4. RECEPTOR DE NOTIFICACIONES PUSH (Segundo Plano / Pantalla Bloqueada)
self.addEventListener('push', (event) => {
  let data = { 
    titulo: 'MovaChat 💬', 
    cuerpo: 'Tienes un nuevo mensaje recibido 📩', 
    icono: './assets/logo/icon-192.png',
    tag: 'movachat-mensaje'
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
    vibrate: [200, 100, 200],
    tag: data.tag || 'movachat-chat',
    renotify: true,
    data: { 
      url: self.registration.scope,
      chatId: data.chatId || null 
    }
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