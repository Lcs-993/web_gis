/* Registra o service worker que torna o WebGIS instalável. */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch((error) => {
            console.warn("Service worker não registrado:", error);
        });
    });
}
