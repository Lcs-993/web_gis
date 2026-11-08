/* Controles do mapa: enquadrar, zoom, tela cheia e mapa base. */

import { el, byId } from "./dom.js";

export function createMapControls(store, mapView, basemaps) {
    const { map } = mapView;
    const homeButton = byId("home-button");
    const zoomInButton = byId("zoom-in-button");
    const zoomOutButton = byId("zoom-out-button");
    const fullscreenButton = byId("fullscreen-button");
    const basemapButton = byId("basemap-button");
    const basemapMenu = byId("basemap-menu");
    const basemapOptions = byId("basemap-options");
    const fullscreenTarget = byId("map-container");


    /* ---------------- enquadrar ---------------- */

    const updateHome = () => {
        const ready = mapView.hasExtent();

        homeButton.disabled = !ready;
        homeButton.title = ready ? "Enquadrar extensão total das camadas" : "Nenhuma camada ligada para enquadrar";
        homeButton.setAttribute("aria-label", homeButton.title);
    };

    homeButton.addEventListener("click", () => {
        mapView.closePopup();
        mapView.fitExtent();
    });


    /* ---------------- zoom ---------------- */

    const updateZoom = () => {
        zoomInButton.disabled = map.getZoom() >= map.getMaxZoom();
        zoomOutButton.disabled = map.getZoom() <= map.getMinZoom();
    };

    zoomInButton.addEventListener("click", () => map.zoomIn());
    zoomOutButton.addEventListener("click", () => map.zoomOut());
    map.on("zoomend", updateZoom);


    /* ---------------- tela cheia ---------------- */

    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

    const syncFullscreen = () => {
        const active = Boolean(fullscreenElement());
        const label = active ? "Sair da tela cheia" : "Tela cheia";

        fullscreenButton.setAttribute("aria-pressed", String(active));
        /* Classe em vez de :fullscreen no CSS: o seletor com prefixo -webkit- invalidaria a regra no Firefox. */
        fullscreenTarget.classList.toggle("is-fullscreen", active);
        fullscreenButton.title = label;
        fullscreenButton.setAttribute("aria-label", label);
        map.invalidateSize({ animate: false });
    };

    const canFullscreen = Boolean(fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen);

    fullscreenButton.hidden = !canFullscreen;

    fullscreenButton.addEventListener("click", () => {
        if (fullscreenElement()) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            exit.call(document);
            return;
        }

        const request = fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen;
        const result = request.call(fullscreenTarget);

        if (result && typeof result.catch === "function") {
            result.catch(() => store.setStatus("O navegador recusou a tela cheia"));
        }
    });

    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);


    /* ---------------- mapa base ---------------- */

    basemapOptions.replaceChildren(...basemaps.map((basemap) =>
        el("label", { class: "basemap-option" }, [
            el("input", { type: "radio", name: "basemap", value: basemap.id }),
            el("span", { class: "basemap-option-label", text: basemap.name })
        ])
    ));

    const setMenuOpen = (open) => {
        basemapMenu.hidden = !open;
        basemapButton.setAttribute("aria-expanded", String(open));

        if (open) {
            const checked = basemapMenu.querySelector("input:checked") || basemapMenu.querySelector("input");

            if (checked) {
                checked.focus();
            }
        }
    };

    basemapButton.addEventListener("click", () => setMenuOpen(basemapMenu.hidden));

    basemapMenu.addEventListener("change", (event) => {
        if (event.target.name === "basemap") {
            store.setBasemap(event.target.value);
            setMenuOpen(false);
            basemapButton.focus();
        }
    });

    basemapMenu.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen(false);
            basemapButton.focus();
        }
    });

    document.addEventListener("pointerdown", (event) => {
        if (!basemapMenu.hidden && !basemapButton.parentElement.contains(event.target)) {
            setMenuOpen(false);
        }
    });

    store.on("basemap", (id) => {
        const basemap = basemaps.find((item) => item.id === id);

        mapView.setBasemap(id);

        basemapMenu.querySelectorAll("input[name='basemap']").forEach((input) => {
            input.checked = input.value === id;
        });

        if (basemap) {
            basemapButton.title = `Mapa base: ${basemap.name}`;
            basemapButton.setAttribute("aria-label", basemapButton.title);
        }
    });


    /* Depois do desenho, não antes: o estado do botão reflete o que já está no mapa. */
    mapView.onContentChange(updateHome);

    updateHome();
    updateZoom();
    syncFullscreen();
}


/* Sem Leaflet (CDN bloqueada): os controles ficam inertes. */
export function disableMapControls() {
    document.querySelectorAll(".map-controls button").forEach((button) => {
        button.disabled = true;
        button.title = "Mapa indisponível";
        button.setAttribute("aria-label", "Mapa indisponível");
    });
}
