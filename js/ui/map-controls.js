/*
   Controles do mapa (coluna única no pé da barra direita, ou no
   canto do mapa com a barra recolhida; js/ui/toolbar.js): minha
   localização, início e zoom. O botão Apresentar (barra superior)
   põe a aplicação em tela cheia. E o painel Mapa base (barra
   esquerda), com uma miniatura de cada serviço.

   Atalhos (fora de campos de texto): F apresentar, + e − zoom.
   Apresentar = tela cheia sem as barras (voltam com o mouse na borda).
*/

import { el, byId } from "./dom.js";
import { isTyping } from "./toolbar.js";

export function createMapControls(store, mapView, basemaps) {
    const { map } = mapView;
    const homeButton = byId("home-button");
    const zoomInButton = byId("zoom-in-button");
    const zoomOutButton = byId("zoom-out-button");
    const presentButton = byId("present-button");
    const presentLabel = presentButton.querySelector(".topbar-present-label");
    const locateButton = byId("locate-button");
    const basemapOptions = byId("basemap-options");
    /* A aplicação inteira: em tela cheia as barras e painéis continuam à mão. */
    const fullscreenTarget = byId("app");


    /* ---------------- enquadrar ---------------- */

    const updateHome = () => {
        const ready = mapView.hasExtent();

        homeButton.disabled = !ready;
        homeButton.title = ready ? "Início: extensão total das camadas" : "Nenhuma camada ligada para enquadrar";
        homeButton.setAttribute("aria-label", homeButton.title);
    };

    homeButton.addEventListener("click", () => mapView.fitExtent());


    /* ---------------- zoom ---------------- */

    const updateZoom = () => {
        zoomInButton.disabled = map.getZoom() >= map.getMaxZoom();
        zoomOutButton.disabled = map.getZoom() <= map.getMinZoom();
    };

    zoomInButton.addEventListener("click", () => map.zoomIn());
    zoomOutButton.addEventListener("click", () => map.zoomOut());
    map.on("zoomend", updateZoom);


    /* ---------------- apresentar (tela cheia) ---------------- */

    const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

    const syncFullscreen = () => {
        const active = Boolean(fullscreenElement());
        const label = active ? "Sair da apresentação" : "Apresentar";

        presentButton.setAttribute("aria-pressed", String(active));
        /* Classe em vez de :fullscreen no CSS: o seletor com prefixo -webkit- invalidaria a regra no Firefox. */
        fullscreenTarget.classList.toggle("is-fullscreen", active);
        presentButton.title = active ? "Sair da apresentação (F ou Esc)" : "Apresentar em tela cheia (F)";
        presentButton.setAttribute("aria-label", label);
        presentLabel.textContent = active ? "Sair" : "Apresentar";
        map.invalidateSize({ animate: false });
    };

    const canFullscreen = Boolean(fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen);

    presentButton.hidden = !canFullscreen;

    const toggleFullscreen = () => {
        if (!canFullscreen) {
            return;
        }

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
    };

    presentButton.addEventListener("click", toggleFullscreen);

    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);


    /*
       Modo apresentação: em tela cheia, a barra superior e a barra
       esquerda somem (ficam só o mapa, a caixa de busca e os
       controles). Levar o mouse até a borda (topo ou esquerda) traz a
       barra de volta, por cima do mapa; ela some de novo pouco depois
       que o mouse sai, salvo com um menu ou cartão dela aberto.
       O foco do teclado (Tab) também revela a barra.
    */
    const EDGE_PX = 6;
    const HIDE_DELAY_MS = 450;
    const presentBars = [
        { side: "top", bar: document.querySelector(".topbar"), atEdge: (event) => event.clientY <= EDGE_PX },
        { side: "left", bar: byId("toolbar-left"), atEdge: (event) => event.clientX <= EDGE_PX }
    ].filter((item) => item.bar);

    const presenting = () => fullscreenTarget.classList.contains("is-fullscreen");

    /* Menu suspenso, cartão ou seletor aberto a partir da barra: ela fica à vista até fechar. */
    const isBusy = (bar) => Boolean(bar.querySelector("[aria-haspopup][aria-expanded='true'], #account-button[aria-expanded='true']"));
    const inMenu = (target) => Boolean(target && target.closest && target.closest(".menu-layer, [role='menu']"));

    /* A barra e uma classe no #app (os painéis da esquerda abrem espaço e o puxador some). */
    const setRevealed = (item, on) => {
        item.bar.classList.toggle("is-revealed", on);
        fullscreenTarget.classList.toggle(`present-${item.side}-open`, on);
    };

    const reveal = (item) => {
        window.clearTimeout(item.timer);
        setRevealed(item, true);
    };

    const scheduleHide = (item) => {
        window.clearTimeout(item.timer);
        item.timer = window.setTimeout(() => {
            if (presenting() && !item.bar.matches(":hover") && !item.bar.contains(document.activeElement) && !isBusy(item.bar)) {
                setRevealed(item, false);
            }
        }, HIDE_DELAY_MS);
    };

    document.addEventListener("pointermove", (event) => {
        if (!presenting()) {
            return;
        }

        presentBars.forEach((item) => {
            const over = item.bar.contains(event.target) || inMenu(event.target);

            if (item.atEdge(event) || over) {
                reveal(item);
            } else if (item.bar.classList.contains("is-revealed")) {
                scheduleHide(item);
            }
        });
    }, { passive: true });

    presentBars.forEach((item) => {
        item.bar.addEventListener("focusin", () => presenting() && reveal(item));
        item.bar.addEventListener("focusout", () => presenting() && scheduleHide(item));
    });

    /* Aviso rápido ao entrar: como ver os menus e como sair. */
    const hint = byId("present-hint");
    let hintTimer = null;

    const showHint = () => {
        if (!hint) {
            return;
        }

        window.clearTimeout(hintTimer);
        hint.hidden = false;
        hintTimer = window.setTimeout(() => {
            hint.hidden = true;
        }, 4000);
    };

    /* Entrar ou sair da apresentação: as barras começam escondidas (ou voltam ao normal). */
    const resetBars = () => {
        presentBars.forEach((item) => {
            window.clearTimeout(item.timer);
            setRevealed(item, false);
        });

        if (presenting()) {
            showHint();
        } else if (hint) {
            window.clearTimeout(hintTimer);
            hint.hidden = true;
        }
    };

    document.addEventListener("fullscreenchange", resetBars);
    document.addEventListener("webkitfullscreenchange", resetBars);


    /* ---------------- minha localização ---------------- */

    /*
       Pede a posição ao navegador (só com permissão do usuário; em
       http://localhost ou https). Mostra um ponto azul com o círculo
       de precisão, como no Apple Maps, e enquadra.
    */
    const L = window.L;
    let locationLayer = null;

    const showLocation = (event) => {
        locateButton.classList.remove("is-busy");
        locateButton.setAttribute("aria-pressed", "true");

        if (locationLayer) {
            locationLayer.remove();
        }

        locationLayer = L.layerGroup([
            L.circle(event.latlng, { radius: event.accuracy, className: "user-location-accuracy", interactive: false }),
            L.circleMarker(event.latlng, { radius: 7, className: "user-location-dot", interactive: false })
        ]).addTo(map);

        map.flyTo(event.latlng, Math.max(map.getZoom(), 15), { duration: 0.8 });
        store.setStatus("Localização encontrada");
    };

    map.on("locationfound", showLocation);
    map.on("locationerror", (event) => {
        locateButton.classList.remove("is-busy");
        store.setStatus(event.code === 1
            ? "Localização negada: permita o acesso no navegador"
            : "Não foi possível obter a localização");
    });

    locateButton.addEventListener("click", () => {
        if (locationLayer && locateButton.getAttribute("aria-pressed") === "true") {
            /* Segundo clique: tira o ponto do mapa. */
            locationLayer.remove();
            locationLayer = null;
            locateButton.setAttribute("aria-pressed", "false");
            return;
        }

        locateButton.classList.add("is-busy");
        store.setStatus("Buscando a localização…");
        map.locate({ setView: false, enableHighAccuracy: true, timeout: 15000 });
    });


    /* ---------------- atalhos ---------------- */

    document.addEventListener("keydown", (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || event.defaultPrevented) {
            return;
        }

        if (event.key === "f" || event.key === "F") {
            event.preventDefault();
            toggleFullscreen();
        } else if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            map.zoomIn();
        } else if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            map.zoomOut();
        }
    });


    /* ---------------- mapa base ---------------- */

    /*
       Miniatura: um único ladrilho (zoom 5) sobre o centro do mapa,
       do próprio serviço. São duas imagens pequenas, buscadas uma vez.
    */
    const thumbnailOf = (basemap) => {
        const zoom = 5;
        const [lat, lon] = map.getCenter ? [map.getCenter().lat, map.getCenter().lng] : [-15, -47];
        const n = 2 ** zoom;
        const x = Math.floor(((lon + 180) / 360) * n);
        const rad = (lat * Math.PI) / 180;
        const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);

        return basemap.url.replace("{z}", zoom).replace("{x}", x).replace("{y}", y);
    };

    basemapOptions.replaceChildren(...basemaps.map((basemap) =>
        el("label", { class: "basemap-card" }, [
            el("input", { type: "radio", name: "basemap", value: basemap.id, class: "visually-hidden" }),
            el("img", { class: "basemap-thumb", src: thumbnailOf(basemap), alt: "", loading: "lazy", width: 120, height: 80 }),
            el("span", { class: "basemap-card-name", text: basemap.name })
        ])
    ));

    basemapOptions.addEventListener("change", (event) => {
        if (event.target.name === "basemap") {
            store.setBasemap(event.target.value);
        }
    });

    store.on("basemap", (id) => {
        mapView.setBasemap(id);

        basemapOptions.querySelectorAll("input[name='basemap']").forEach((input) => {
            input.checked = input.value === id;
        });
    });


    /* Depois do desenho, não antes: o estado do botão reflete o que já está no mapa. */
    mapView.onContentChange(updateHome);

    updateHome();
    updateZoom();
    syncFullscreen();

    return {
        toggleFullscreen,
        isFullscreen: () => Boolean(fullscreenElement())
    };
}


/* Sem Leaflet (CDN bloqueada): os controles ficam inertes. */
export function disableMapControls() {
    /* A busca (fora destes controles) segue funcionando: ela trabalha nos dados, não no mapa. */
    document.querySelectorAll(".map-controls button").forEach((button) => {
        button.disabled = true;
        button.title = "Mapa indisponível";
        button.setAttribute("aria-label", "Mapa indisponível");
    });
}
