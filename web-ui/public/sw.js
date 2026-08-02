const BUILD_ID = new URL(self.location.href).searchParams.get("build") || "development";
const CACHE_PREFIX = "codex-collab-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = [
  "/index.html",
  "/group.html",
  "/project-management.html",
  "/progress",
  "/project-management",
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
    const canonicalPath = url.pathname === "/"
      ? "/index.html"
      : url.pathname === "/group.html"
        ? "/group.html"
        : (url.pathname === "/progress" || url.pathname === "/progress/" || url.pathname === "/project-management" || url.pathname === "/project-management/"
          ? "/progress"
          : "/index.html");
    const refresh = fetch(request).then((response) => {
      if (!response.ok) throw new Error(`navigation HTTP ${response.status}`);
      return caches.open(CACHE_NAME).then((cache) => {
        void cache.put(canonicalPath, response.clone());
        return response;
      });
    });
    event.respondWith(
      caches.match(canonicalPath).then((cached) => {
        if (cached) {
          event.waitUntil(refresh.catch(() => undefined));
          return cached;
        }
        return refresh.catch(() => caches.match(canonicalPath));
      }),
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
