// ========================================================
// 📱 SERVICE WORKER MOVACHAT (Versión Corregida v1.0.0.7)
// ========================================================

const CACHE_NAME = 'movachat-v1.0.0.7';

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

// 1. Instalación
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('📦 Precachando recursos de MovaChat...');
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn(`⚠️ No se pudo precachar: ${url}`, err);
          }
        })
      );
    })
  );
});

// 2. Activación y limpieza de cachés antiguas
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

// 3. Estrategias de Intercepción
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 🚫 OMITIR INTERCEPCIÓN:
  // Evita el error ERR_CACHE_OPERATION_NOT_SUPPORTED en videos por streaming (HTTP 206 / Range)
  if (
    event.request.method !== 'GET' ||
    event.request.headers.has('range') ||
    url.includes('/storage/v1/object/public/') ||
    url.endsWith('.mp4') ||
    url.endsWith('.webm') ||
    url.endsWith('.m4a')
  ) {
    return; // Permite que el navegador descargue el video de red directamente sin pasar por CacheStorage
  }

  // Omitir peticiones externas que no pertenezcan al dominio de la app
  if (!url.startsWith(self.location.origin)) {
    return;
  }

  // JS y HTML: Network-first + Actualización de Caché
  if (url.endsWith('.js') || url.includes('.html') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          // Fallback a index.html en peticiones de navegación SPA
          return cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : null);
        })
    );
    return;
  }

  // Estáticos locales (Imágenes, Audios, CSS): Cache-first
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      });
    })
  );
});

// 4. Recepción de Push
self.addEventListener('push', (event) => {
  let data = { 
    titulo: 'MovaChat 💬', 
    cuerpo: 'Tienes un nuevo mensaje recibido 📩', 
    icono: './assets/logo/icon-192.png',
    tag: 'movachat-mensaje',
    chatId: null
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = { ...data, ...json };
    } catch (e) {
      data.cuerpo = event.data.text();
    }
  }

  const opciones = {
    body: data.cuerpo,
    icon: data.icono,
    badge: './assets/logo/badge-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag,
    renotify: true,
    data: { 
      url: self.registration.scope,
      chatId: data.chatId 
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo, opciones)
  );
});

// 5. Clic en Notificación con apertura de conversación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la ventana ya está abierta, la enfocamos y le enviamos la orden de abrir el chat
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          if (chatId) {
            client.postMessage({ accion: 'ABRIR_CHAT', chatId: chatId });
          }
          return;
        }
      }
      // Si la app está cerrada, se abre con el parámetro en la URL
      const targetUrl = chatId ? `./?chatId=${chatId}` : './';
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});