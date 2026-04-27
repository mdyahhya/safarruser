// Safarr Driver Service Worker
const SW_VERSION = 'safarr-driver-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.hostname.includes('supabase.co') || url.hostname.includes('api.')) return;

    event.respondWith(
        fetch(event.request, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        }).catch(() => {
            if (event.request.mode === 'navigate') {
                return new Response(`<html><body style="font-family:sans-serif; text-align:center; padding:100px;"><h1>🛺 Safarr Driver</h1><p>You're offline. Check your connection.</p><button onclick="location.reload()">Retry</button></body></html>`, { headers: { 'Content-Type': 'text/html' } });
            }
        })
    );
});

self.addEventListener('push', (event) => {
    let data = { title: 'Safarr Driver', body: 'New notification' };
    try { data = event.data.json(); } catch (e) {}

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: 'auto.jpg',
            badge: 'auto.jpg',
            vibrate: [200, 100, 200],
            requireInteraction: true,
            tag: 'ride-request'
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('index.html') && 'focus' in client) return client.focus();
            }
            return clients.openWindow('./index.html');
        })
    );
});