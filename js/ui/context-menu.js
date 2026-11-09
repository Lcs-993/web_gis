/* ============================================================
   MENU DE CONTEXTO DO MAPA (botão direito)

   No mapa vazio: copiar coordenadas, centralizar aqui e medir a
   partir daqui ("Em breve"). Sobre uma feição: informações,
   aproximar, exportar só ela em KML e registrar ocorrência
   (Pragas, Daninhas, Fogo: "Em breve").

   Pelo teclado: com o mapa em foco, Shift+F10 ou a tecla de menu
   abrem o menu do centro do mapa.
   ============================================================ */

import { openMenu } from "./menu.js";
import { featureTitle } from "./popup.js";

/* Ponto como texto: lat, lon com 6 casas e ponto decimal (cola no Google Maps, QGIS). */
const coordinates = (latlng) => `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;

const copyText = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        /* Sem a API (ou sem permissão): cópia pelo método antigo. */
        const area = document.createElement("textarea");

        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();

        const ok = document.execCommand("copy");

        area.remove();
        return ok;
    }
};

export function createContextMenu(store, mapView, { onInfo, onZoom, onExportKml }) {
    const map = mapView.map;

    if (!map) {
        return;
    }

    const copy = async (latlng) => {
        const ok = await copyText(coordinates(latlng));

        store.setStatus(ok ? `Coordenadas copiadas: ${coordinates(latlng)}` : "Não foi possível copiar as coordenadas");
    };

    const commonItems = [
        { label: "Copiar coordenadas", action: "copy" },
        { label: "Centralizar aqui", action: "center" },
        { label: "Medir a partir daqui", soon: true }
    ];

    const runCommon = (action, latlng) => {
        if (action === "copy") {
            copy(latlng);
        } else if (action === "center") {
            map.panTo(latlng);
        }
    };

    mapView.onMapContextMenu(({ latlng, point }) => {
        openMenu({
            items: [{ heading: coordinates(latlng) }, ...commonItems],
            point,
            label: "Menu do mapa",
            onAction: (action) => runCommon(action, latlng)
        });
    });

    mapView.onFeatureContextMenu(({ layerId, uid, latlng, point }) => {
        const layer = store.getLayer(layerId);
        const feature = layer ? layer.features[uid] : null;

        if (!feature) {
            return;
        }

        const title = featureTitle(layer, feature);

        openMenu({
            items: [
                { heading: title ? `${layer.name} · ${title}` : layer.name },
                { label: "Informações", action: "info" },
                { label: "Aproximar", action: "zoom" },
                { label: "Exportar KML", action: "kml", description: "Só esta feição, para o Google Earth" },
                { separator: true },
                {
                    label: "Registrar ocorrência",
                    items: [
                        { label: "Pragas", soon: true },
                        { label: "Daninhas", soon: true },
                        { label: "Fogo", soon: true }
                    ]
                },
                { separator: true },
                ...commonItems
            ],
            point,
            label: `Menu de ${layer.name}`,
            onAction: (action) => {
                if (action === "info") {
                    onInfo(layerId, uid, latlng);
                } else if (action === "zoom") {
                    onZoom(layerId, uid);
                } else if (action === "kml") {
                    onExportKml(layerId, uid, title);
                } else {
                    runCommon(action, latlng);
                }
            }
        });
    });

    /* Teclado: Shift+F10 ou tecla de menu com o mapa em foco. */
    map.getContainer().addEventListener("keydown", (event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();

            const box = map.getContainer().getBoundingClientRect();
            const center = map.getCenter();

            openMenu({
                items: [{ heading: coordinates(center) }, ...commonItems],
                point: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
                label: "Menu do mapa",
                focus: "first",
                onAction: (action) => runCommon(action, center)
            });
        }
    });
}
