// Karro service worker — hand-written, no build step.
// Bump VERSION on any precache change; all caches share the prefix.
const VERSION = "karro-v1";
const PRECACHE = `${VERSION}-precache`;
const RUNTIME = `${VERSION}-runtime`;
const PRECACHE_URLS = ["/", "/manifest.webmanifest"];

const API_HOSTS = [
  "datosabiertos.malaga.eu",
  "router.project-osrm.org",
  "nominatim.openstreetmap.org",
];
// API responses are only served from cache when this fresh — parking data
// stales in under a minute, so an older copy is worse than an error.
const API_CACHE_MAX_AGE_MS = 30_000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PRECACHE).then((c) => c.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("karro-") && k !== PRECACHE && k !== RUNTIME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function putStamped(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set("x-sw-cached-at", String(Date.now()));
  const stamped = new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, stamped);
}

async function networkFirstApi(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) await putStamped(cache, request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    const age = Date.now() - Number(cached?.headers.get("x-sw-cached-at") ?? 0);
    if (cached && age <= API_CACHE_MAX_AGE_MS) return cached;
    throw err;
  }
}

async function networkFirstShell(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match("/")) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache POST
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (url.pathname.startsWith("/v1/") || API_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirstApi(request));
    return;
  }
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/fonts/"))
  ) {
    event.respondWith(cacheFirst(request));
  }
});
