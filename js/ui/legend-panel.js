/* ============================================================
   LEGENDA (barra esquerda)

   No padrão do painel Camadas: um grupo só, com filetes entre as
   camadas ligadas. Cada camada mostra o nome sobre o tipo e a
   quantidade ("Polígonos · 3.388 feições"); camada com tema troca
   o símbolo pelas classes (cor, valor ou faixa e quantidade),
   alinhadas ao nome, como a legenda do ArcGIS. Camadas
   desligadas ou ainda carregando não aparecem.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, themeClassLabel } from "./format.js";
import { buildLayerSymbol, featureCountText, geometryNoun } from "./layer-panel.js";
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

        body.replaceChildren(el("div", { class: "legend-group" }, layers.map((layer) => {
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

            /* Com tema, as cores estão nas classes: no lugar do símbolo, um recuo do mesmo tamanho. */
            const symbol = legend ? el("span", { class: "legend-card-spacer", "aria-hidden": "true" }) : buildLayerSymbol(layer);
            const subtitle = legend
                ? `Por ${legend.field} · ${featureCountText(layer)}`
                : `${geometryNoun(layer)} · ${featureCountText(layer)}`;

            return el("section", { class: `legend-card${legend ? " is-themed" : ""}`, "aria-label": `Legenda de ${layer.name}` }, [
                el("header", { class: "legend-card-header" }, [
                    symbol,
                    el("span", { class: "legend-card-heading" }, [
                        el("span", { class: "legend-card-name", text: layer.name, title: layer.name }),
                        el("span", { class: "legend-card-field", text: subtitle })
                    ])
                ]),
                classes.length ? el("ul", { class: "legend" }, classes) : null
            ]);
        })));
    };

    store.on("layers", render);
    store.on("view", render);
    store.on("theme", render);
    /* Cor ou preenchimento mudou (Propriedades › Simbologia): o símbolo acompanha. */
    store.on("symbol", render);

    render();
}
