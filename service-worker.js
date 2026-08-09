// VallaBus no funciona sin red porque sus datos dependen de APIs remotas.
// Este Service Worker se mantiene únicamente para recibir notificaciones push.
// No interceptamos fetch ni mantenemos una caché de la aplicación.

const OWNED_CACHE_PREFIX = 'vallabus-';

self.addEventListener('install', event => {
    // Activa la versión nueva cuanto antes para retirar workers antiguos que
    // todavía pudieran estar interceptando peticiones o sirviendo caché.
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames
                    .filter(cacheName => cacheName.startsWith(OWNED_CACHE_PREFIX))
                    .map(cacheName => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('push', event => {
    console.log('Received a push message', event);

    const data = event.data.json();
    console.log('Push data: ', data);

    const title = data.title || 'Nueva Notificación';
    const options = {
        body: data.message,
        icon: '/favicon.png',
        badge: '/favicon.png'
    };

    event.waitUntil(self.registration.showNotification(title, options));
});
