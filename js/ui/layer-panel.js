/* ============================================================
   PAINEL DE CAMADAS (sidebar)

   Lista as camadas do store: visibilidade (olho), rótulos (T,
   com escolha do atributo), tema (paleta: por categoria ou por
   faixas de valor, com escolha do atributo e legenda), camada ativa (a que alimenta busca,
   filtros e dashboard), contagem e estado de carga. O botão "i"
   (identificar) abre os dados da camada em uma janela
   (ui/layer-info.js). Permite abrir um GeoJSON local.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, themeClassLabel } from "./format.js";
import { isThemeable, themeKind } from "../data/theme.js";
import { skeletonLine } from "./skeleton.js";

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
    /* "T" de texto: rótulos. */
    label: () => icon(["M5 6.5V5h14v1.5", "M12 5v14", "M9 19h6"]),
    /* Paleta: tema por categoria. */
    theme: () => icon([
        "M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.2-1-1.6-1-2.6 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3Z",
        "M7.5 11.5v.01", "M9.8 7.4v.01", "M14.4 7.4v.01"
    ]),
    /* "i" de informação: identificar a camada. */
    info: () => icon(["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 11v5.5", "M12 7.6v.01"])
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
                : layer.style === "outline" ? "outline" : "fill";

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

export function createLayerPanel(store, { onAddFile, onIdentify }) {
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

            const labels = el("button", {
                type: "button",
                class: "layer-toggle layer-labels",
                "aria-pressed": String(labelsOn),
                "aria-label": labelsOn ? `Ocultar rótulos de ${layer.name}` : `Exibir rótulos de ${layer.name}`,
                title: labelsOn ? "Ocultar rótulos" : "Exibir rótulos",
                disabled: !ready,
                dataset: { focusKey: `labels:${layer.id}` },
                onclick: () => store.setLabels(layer.id, { visible: !layer.labels.visible })
            }, ICONS.label());

            const themeable = ready ? layer.schema.attributes.filter(isThemeable) : [];
            const themeOn = layer.theme.visible && ready;

            const theme = el("button", {
                type: "button",
                class: "layer-toggle layer-theme",
                "aria-pressed": String(themeOn),
                "aria-label": themeOn ? `Remover tema de ${layer.name}` : `Tematizar ${layer.name}`,
                title: !themeable.length && ready
                    ? "Sem atributos para tematizar"
                    : themeOn ? "Remover tema" : "Tematizar (cores por atributo; ajuste em Estilos)",
                disabled: !ready || !themeable.length,
                dataset: { focusKey: `theme:${layer.id}` },
                onclick: () => store.setTheme(layer.id, { visible: !layer.theme.visible })
            }, ICONS.theme());

            /* Com tema ligado: escolha do atributo e legenda (cor · valor · quantidade). */
            const themeBlock = themeOn && layer.theme.legend
                ? buildThemeBlock(store, layer, themeable)
                : null;

            /*
               Com rótulos ligados: um seletor por linha do rótulo (um
               atributo por linha, na ordem), remover linha (×) e
               "+ Adicionar linha" (até LABEL_MAX_LINES).
            */
            const labelField = labelsOn ? buildLabelFields(store, layer) : null;

            const name = el("button", {
                type: "button",
                class: "layer-name",
                "aria-pressed": String(active),
                title: active ? "Camada ativa" : "Tornar ativa para busca, filtros e Analytics",
                text: layer.name,
                dataset: { focusKey: `active:${layer.id}` },
                disabled: layer.status !== "ready",
                onclick: () => store.setActiveLayer(layer.id)
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

            const info = el("button", {
                type: "button",
                class: "layer-toggle layer-info-button",
                "aria-label": `Propriedades de ${layer.name}`,
                title: "Propriedades da camada",
                disabled: !ready,
                dataset: { focusKey: `info:${layer.id}` },
                onclick: () => onIdentify(layer.id)
            }, ICONS.info());

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
                    el("span", { class: "layer-title" }, [name, meta]),
                    el("span", { class: "layer-actions" }, [visibility, theme, labels, info, remove])
                ]),
                labelField,
                themeBlock,
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

    renderLayers();
}
