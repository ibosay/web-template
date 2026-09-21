/**
 * Keeps the app working without a signal.
 *
 * That is the whole reason for installing it rather than keeping a tab open: the assistant is used
 * on roads where there is no reception, and a page that needs the network to start is no use
 * there. Everything it needs is cached when it is first opened.
 *
 * The two placeholders below are filled in by build.js from what webpack actually emitted. They
 * are deliberately not spelled out anywhere else in this file, including in comments: the build
 * substitutes them by name, and a second mention would be substituted instead of the code.
 */
const VERSION = '__VERSION__';
const CACHE_NAME = `traffic-sign-demo-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      // Do not wait for the old version to be closed before taking over.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names =>
        Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // A navigation has to end up somewhere even with no signal, so it falls back to the cached page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html').then(hit => hit || Response.error()))
    );
    return;
  }

  // Everything else comes from the cache first: the files are content hashed, so a cached one is
  // never stale, and a new build brings new names.
  event.respondWith(
    caches.match(request).then(hit => {
      if (hit) {
        return hit;
      }
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
