/* ============================================================
   POPUP DA FEIÇÃO

   Montado só a partir do schema da camada (nenhum atributo é
   conhecido de antemão), em quatro blocos:

   1. Cabeçalho: nome da camada e um título para a feição. O
      título é o 1º atributo do rótulo da camada, se houver; senão,
      o 1º atributo de texto/categoria preenchido (ordem do arquivo).
   2. Destaques: até 3 medidas (números com casas decimais) em
      blocos, como os indicadores do Apple Weather.
   3. Detalhes: os demais atributos numa lista agrupada (iOS).
   4. Vazios: atributos sem valor ficam recolhidos numa linha,
      para não poluir a leitura.

   Ações opcionais (Aproximar, Ver na tabela) no rodapé.
   ============================================================ */

import { el } from "./dom.js";
import { formatValue } from "./format.js";
import { getAttribute, isEmpty } from "../data/values.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_HIGHLIGHTS = 3;

const TITLE_ROLES = new Set(["category", "text", "integer"]);

const ACTION_ICONS = {
    zoom: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16 16l4.5 4.5M11 8v6M8 11h6",
    table: "M4 5.5h16v13H4zM4 10h16M4 14.5h16M10 10v8.5"
};

const icon = (d) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const path = document.createElementNS(SVG_NS, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    return svg;
};

const pickTitle = (layer, attributes, feature) => {
    const filled = (attribute) => !isEmpty(getAttribute(feature, attribute.name));
    const labelFields = layer.labels && Array.isArray(layer.labels.fields) ? layer.labels.fields : [];

    for (const name of labelFields) {
        const attribute = attributes.find((item) => item.name === name);

        if (attribute && filled(attribute)) {
            return attribute;
        }
    }

    return attributes.find((attribute) => TITLE_ROLES.has(attribute.role) && filled(attribute)) || null;
};

const action = (kind, label, handler) => {
    const button = el("button", { type: "button", class: "feature-popup-action" }, [
        icon(ACTION_ICONS[kind]),
        el("span", { text: label })
    ]);

    button.addEventListener("click", handler);

    return button;
};

export function buildPopup(layer, feature, { onZoom = null, onShowInTable = null } = {}) {
    const attributes = layer.schema.attributes.filter((attribute) => attribute.role !== "empty");
    const valueOf = (attribute) => getAttribute(feature, attribute.name);

    const titleAttribute = pickTitle(layer, attributes, feature);
    const rest = attributes.filter((attribute) => attribute !== titleAttribute);
    const filled = rest.filter((attribute) => !isEmpty(valueOf(attribute)));
    const blank = rest.filter((attribute) => isEmpty(valueOf(attribute)));

    const highlights = filled.filter((attribute) => attribute.role === "measure").slice(0, MAX_HIGHLIGHTS);
    const details = filled.filter((attribute) => !highlights.includes(attribute));

    /* 1. Cabeçalho */
    const header = el("header", { class: "feature-popup-header" }, [
        el("p", {
            class: "feature-popup-layer",
            text: titleAttribute ? `${layer.name} · ${titleAttribute.name}` : layer.name
        }),
        titleAttribute
            ? el("h3", { class: "feature-popup-title", text: formatValue(valueOf(titleAttribute), titleAttribute) })
            : null
    ]);

    /* 2. Destaques */
    const highlightBlock = highlights.length
        ? el("dl", { class: "feature-highlights" }, highlights.map((attribute) =>
            el("div", { class: "feature-highlight" }, [
                el("dt", { text: attribute.name }),
                el("dd", { text: formatValue(valueOf(attribute), attribute) })
            ])
        ))
        : null;

    /* 3. Detalhes */
    const detailBlock = details.length
        ? el("dl", { class: "feature-info" }, details.map((attribute) =>
            el("div", { class: "feature-info-row" }, [
                el("dt", { text: attribute.name }),
                el("dd", { text: formatValue(valueOf(attribute), attribute) })
            ])
        ))
        : null;

    /* 4. Vazios (recolhidos) */
    const blankBlock = blank.length
        ? el("details", { class: "feature-blank" }, [
            el("summary", { text: `${blank.length} ${blank.length === 1 ? "atributo sem valor" : "atributos sem valor"}` }),
            el("p", { class: "feature-blank-list", text: blank.map((attribute) => attribute.name).join(" · ") })
        ])
        : null;

    const empty = !titleAttribute && !highlights.length && !details.length && !blank.length
        ? el("p", { class: "feature-info-empty", text: "Sem atributos." })
        : null;

    const actions = [
        onZoom ? action("zoom", "Aproximar", onZoom) : null,
        onShowInTable ? action("table", "Ver na tabela", onShowInTable) : null
    ].filter(Boolean);

    return el("div", { class: "feature-popup-body" }, [
        header,
        el("div", { class: "feature-popup-scroll" }, [highlightBlock, detailBlock, blankBlock, empty]),
        actions.length ? el("div", { class: "feature-popup-actions" }, actions) : null
    ]);
}
