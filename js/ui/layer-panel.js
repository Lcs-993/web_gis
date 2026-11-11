/* ============================================================
   PAINEL DE CAMADAS (sidebar)

   Lista as camadas do store: símbolo, nome (clique = camada
   ativa, a que alimenta busca, filtros e dashboard; duplo clique =
   propriedades), contagem, visibilidade (olho) e o botão de
   Propriedades (js/ui/layer-properties.js), onde ficam
   simbologia, rótulos, informação e campos. Tema e rótulos
   ligados aparecem como etiquetas ao lado do nome.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, themeClassLabel } from "./format.js";
import { themeKind } from "../data/theme.js";
import { skeletonLine } from "./skeleton.js";
import { resolveSymbol } from "../data/symbol.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/* Ícone SVG de traço a partir de uma lista de "d" de paths. */
const icon = (paths) => {
    const svg = document.createElementNS(SVG_NS, "svg");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");

    paths.forEach((d) => {
        const path = document.createElementNS(SVG_NS, "path");

        path.setAttribute("d", d);
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.8");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
    });

    return svg;
};

const EYE = "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z";
const PUPIL = "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z";

const ICONS = {
    eyeOpen: () => icon([EYE, PUPIL]),
    eyeClosed: () => icon([EYE, PUPIL, "M4 4l16 16"]),
    /* Controles deslizantes: propriedades da camada. */
    properties: () => icon([
        "M4 7h9M17 7h3", "M4 12h3M11 12h9", "M4 17h11M19 17h1",
        "M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z", "M9 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z", "M17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
    ])
};

const LABEL_MAX_LINES = 4;

/*
   Blocos reaproveitados pelos painéis da camada ativa (Estilos,
   Rótulos) e pela Legenda: a mesma interface em todo lugar.
*/

/*
   Símbolo da camada, como no sumário do ArcGIS: ícone do ponto,
   círculo (pontos), traço (linhas), só contorno (camadas de
   referência) ou quadrado preenchido.
*/
export const buildLayerSymbol = (layer) => {
    const types = Object.keys(layer.geometryTypes || {}).join(" ");
    const kind = layer.icon
        ? "icon"
        : /Point/.test(types) && !/Polygon|LineString/.test(types)
            ? "point"
            : /LineString/.test(types) && !/Polygon/.test(types)
                ? "line"
                : resolveSymbol(layer).fill ? "fill" : "outline";

    const symbol = kind === "icon"
        ? el("img", { class: "layer-symbol is-icon", src: layer.icon.url, alt: "", width: 14, height: 14 })
        : el("span", { class: `layer-symbol is-${kind}`, "aria-hidden": "true" });

    if (kind !== "icon") {
        symbol.style.setProperty("--symbol-color", layer.color || "var(--text-muted)");
    }

    return symbol;
};

/* Seletores das linhas do rótulo (um atributo por linha), remover linha e "+ Adicionar linha". */
export const buildLabelFields = (store, layer) => {
    const options = layer.schema.attributes.filter((attribute) => attribute.role !== "empty");
    const fields = layer.labels.fields.length ? layer.labels.fields : options.slice(0, 1).map((item) => item.name);
    const setFields = (next) => store.setLabels(layer.id, { fields: next });

    const lines = fields.map((field, index) => el("div", { class: "layer-label-field" }, [
        el("select", {
            "aria-label": `Linha ${index + 1} do rótulo de ${layer.name}`,
            dataset: { focusKey: `label-field:${layer.id}:${index}` },
            onchange: (event) => setFields(fields.map((item, position) => (position === index ? event.target.value : item)))
        }, options.map((attribute) => el("option", {
            value: attribute.name,
            text: attribute.name,
            selected: attribute.name === field
        }))),
        fields.length > 1
            ? el("button", {
                type: "button",
                class: "layer-label-remove",
                text: "×",
                title: "Remover linha",
                "aria-label": `Remover a linha ${index + 1} do rótulo`,
                onclick: () => setFields(fields.filter((_, position) => position !== index))
            })
            : null
    ]));

    /* Nova linha: o primeiro atributo ainda não usado. */
    const unused = options.find((attribute) => !fields.includes(attribute.name));

    if (unused && fields.length < LABEL_MAX_LINES) {
        lines.push(el("button", {
            type: "button",
            class: "link-button layer-label-add",
            text: "+ Adicionar linha",
            dataset: { focusKey: `label-add:${layer.id}` },
            onclick: () => setFields([...fields, unused.name])
        }));
    }

    return el("div", { class: "layer-label-fields" }, [
        el("span", { class: "field-label", text: "Rótulo" }),
        el("div", { class: "layer-label-lines" }, lines)
    ]);
};

/*
   Seletor do atributo do tema: categorias e números em grupos
   separados (o tipo decide entre uma cor por valor e faixas).
*/
export const buildThemeFieldSelect = (store, layer, themeable, label) => {
    const option = (item) => el("option", { value: item.name, text: item.name, selected: item.name === layer.theme.field });
    const groups = [
        ["Categorias (uma cor por valor)", themeable.filter((item) => themeKind(item) === "category")],
        ["Valores numéricos (faixas)", themeable.filter((item) => themeKind(item) === "numeric")]
    ].filter(([, items]) => items.length);

    return el("select", {
        "aria-label": label,
        dataset: { focusKey: `theme-field:${layer.id}` },
        onchange: (event) => store.setTheme(layer.id, { field: event.target.value })
    }, groups.map(([title, items]) => el("optgroup", { label: title }, items.map(option))));
};

/* Tema: atributo e legenda (cor · valor ou faixa · quantidade). */
export const buildThemeBlock = (store, layer, themeable, { showField = true } = {}) => {
    const legend = layer.theme.legend;
    const attribute = themeable.find((item) => item.name === legend.field);

    const entry = (color, label, count, muted) => {
        const swatch = el("span", { class: "legend-swatch", "aria-hidden": "true" });

        swatch.style.backgroundColor = color;

        return el("li", { class: `legend-item${muted ? " is-muted" : ""}` }, [
            swatch,
            el("span", { class: "legend-label", text: label, title: label }),
            el("span", { class: "legend-count", text: formatCount(count) })
        ]);
    };

    const items = legend.classes.map((item) =>
        entry(item.color, themeClassLabel(item, attribute), item.count, false)
    );

    if (legend.outside) {
        items.push(entry(legend.outside.color, "(fora das classes)", legend.outside.count, true));
    }

    if (legend.empty) {
        items.push(entry(legend.empty.color, "(vazio)", legend.empty.count, true));
    }

    return el("div", { class: "layer-theme-block" }, [
        showField
            ? el("label", { class: "layer-label-field" }, [
                el("span", { class: "field-label", text: "Tema" }),
                buildThemeFieldSelect(store, layer, themeable, `Atributo do tema de ${layer.name}`)
            ])
            : null,
        el("ul", { class: "legend", "aria-label": `Legenda do tema ${legend.field}` }, items)
    ]);
};

export function createLayerPanel(store, { onAddFile, onProperties }) {
    const list = byId("layer-list");
    const fileInput = byId("layer-file-input");

    /* Quantidade de feições entre parênteses, logo após o nome: "(3.343)" ou "(456 de 3.343)" com filtro. */
    const metaText = (layer) => {
        if (layer.status === "loading") {
            return "(carregando…)";
        }

        if (layer.status === "error") {
            return "(erro)";
        }

        const total = layer.features.length;
        const shown = layer.view.filtered.length;

        return shown === total ? `(${formatCount(total)})` : `(${formatCount(shown)} de ${formatCount(total)})`;
    };

    /* Recria a lista sem perder o foco do teclado. */

    const renderLayers = () => {
        const focused = list.contains(document.activeElement)
            ? document.activeElement.dataset.focusKey
            : null;

        drawLayers();

        if (focused) {
            const target = list.querySelector(`[data-focus-key="${CSS.escape(focused)}"]`);

            if (target) {
                target.focus();
            }
        }
    };


    const drawLayers = () => {
        const { layers, activeLayerId } = store.state;

        list.replaceChildren(...layers.map((layer) => {
            const active = layer.id === activeLayerId;

            const ready = layer.status === "ready";
            const shown = layer.visible && ready;
            const labelsOn = layer.labels.visible && ready;

            const visibility = el("button", {
                type: "button",
                class: "layer-toggle layer-visibility",
                "aria-pressed": String(shown),
                "aria-label": shown ? `Ocultar ${layer.name}` : `Exibir ${layer.name}`,
                title: shown ? "Ocultar camada" : "Exibir camada",
                disabled: !ready,
                dataset: { focusKey: `visible:${layer.id}` },
                onclick: () => store.setLayerVisible(layer.id, !layer.visible)
            }, shown ? ICONS.eyeOpen() : ICONS.eyeClosed());

            /* Estado resumido ao lado do nome: tema e rótulos ligados (ajustes na janela de Propriedades). */
            const themeOn = layer.theme.visible && ready;
            const badges = [
                themeOn ? ["Tema", `Tema por ${layer.theme.field}`] : null,
                labelsOn ? ["Rótulos", "Rótulos ligados"] : null
            ].filter(Boolean).map(([text, title]) => el("span", { class: "layer-badge", text, title }));

            const name = el("button", {
                type: "button",
                class: "layer-name",
                "aria-pressed": String(active),
                title: active ? "Camada ativa" : "Tornar ativa para busca, filtros e Analytics",
                text: layer.name,
                dataset: { focusKey: `active:${layer.id}` },
                disabled: layer.status !== "ready",
                onclick: () => store.setActiveLayer(layer.id),
                /* Como no QGIS: duplo clique no nome abre as propriedades da camada. */
                ondblclick: () => onProperties(layer.id)
            });

            const symbol = buildLayerSymbol(layer);

            /* Carregando: um traço pulsando no lugar da contagem (o leitor de tela lê o texto). */
            const meta = layer.status === "loading"
                ? el("span", { class: "layer-meta" }, [
                    skeletonLine("48px"),
                    el("span", { class: "visually-hidden", text: "carregando" })
                ])
                : el("span", {
                    class: `layer-meta${layer.status === "error" ? " is-error" : ""}`,
                    text: metaText(layer)
                });

            const properties = el("button", {
                type: "button",
                class: "layer-toggle layer-properties-button",
                "aria-label": `Propriedades de ${layer.name}: simbologia, rótulos e campos`,
                title: "Propriedades da camada",
                disabled: !ready,
                dataset: { focusKey: `properties:${layer.id}` },
                onclick: () => onProperties(layer.id)
            }, ICONS.properties());

            const remove = layer.source === "file" || layer.status === "error"
                ? el("button", {
                    type: "button",
                    class: "layer-remove",
                    "aria-label": `Remover ${layer.name}`,
                    title: "Remover camada",
                    text: "×",
                    onclick: () => store.removeLayer(layer.id)
                })
                : null;

            const error = layer.status === "error"
                ? el("p", { class: "layer-error", role: "alert", text: layer.error })
                : null;

            return el("li", { class: `layer-item${active ? " is-active" : ""}` }, [
                el("div", { class: `layer-row${shown ? "" : " is-hidden"}` }, [
                    /* Nome + quantidade à esquerda; ações à direita. */
                    symbol,
                    el("span", { class: "layer-title" }, [name, meta, ...badges]),
                    el("span", { class: "layer-actions" }, [visibility, properties, remove])
                ]),
                error
            ]);
        }));

        if (!layers.length) {
            list.replaceChildren(el("li", { class: "sidebar-empty", text: "Nenhuma camada carregada." }));
        }
    };

    fileInput.addEventListener("change", () => {
        Array.from(fileInput.files || []).forEach((file) => onAddFile(file));
        fileInput.value = "";
    });

    store.on("layers", renderLayers);
    store.on("active", renderLayers);

    store.on("view", renderLayers);
    store.on("labels", renderLayers);
    store.on("theme", renderLayers);
    /* Cor ou preenchimento mudou: o símbolo ao lado do nome acompanha. */
    store.on("symbol", renderLayers);

    renderLayers();
}
