/* ============================================================
   PESQUISA AVANÇADA (barra esquerda, grupo Consultar)

   Ajusta como a caixa de busca do mapa procura na camada ativa
   (store.setSearchOptions): campos, correspondência, E/OU e
   enquadrar. O termo continua sendo digitado na caixa do mapa.

   Estilos e Rótulos, que ficavam aqui, estão na janela de
   Propriedades da camada (js/ui/layer-properties.js).
   ============================================================ */

import { el, byId } from "./dom.js";
import { fieldRow, fill, switchRow } from "./layer-style.js";
import { formatCount } from "./format.js";
import { SEARCH_COMBINE, SEARCH_MATCH, isDefaultSearch } from "../data/search.js";
import { isSearchable } from "../data/schema.js";
import { layerPendingState } from "./skeleton.js";

export function createLayerTools(store) {
    const searchBody = byId("search-body");

    /* Redesenhar sem perder o foco do teclado (mesma técnica do painel Camadas). */
    const keepFocus = (container, draw) => {
        const focused = container.contains(document.activeElement)
            ? document.activeElement.dataset.focusKey
            : null;

        draw();

        if (focused) {
            const target = container.querySelector(`[data-focus-key="${CSS.escape(focused)}"]`);

            if (target) {
                target.focus();
            }
        }
    };

    /*
       Pesquisa avançada (botão Pesquisar): como a caixa de busca do
       mapa procura na camada ativa. Campos, correspondência, E/OU e
       enquadrar; o termo continua sendo digitado na caixa do mapa.
    */
    const drawSearch = () => {
        const layer = store.getActiveLayer();

        if (!layer || layer.status !== "ready") {
            searchBody.replaceChildren(layerPendingState(layer));
            return;
        }

        const options = layer.search.options;
        const set = (patch) => store.setSearchOptions(layer.id, patch);
        const searchable = layer.schema.attributes.filter(isSearchable);
        const chosen = options.fields ? new Set(options.fields) : null;
        const isChosen = (name) => !chosen || chosen.has(name);
        const matchInfo = SEARCH_MATCH.find((item) => item.id === options.match) || SEARCH_MATCH[0];
        const { term } = layer.search;
        const matches = layer.view.matches;

        /* Todos marcados volta a null (padrão): campos novos de uma recarga entram também. */
        const setFields = (names) => set({ fields: names.length === searchable.length ? null : names });

        const toggleField = (name, on) => {
            const current = searchable.map((item) => item.name).filter(isChosen);

            setFields(on ? searchable.map((item) => item.name).filter((item) => item === name || current.includes(item)) : current.filter((item) => item !== name));
        };

        const select = (key, items, value, onChange) => el("select", {
            dataset: { focusKey: `search-${key}:${layer.id}` },
            onchange: (event) => onChange(event.target.value)
        }, items.map((item) => el("option", { value: item.id, text: item.label, selected: item.id === value })));

        const status = !term
            ? "Digite na caixa de busca do mapa (Ctrl+K). Estes ajustes valem para a camada ativa."
            : matches && matches.length
                ? `“${term}”: ${formatCount(matches.length)} resultado${matches.length === 1 ? "" : "s"}.`
                : `“${term}”: nenhum resultado com estes ajustes.`;

        const count = chosen ? searchable.filter((item) => chosen.has(item.name)).length : searchable.length;

        fill(searchBody,
            el("p", { class: "panel-summary search-status", text: status }),
            el("div", { class: "glass-card panel-block theme-settings" }, [
                fieldRow("Correspondência", select("match", SEARCH_MATCH, options.match, (value) => set({ match: value }))),
                el("p", { class: "settings-hint", text: matchInfo.hint }),
                fieldRow("Termos", select("combine", SEARCH_COMBINE, options.combine, (value) => set({ combine: value }))),
                el("p", { class: "settings-hint", text: options.combine === "any"
                    ? "Basta um dos termos (separados por espaço) aparecer."
                    : "Todos os termos (separados por espaço) precisam aparecer." })
            ]),
            el("div", { class: "glass-card panel-block" }, [
                el("div", { class: "search-fields-head" }, [
                    el("p", { class: "field-label", text: `Campos pesquisados (${count} de ${searchable.length})` }),
                    el("span", { class: "column-filter-bulk" }, [
                        el("button", {
                            type: "button",
                            class: "link-button",
                            text: "Todos",
                            dataset: { focusKey: `search-all:${layer.id}` },
                            onclick: () => set({ fields: null })
                        }),
                        el("button", {
                            type: "button",
                            class: "link-button",
                            text: "Nenhum",
                            dataset: { focusKey: `search-none:${layer.id}` },
                            onclick: () => set({ fields: [] })
                        })
                    ])
                ]),
                el("div", { class: "column-filter-list search-field-list" }, searchable.map((attribute) =>
                    el("label", { class: "column-filter-option" }, [
                        el("input", {
                            type: "checkbox",
                            checked: isChosen(attribute.name),
                            dataset: { focusKey: `search-field:${layer.id}:${attribute.name}` },
                            onchange: (event) => toggleField(attribute.name, event.target.checked)
                        }),
                        el("span", { class: "column-filter-option-label", text: attribute.name, title: attribute.name })
                    ])
                )),
                count === 0 ? el("p", { class: "settings-hint", text: "Nenhum campo marcado: a busca não acha nada." }) : null
            ]),
            el("div", { class: "glass-card" }, [
                switchRow({
                    label: "Enquadrar os resultados",
                    hint: "O mapa aproxima das feições encontradas a cada nova busca.",
                    checked: options.fit,
                    focusKey: `search-fit:${layer.id}`,
                    onChange: (on) => set({ fit: on })
                })
            ]),
            el("button", {
                type: "button",
                class: "link-button search-reset",
                text: "Restaurar o padrão",
                disabled: isDefaultSearch(options) && options.fit,
                dataset: { focusKey: `search-reset:${layer.id}` },
                onclick: () => set(null)
            })
        );
    };

    const render = () => keepFocus(searchBody, drawSearch);

    store.on("layers", render);
    store.on("active", render);
    /* Termo ou opções da busca mudaram. */
    store.on("view", (layer) => {
        if (layer && layer.id === store.state.activeLayerId) {
            render();
        }
    });

    render();
}
