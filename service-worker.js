const CACHE_NAME = 'vallabus-v6.4.1';
const urlsToCache = [
    // Lista de URLs a cachear
    '/favicon.png',
    // Imágenes
    "/img/add.png",
    "/img/arrow-left-light.png",
    "/img/arrow-light.png",
    "/img/arrow.png",
    "/img/arrow-up.png",
    "/img/bell-gray.png",
    "/img/bell-solid.png",
    "/img/bus-black.png",
    "/img/bus-cover-gray.png",
    "/img/bus-cover.png",
    "/img/bus-gray.png",
    "/img/bus-location-center.png",
    "/img/bus-location.png",
    "/img/bus-location-white.png",
    "/img/bus-stop-dark.png",
    "/img/bus-stop.png",
    "/img/bus-white.png",
    "/img/calendar-clock.png",
    "/img/circle-exclamation.png",
    "/img/close-light.png",
    "/img/close.png",
    "/img/clock.png",
    "/img/directions.png",
    "/img/directions.svg",
    "/img/feed.png",
    "/img/find-nearby.png",
    "/img/info-gray.png",
    "/img/info.png",
    "/img/ios-install.jpg",
    "/img/ios-share.svg",
    "/img/location-gray.png",
    "/img/location-light.png",
    "/img/location.svg",
    "/img/location-white.png",
    "/img/logo.png",
    "/img/map-dark.png",
    "/img/map-gray.png",
    "/img/map.png",
    "/img/matricula-e.png",
    "/img/pin-solid-light.png",
    "/img/pin-solid.png",
    "/img/pin-transparent-light.png",
    "/img/pin-transparent.png",
    "/img/routes.png",
    "/img/screenshot.jpg",
    "/img/seats-empty-many-light.png",
    "/img/seats-empty-many.png",
    "/img/seats-few-light.png",
    "/img/seats-few.png",
    "/img/seats-full.png",
    "/img/seats-notaccepting.png",
    "/img/seats-standing.png",
    "/img/share-gray.png",
    "/img/share.png",
    "/img/stop-route.png",
    "/img/stop-route-white.png",
    "/img/trash-gray.png",
    "/img/trash-light-gray.png",
    "/img/trash.png",
    "/img/trash-white.png",
    "/img/welcome-logo-2.png",
    "/img/welcome-logo.png",
    "/img/welcome-logo-white.png",
    "/img/warning-light.png",
    "/img/warning.png"
];

// Instalación del Service Worker y precarga de los recursos
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache abierto');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting()) // Fuerza al Service Worker a activarse
    );
});

// Fetch event: Network first, fall back to cache
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).then(networkResponse => {
            if (networkResponse) {
                return networkResponse;
            }

            return caches.match(event.request);
        })
    );
});

// Activate event: Clear old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activate event');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            );
        }).then(() => {
            console.log('Old caches cleared');
            return self.clients.claim();
        })
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