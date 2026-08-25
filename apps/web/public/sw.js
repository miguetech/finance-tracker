/* Service worker del modo offline (spec espejo §9): precachea el shell y el
 * binario SQLite; assets same-origin se sirven cache-first y se refrescan en
 * segundo plano (stale-while-revalidate). Sin dependencias de build. */
const CACHE = 'ft-shell-v1'
const PRECACHE = ['/', '/sqlite3.wasm']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // Navegación: red primero; sin red, shell cacheado (la SPA vive en index.html).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(async (res) => {
          // Clonar ANTES de entregar: al retornar `res` el stream queda
          // bloqueado por la página y un clone() tardío lanza "body used".
          try {
            const copia = res.clone()
            const c = await caches.open(CACHE)
            await c.put('/', copia)
          } catch { /* respuesta no cacheable: se ignora */ }
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }
  // Assets (JS/CSS/wasm): caché primero, actualización en segundo plano.
  e.respondWith(
    caches.match(req).then((hit) => {
      const red = fetch(req).then(async (res) => {
        try {
          if (res && res.ok) {
            const copia = res.clone()
            const c = await caches.open(CACHE)
            await c.put(req, copia)
          }
        } catch { /* noop */ }
        return res
      }).catch(() => hit)
      return hit || red
    })
  )
})
