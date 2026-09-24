/* Texstyle Offline: cache only the explicit application shell, never user files. */
'use strict';
const VERSION = 'offline-8';
const PREFIX = 'texstyle-app-';
const CACHE = PREFIX + VERSION;
const BASE = new URL('./', self.location.href);
const ASSETS = [
  'offline.html', 'style.css?v=8', 'workflow.css?v=5', 'studio.js?v=10', 'worker-bundle.js?v=6',
  'install.js?v=2', 'offline.js?v=1', 'manifest.webmanifest', 'icon.svg',
  'app-icon-192.png', 'app-icon-512.png', 'app-icon-maskable.png',
  'offline-guide.html'
];
const urls = ASSETS.map(path => new URL(path, BASE).href);
const shell = new URL('offline.html', BASE).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Validate the whole release before writing it. Never store a login/error page.
    const entries = await Promise.all(urls.map(async url => {
      // Sites canonicalizes *.html to extensionless paths. Fetch the canonical
      // page directly, while retaining stable .html cache keys and start URLs.
      const fetchURL = url.endsWith('.html') ? url.slice(0,-5) : url;
      const response = await fetch(new Request(fetchURL, {credentials:'same-origin', cache:'reload', redirect:'error'}));
      const path = new URL(url).pathname;
      const mime = response.headers.get('content-type') || '';
      if (!response.ok || response.redirected || response.url !== fetchURL) throw Error('App-Datei nicht erreichbar');
      if (path.endsWith('.html')) {
        if (!mime.includes('text/html') || !(await response.clone().text()).includes('data-texstyle-offline="1"')) throw Error('Keine gültige App-Seite');
      } else if (path.endsWith('.js') && !/javascript/.test(mime)) throw Error('Keine gültige Programmdatei');
      else if (path.endsWith('.css') && !mime.includes('text/css')) throw Error('Keine gültige Gestaltung');
      else if (/\.(png|svg)$/.test(path) && !mime.startsWith('image/')) throw Error('Kein gültiges App-Symbol');
      else if (path.endsWith('.webmanifest')) {
        if (!/json|manifest/.test(mime) || (await response.clone().json()).name !== 'Texstyle DTF Studio') throw Error('Kein gültiges App-Manifest');
      }
      return [url, response];
    }));
    const cache = await caches.open(CACHE);
    try { for (const [url, response] of entries) await cache.put(url, response); }
    catch (error) { await caches.delete(CACHE); throw error; }
    // No skipWaiting here: keep editing sessions intact. The browser may activate
    // a waiting update after all controlled windows close.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'OFFLINE_STATUS') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const complete = (await Promise.all(urls.map(url => cache.match(url)))).every(Boolean);
    event.ports[0]?.postMessage({ready:complete, version:VERSION});
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin) return;
  // Exact allowlist: unknown paths, authentication, customer files and queries are never cached.
  const canonicalPage = [new URL('offline',BASE).href,new URL('offline-guide',BASE).href].includes(url.href);
  const cacheKey = canonicalPage ? url.href + '.html' : url.href;
  if (urls.includes(cacheKey)) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match(cacheKey);
      if (cached) return cached;
      // Do not silently replace part of an offline release with a newer online asset.
      return new Response('Offline-Datei fehlt. Bitte Offline-Modus online neu einrichten.', {status:503, headers:{'Content-Type':'text/plain;charset=utf-8'}});
    })());
    return;
  }
  if (request.mode === 'navigate' && !url.search && (url.pathname === BASE.pathname || url.pathname === BASE.pathname + 'index.html')) {
    event.respondWith((async () => {
      // The online entry keeps the hosting platform's authentication. HTTP refusals
      // and login redirects are returned unchanged, never replaced by an offline copy.
      try { return await fetch(request); }
      catch {
        return await (await caches.open(CACHE)).match(shell) || new Response('Bitte die App einmal online öffnen und offline einrichten.', {status:503});
      }
    })());
  }
});
