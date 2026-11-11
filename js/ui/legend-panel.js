/* ============================================================
   LEGENDA (barra esquerda)

   Um cartão por camada ligada: símbolo, nome e quantidade de
   feições. Camada com tema lista as classes (cor, valor ou faixa
   e quantidade), como a legenda do ArcGIS. Camadas
   desligadas ou ainda carregando não aparecem.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, themeClassLabel } from "./format.js";
import { buildLayerSymbol } from "./layer-panel.js";
import { skeletonBlock } from "./skeleton.js";

export function createLegendPanel(store) {
    const body = byId("legend-body");

    const classItem = (color, label, count, muted) => {
        const swatch = el("span", { class: "legend-swatch", "aria-hidden": "true" });

        swatch.style.backgroundColor = color;

        return el("li", { class: `legend-item${muted ? " is-muted" : ""}` }, [
            swatch,
            el("span", { class: "legend-label", text: label, title: label }),
            el("span", { class: "legend-count", text: formatCount(count) })
        ]);
    };

    const render = () => {
        const layers = store.state.layers.filter((layer) => layer.visible && layer.status === "ready");

        const loading = store.state.layers.filter((layer) => layer.status === "loading");

        if (!layers.length) {
            body.replaceChildren(loading.length
                ? skeletonBlock({ lines: 3, caption: `Carregando ${loading.map((layer) => layer.name).join(", ")}…` })
                : el("p", { class: "panel-empty", text: "Nenhuma camada ligada." }));
            return;
        }

        body.replaceChildren(...layers.map((layer) => {
            const legend = layer.theme.visible ? layer.theme.legend : null;
            const attribute = legend
                ? layer.schema.attributes.find((item) => item.name === legend.field)
                : null;

            const classes = legend
                ? [
                    ...legend.classes.map((item) => classItem(item.color, themeClassLabel(item, attribute), item.count, false)),
                    ...(legend.outside ? [classItem(legend.outside.color, "(fora das classes)", legend.outside.count, true)] : []),
                    ...(legend.empty ? [classItem(legend.empty.color, "(vazio)", legend.empty.count, true)] : [])
                ]
                : [];

            return el("section", { class: "glass-card legend-card", "aria-label": `Legenda de ${layer.name}` }, [
                el("header", { class: "legend-card-header" }, [
                    buildLayerSymbol(layer),
                    el("span", { class: "legend-card-name", text: layer.name }),
                    el("span", { class: "legend-count", text: formatCount(layer.view.filtered.length) })
                ]),
                legend ? el("p", { class: "legend-card-field", text: `Por ${legend.field}` }) : null,
                classes.length ? el("ul", { class: "legend" }, classes) : null
            ]);
        }));
    };

    store.on("layers", render);
    store.on("view", render);
    store.on("theme", render);
    /* Cor ou preenchimento mudou (Propriedades › Simbologia): o símbolo acompanha. */
    store.on("symbol", render);

    render();
}
