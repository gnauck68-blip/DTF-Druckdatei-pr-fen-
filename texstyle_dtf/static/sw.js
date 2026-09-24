/*
 * Service Worker: speichert die App-Dateien, damit TexStyle DTF auch ohne
 * Internet startet (Android, Windows). Bilder werden hier nie gespeichert;
 * sie bleiben im Arbeitsspeicher der Seite.
 * Bei jeder Änderung an den Dateien VERSION erhöhen, dann holt sich das Gerät
 * beim nächsten Start mit Internet die neue Fassung.
 */
const VERSION = 'texstyle-dtf-1';
const DATEIEN = ['./', './index.html', './rip.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(caches.open(VERSION).then((speicher) => speicher.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith('texstyle-dtf-') && n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Erst aus dem Speicher, sonst aus dem Netz: startet sofort und auch offline
self.addEventListener('fetch', (ereignis) => {
  if (ereignis.request.method !== 'GET') return;
  const url = new URL(ereignis.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  ereignis.respondWith(
    caches.match(ereignis.request, { ignoreSearch: true }).then((treffer) => treffer || fetch(ereignis.request))
  );
});
