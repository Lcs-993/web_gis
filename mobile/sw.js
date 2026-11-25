/* ============================================================
   SERVICE WORKER DO WEBGIS CAMPO (escopo /mobile/)

   - App e GeoJSON locais: cache primeiro, com revalidação em
     segundo plano. Abre na hora com sinal fraco ou sem sinal; a
     versão nova chega na abertura seguinte. A revalidação usa a
     cache HTTP do navegador (ETag), então um GeoJSON sem mudança
     não é baixado de novo.
   - Camadas do servidor do app de campo (/api/v1/camadas/):
     rede primeiro, com limite de espera; sem resposta, usa a
     última cópia guardada.
   - Mapa-base (Esri) não é guardado.
   ============================================================ */

const VERSION = "v3";
const CACHE = `webgis-mobile-${VERSION}`;
const REMOTE_CACHE = `webgis-mobile-campo-${VERSION}`;
const REMOTE_TIMEOUT_MS = 8000;

const SHELL = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./mobile.css",
    "./mobile.js",
    "./geo.js",
    "./field-store.js",
    "./symbology.js",
    "./vendor/leaflet.css",
    "./vendor/leaflet.js",
    "./vendor/images/marker-icon.png",
    "./vendor/images/marker-icon-2x.png",
    "./vendor/images/marker-shadow.png",
    "../js/config.js",
    "../js/data/campo-api.js",
    "../js/data/schema.js",
    "../js/data/theme.js",
    "../js/data/values.js",
    "../js/data/ramps.js",
    "../js/map/label-anchor.js",
    "../js/map/marker-icons.js",
    "../assets/icons/ui/sprite.svg",
    "../assets/png/favcon_red_green.png",
    "../assets/icons/icon-192.png",
    "../assets/icons/icon-512.png",
    "../assets/icons/icon-maskable-192.png",
    "../assets/icons/icon-maskable-512.png"
];
const DATA = [
    "../geojson/usina.geojson",
    "../geojson/pol_fazendas.geojson",
    "../geojson/coletas_demo.geojson",
    "../geojson/pol_talhoes.geojson"
];

const scopeUrl = (path) => new URL(path, self.registration.scope).href;
const PRECACHED = new Set([...SHELL, ...DATA].map(scopeUrl));

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(SHELL);
        await cache.addAll(DATA);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keep = new Set([CACHE, REMOTE_CACHE]);
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((key) => key.startsWith("webgis-mobile-") && !keep.has(key))
            .map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

async function cacheFirst(event, request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    const refresh = fetch(request, { cache: "no-cache" })
        .then(async (response) => {
            if (response.ok) await cache.put(request, response.clone());
            return response;
        });
    if (cached) {
        event.waitUntil(refresh.catch(() => {}));
        return cached;
    }
    try {
        return await refresh;
    } catch (error) {
        if (request.mode === "navigate") {
            const shell = await cache.match(scopeUrl("./index.html"));
            if (shell) return shell;
        }
        if (request.url.endsWith(".geojson")) {
            return new Response("Dados offline ainda não foram armazenados. Abra o app conectado antes de usá-lo offline.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }
        throw error;
    }
}

async function networkFirst(request) {
    const cache = await caches.open(REMOTE_CACHE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
    try {
        const response = await fetch(request, { signal: controller.signal });
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);

    if (url.pathname.includes("/api/v1/camadas/")) {
        event.respondWith(networkFirst(request));
        return;
    }
    if (url.origin !== self.location.origin) return;

    const inScope = request.url.startsWith(self.registration.scope);
    if (PRECACHED.has(url.href) || (request.mode === "navigate" && inScope)) {
        event.respondWith(cacheFirst(event, request));
    }
});
