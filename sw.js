// Safarr Passenger Service Worker
const SW_VERSION = 'safarr-user-v1';

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
                return new Response(`<html><body style="font-family:sans-serif; text-align:center; padding:100px;"><h1>👤 Safarr</h1><p>Offline Mode. Please check internet.</p><button onclick="location.reload()">Retry</button></body></html>`, { headers: { 'Content-Type': 'text/html' } });
            }
        })
    );
});

self.addEventListener('push', (event) => {
    let data = { title: '🛺 Auto Booked!', body: 'A driver has accepted your ride request.' };
    try { data = event.data.json(); } catch (e) {}

    const options = {
        body: data.body,
        icon: 'user.jpg',
        badge: 'user.jpg',
        image: data.image || undefined,
        data: { url: data.url || './index.html', rideId: data.rideId },
        actions: [
            { action: 'view',    title: '🗺️ Track Auto' },
            { action: 'dismiss', title: 'Dismiss'       }
        ],
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200], 
        tag: 'ride-' + (data.rideId || Date.now()),
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(data.title || '🛺 Auto Booked!', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // Do nothing if dismissed
    if (event.action === 'dismiss') return;
    
    const url = event.notification.data?.url || './index.html';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                // If app is already open, focus it
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If app was closed, open it
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});