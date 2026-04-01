const CACHE_NAME = 'work-pro-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});

// Listener para disparar as notificações Push do WorkPro
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(clients.openWindow('./'));
});

self.addEventListener('push', (e) => {
    const data = (e.data) ? e.data.json() : { title: 'Tarefa Pendente', body: 'Faltam 4 horas para o seu próximo serviço!' };
    const options = {
        body: data.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png',
        vibrate: [200, 100, 200],
        silent: false,
        requireInteraction: true
    };
    e.waitUntil(self.registration.showNotification(data.title, options));
});
