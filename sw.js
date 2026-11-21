/* Calendario (versión móvil) — funciona sin conexión.
   La versión y la lista de archivos las rellena generar.js */
const VERSION = '20261121094837';
const CACHE = 'calendario-movil-' + VERSION;
const FILES = [
 "./",
 "Fondos/Halloween.png",
 "Fondos/Navidad.jpg",
 "Fondos/Navidad2.png",
 "Fondos/SanValentin.jpg",
 "Fondos/SanValentin2.png",
 "css/styles.css",
 "index.html",
 "js/app.js",
 "manifest.webmanifest",
 "movil/icon-192.png",
 "movil/icon-512.png",
 "movil/icon-maskable-512.png",
 "movil/mobile.css",
 "movil/shim.js",
 "vendor/fontawesome/css/all.min.css",
 "vendor/fontawesome/webfonts/fa-brands-400.woff2",
 "vendor/fontawesome/webfonts/fa-regular-400.woff2",
 "vendor/fontawesome/webfonts/fa-solid-900.woff2",
 "vendor/fontawesome/webfonts/fa-v4compatibility.woff2",
 "vendor/fonts/berkshire-swash-latin-400-normal.woff2",
 "vendor/fonts/creepster-latin-400-normal.woff2",
 "vendor/fonts/fonts.css",
 "vendor/fonts/great-vibes-latin-400-normal.woff2",
 "vendor/fonts/nunito-latin-400-normal.woff2",
 "vendor/fonts/nunito-latin-500-normal.woff2",
 "vendor/fonts/nunito-latin-600-normal.woff2",
 "vendor/fonts/nunito-latin-700-normal.woff2",
 "vendor/js/docx-preview.min.js",
 "vendor/js/html2canvas.min.js",
 "vendor/js/jspdf.umd.min.js",
 "vendor/js/jszip.min.js",
 "vendor/js/pdf.min.js",
 "vendor/js/pdf.worker.min.js",
 "vendor/uicons/icon-list.js",
 "vendor/uicons/uicons-bold-rounded-MQNABNC6.woff2",
 "vendor/uicons/uicons-bold-rounded-UTQQXXF3.woff",
 "vendor/uicons/uicons-bold-rounded.css",
 "vendor/uicons/uicons-bold-rounded.woff",
 "vendor/uicons/uicons-bold-rounded.woff2",
 "vendor/uicons/uicons-chubby-fallback.css",
 "vendor/uicons/uicons-regular-chubby.css",
 "vendor/uicons/uicons-regular-chubby.woff",
 "vendor/uicons/uicons-regular-chubby.woff2",
 "vendor/uicons/uicons-regular-rounded-J3WOUERV.woff2",
 "vendor/uicons/uicons-regular-rounded-KDJ23353.woff",
 "vendor/uicons/uicons-regular-rounded.css",
 "vendor/uicons/uicons-regular-rounded.woff",
 "vendor/uicons/uicons-regular-rounded.woff2",
 "vendor/uicons/uicons-solid-chubby.css",
 "vendor/uicons/uicons-solid-chubby.woff",
 "vendor/uicons/uicons-solid-chubby.woff2",
 "vendor/uicons/uicons-solid-rounded-IYSBBSWN.woff2",
 "vendor/uicons/uicons-solid-rounded-UWVI4CEC.woff",
 "vendor/uicons/uicons-solid-rounded.css",
 "vendor/uicons/uicons-solid-rounded.woff",
 "vendor/uicons/uicons-solid-rounded.woff2",
 "vendor/uicons/uicons-solid-straight-4DZ3VA4V.woff2",
 "vendor/uicons/uicons-solid-straight-ITFA7HIK.woff",
 "vendor/uicons/uicons-solid-straight.css",
 "vendor/uicons/uicons-solid-straight.woff",
 "vendor/uicons/uicons-solid-straight.woff2"
];

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const c = await caches.open(CACHE);
        await Promise.all(FILES.map(f => c.add(f).catch(() => { })));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith('calendario-movil-') && k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;   // lugares (Photon), etc.: directo a la red
    e.respondWith((async () => {
        const c = await caches.open(CACHE);
        const hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
        try {
            const r = await fetch(req);
            if (r && r.ok) c.put(req, r.clone());
            return r;
        } catch (err) {
            if (req.mode === 'navigate') { const i = await c.match('index.html'); if (i) return i; }
            throw err;
        }
    })());
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const payload = e.notification.data || {};
    e.waitUntil((async () => {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (list.length) {
            const w = list[0];
            await w.focus();
            w.postMessage({ type: 'notification-click', payload });
        } else {
            const w = await self.clients.openWindow('./index.html');
            if (w) setTimeout(() => w.postMessage({ type: 'notification-click', payload }), 1500);
        }
    })());
});
