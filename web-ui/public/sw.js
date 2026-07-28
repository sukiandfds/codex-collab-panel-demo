const BUILD_ID = new URL(self.location.href).searchParams.get("build") || "development";
const CACHE_PREFIX = "codex-collab-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = [
  "/index.html",
  "/group.html",
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/events") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const canonicalPath = url.pathname === "/" ? "/index.html" : url.pathname;
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(canonicalPath, response.clone()));
          return response;
        })
        .catch(() => caches.match(url.pathname === "/group.html" ? "/group.html" : "/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
