const CACHE_NAME = "dq-waste-log-v1"

const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons.svg"
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )

  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )

  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  if (request.method !== "GET") {
    return
  }

  const url = new URL(request.url)

  if (url.pathname.startsWith("/api/")) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone()

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone)
        })

        return response
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/"))
      )
  )
})