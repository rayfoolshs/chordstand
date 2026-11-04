const CACHE = 'chordstand-v5'
const ROOT = new URL('./', self.location.href).pathname
const SHELL = [
  ROOT,
  `${ROOT}manifest.webmanifest`,
  `${ROOT}icons/icon.svg`,
  `${ROOT}icons/icon-192.png`,
  `${ROOT}icons/icon-180.png`,
]
// Replaced with the hashed build output by scripts/build-sw.mjs.
const PRECACHE_ASSETS = []
const PRECACHE = PRECACHE_ASSETS.map((asset) => `${ROOT}${asset.replace(/^\.?\//, '')}`)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...SHELL, ...PRECACHE]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok && response.status >= 500) {
            return caches.match(ROOT, { ignoreVary: true }).then((cached) => cached || response)
          }
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(ROOT, copy))
          }
          return response
        })
        .catch(() => caches.match(ROOT, { ignoreVary: true }).then((cached) => cached || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
