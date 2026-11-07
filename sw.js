/* ============================================================
   WEBGIS — service worker

   Torna o app instalável (PWA) e permite abri-lo sem rede.
   Estratégia "rede primeiro": sempre busca a versão mais nova
   e, se a rede falhar, usa a última cópia guardada em cache.
   Só arquivos do próprio site são guardados.
   ============================================================ */

const CACHE = "webgis-v1";

const SHELL = [
    "./",
    "./index.html",
    "./ajuda.html",
    "./manifest.webmanifest",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;

    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request, { ignoreSearch: request.mode === "navigate" })
                .then((cached) => cached || (request.mode === "navigate" ? caches.match("./index.html") : Response.error())))
    );
});
