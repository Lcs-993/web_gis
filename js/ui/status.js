/*
   Mensagens de status, avisos do mapa e rodapé.

   - Status: vai para uma região "live" oculta (#app-status), lida
     por leitores de tela.
   - Rodapé (#map-footer): faixa fina sobre o mapa, à direita: o
     status visível ("Pronto", "Carregando…"), as coordenadas do
     cursor (ou do centro, com o cursor fora do mapa) e o zoom. As
     fontes dos dados ficam no painel Sobre.
*/

import { el, byId } from "./dom.js";

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
    const footerStatus = byId("footer-status");

    const setStatus = (text) => {
        status.textContent = text;

        /* Reticências no fim = trabalho em andamento: o ponto pulsa. */
        footerStatus.textContent = text;
        footerStatus.classList.toggle("is-busy", /…$/.test(text));
    };

    /*
       Cartão de falha sobre o mapa (vidro, topo central): o que
       falhou, o porquê e as ações. Um por camada; some ao tentar de
       novo ou ao fechar.
    */
    const notices = byId("map-notices");

    const showLoadError = ({ key, title, detail, onRetry }) => {
        const previous = notices.querySelector(`[data-key="${CSS.escape(key)}"]`);

        if (previous) {
            previous.remove();
        }

        const card = el("section", { class: "notice-card", role: "alert", dataset: { key } }, [
            el("span", { class: "notice-mark", "aria-hidden": "true", text: "!" }),
            el("div", { class: "notice-text" }, [
                el("p", { class: "notice-title", text: title }),
                detail ? el("p", { class: "notice-detail", text: detail }) : null
            ]),
            el("div", { class: "notice-actions" }, [
                onRetry
                    ? el("button", {
                        type: "button",
                        class: "button button-primary",
                        text: "Tentar de novo",
                        onclick: () => {
                            card.remove();
                            onRetry();
                        }
                    })
                    : null,
                el("button", { type: "button", class: "button button-ghost", text: "Fechar", onclick: () => card.remove() })
            ])
        ]);

        notices.appendChild(card);
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

            coordsLabel.textContent = cursor ? "Lat/Long:" : "Centro";
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

    return { setStatus, setMapNotice, showLoadError, bindMap };
}
