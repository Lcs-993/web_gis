/*
   Mensagens de status, avisos do mapa e rodapé.

   - Status: vai para uma região "live" oculta (#app-status), lida
     por leitores de tela.
   - Rodapé (#map-footer): discreto e translúcido, sobre o mapa;
     mostra as coordenadas do cursor (ou do centro, com o cursor
     fora do mapa) e o nível de zoom.
*/

import { byId } from "./dom.js";

const LOCALE = "pt-BR";

/* Graus decimais com 5 casas (~1 m), vírgula decimal. */
const formatCoordinate = (value) =>
    value.toLocaleString(LOCALE, { minimumFractionDigits: 5, maximumFractionDigits: 5 });

const formatZoom = (value) =>
    value.toLocaleString(LOCALE, { maximumFractionDigits: 1 });

export function createStatusBar(store) {
    const status = byId("app-status");
    const mapStatus = byId("map-status");
    const coordsLabel = byId("footer-coords-label");
    const coords = byId("footer-coords");
    const zoom = byId("footer-zoom");

    const setStatus = (text) => {
        status.textContent = text;
    };

    /* Aviso sobre o mapa, para falhas que impedem o uso. */
    const setMapNotice = (text) => {
        mapStatus.textContent = text || "";
        mapStatus.hidden = !text;
    };

    const bindMap = (map) => {
        let cursor = null;
        let frame = null;

        /* Uma atualização por quadro, mesmo com o mouse ou o arraste rápidos. */
        const update = () => {
            frame = null;

            const point = cursor || map.getCenter();

            coordsLabel.textContent = cursor ? "Cursor" : "Centro";
            coords.textContent = `${formatCoordinate(point.lat)}, ${formatCoordinate(point.lng)}`;
            zoom.textContent = formatZoom(map.getZoom());
        };

        const schedule = () => {
            if (frame === null) {
                frame = window.requestAnimationFrame(update);
            }
        };

        map.on("mousemove", (event) => {
            cursor = event.latlng;
            schedule();
        });

        map.on("mouseout", () => {
            cursor = null;
            schedule();
        });

        map.on("move zoomend", schedule);

        update();
    };

    store.on("status", setStatus);

    return { setStatus, setMapNotice, bindMap };
}
