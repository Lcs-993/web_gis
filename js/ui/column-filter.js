/* ============================================================
   FILTRO DE COLUNA (tabela do dashboard)

   Painel suspenso aberto pelo funil de cada cabeçalho. O controle
   depende do tipo descoberto do atributo:
   - número com faixa: barra de intervalo + "De"/"Até";
   - categoria: lista de valores para marcar (com contagem e busca);
   - sim/não: Todos / Sim / Não / Vazio;
   - data: "De"/"Até";
   - demais textos: "contém".

   O resultado vira um filtro comum da camada (store.setFieldFilter):
   aparece no painel Filtros, conta no badge e filtra o mapa. Um
   filtro por coluna; aplicar substitui o anterior do mesmo campo.
   ============================================================ */

import { el } from "./dom.js";
import { formatCount, formatValue } from "./format.js";
import { applyFilters, createFilter, createListFilter } from "../data/filters.js";
import { getAttribute, isEmpty, normalizeText, toNumber } from "../data/values.js";

const WIDTH = 280;
const SEARCH_THRESHOLD = 8;

const kindOf = (attribute) => {
    if (attribute.type === "number") {
        return attribute.range && attribute.range.min < attribute.range.max ? "range" : "text";
    }

    if (attribute.role === "category") {
        return "list";
    }

    if (attribute.type === "boolean") {
        return "boolean";
    }

    if (attribute.type === "date") {
        return "date";
    }

    return "text";
};

export function createColumnFilter(store) {
    let popover = null;
    let anchor = null;

    const close = ({ returnFocus = false } = {}) => {
        if (!popover) {
            return;
        }

        popover.remove();
        popover = null;

        if (returnFocus && anchor && anchor.isConnected) {
            anchor.focus();
        }

        anchor = null;
    };

    document.addEventListener("pointerdown", (event) => {
        if (popover && !popover.contains(event.target) && !(anchor && anchor.contains(event.target))) {
            close();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (popover && event.key === "Escape") {
            /* Captura: o Esc fecha só este painel, não o dashboard. */
            event.preventDefault();
            event.stopPropagation();
            close({ returnFocus: true });
        }
    }, true);

    store.on("active", () => close());

    /* Posição fixa junto ao funil; abre para cima se faltar espaço embaixo. */
    const place = () => {
        if (!popover || !anchor) {
            return;
        }

        const rect = anchor.getBoundingClientRect();
        const height = popover.offsetHeight;
        const below = window.innerHeight - rect.bottom - 8;
        const top = below >= height || rect.top < height ? rect.bottom + 6 : rect.top - height - 6;
        const left = Math.min(Math.max(8, rect.right - WIDTH), window.innerWidth - WIDTH - 8);

        popover.style.top = `${Math.max(8, top)}px`;
        popover.style.left = `${left}px`;
    };

    window.addEventListener("resize", () => close());
    /* Entrar ou sair da tela cheia muda onde o painel pode aparecer: fecha. */
    document.addEventListener("fullscreenchange", () => close());
    document.addEventListener("webkitfullscreenchange", () => close());


    /* ---------------- controles por tipo ---------------- */

    /* Barra de intervalo (mesmas classes do painel Filtros). */
    const rangeControl = (attribute, current) => {
        const { min, max, step, decimals } = attribute.range;
        let low = min;
        let high = max;

        if (current && current.operator === "between") {
            low = Math.min(toNumber(current.value), toNumber(current.valueTo));
            high = Math.max(toNumber(current.value), toNumber(current.valueTo));
        } else if (current && current.operator === "equals") {
            low = toNumber(current.value);
            high = low;
        }

        const round = (value) => Number(Number(value).toFixed(decimals));
        const clamp = (value) => Math.min(max, Math.max(min, value));
        const percent = (value) => ((value - min) / (max - min)) * 100;

        const fromInput = el("input", { type: "number", min: String(min), max: String(max), step: String(step), "aria-label": "De" });
        const toInput = el("input", { type: "number", min: String(min), max: String(max), step: String(step), "aria-label": "Até" });
        const thumbLow = el("input", { type: "range", min: String(min), max: String(max), step: String(step), "aria-label": "Arrastar valor mínimo" });
        const thumbHigh = el("input", { type: "range", min: String(min), max: String(max), step: String(step), "aria-label": "Arrastar valor máximo" });
        const slider = el("div", { class: "range-slider" }, [
            el("div", { class: "range-track" }, el("div", { class: "range-fill" })),
            thumbLow,
            thumbHigh
        ]);

        const render = ({ syncInputs = true } = {}) => {
            thumbLow.value = String(low);
            thumbHigh.value = String(high);

            if (syncInputs) {
                fromInput.value = String(low);
                toInput.value = String(high);
            }

            slider.style.setProperty("--from", `${percent(low)}%`);
            slider.style.setProperty("--to", `${percent(high)}%`);
            thumbLow.style.zIndex = low > (min + max) / 2 ? "3" : "1";
            thumbHigh.style.zIndex = "2";
        };

        thumbLow.addEventListener("input", () => {
            low = Math.min(round(thumbLow.value), high);
            render();
        });

        thumbHigh.addEventListener("input", () => {
            high = Math.max(round(thumbHigh.value), low);
            render();
        });

        const typed = (input, which) => {
            const value = toNumber(String(input.value).replace(",", "."));

            if (value !== null) {
                const clean = round(clamp(value));

                if (which === "low") {
                    low = clean;
                    high = Math.max(high, clean);
                } else {
                    high = clean;
                    low = Math.min(low, clean);
                }
            }

            render();
        };

        fromInput.addEventListener("change", () => typed(fromInput, "low"));
        toInput.addEventListener("change", () => typed(toInput, "high"));

        render();

        return {
            element: el("div", { class: "range-filter" }, [
                el("div", { class: "range-inputs" }, [
                    el("label", { class: "range-input" }, [el("span", { class: "field-label", text: "De" }), fromInput]),
                    el("label", { class: "range-input" }, [el("span", { class: "field-label", text: "Até" }), toInput])
                ]),
                slider,
                el("div", { class: "range-limits" }, [
                    el("span", { text: `mín. ${formatValue(min, attribute)}` }),
                    el("span", { text: `máx. ${formatValue(max, attribute)}` })
                ])
            ]),
            /* Faixa inteira = sem filtro; marcadores juntos = "igual a". */
            build: () => {
                if (low <= min && high >= max) {
                    return null;
                }

                return low === high
                    ? createFilter(attribute, "equals", low)
                    : createFilter(attribute, "between", low, high);
            }
        };
    };

    /* Lista de valores (categorias), com contagem dentro dos outros filtros. */
    const listControl = (attribute, current, layer) => {
        const otherFilters = layer.filters.filter((filter) => filter.field !== attribute.name);
        const counts = new Map();
        let empties = 0;

        applyFilters(layer.features, otherFilters).forEach((uid) => {
            const value = getAttribute(layer.features[uid], attribute.name);

            if (isEmpty(value)) {
                empties++;
                return;
            }

            const key = String(value).trim();

            counts.set(key, (counts.get(key) || 0) + 1);
        });

        const options = Array.from(counts, ([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR", { numeric: true }));

        if (empties) {
            options.push({ value: null, count: empties });
        }

        /* Pré-marcação: filtro "in" atual, "é igual a", ou tudo. */
        let checked;

        if (current && current.operator === "in") {
            const accepted = new Set((current.values || []).map((value) => (value === null ? null : normalizeText(value))));

            checked = (option) => accepted.has(option.value === null ? null : normalizeText(option.value));
        } else if (current && current.operator === "equals") {
            checked = (option) => option.value !== null && normalizeText(option.value) === normalizeText(current.value);
        } else {
            checked = () => true;
        }

        const boxes = options.map((option) => {
            const box = el("input", { type: "checkbox", checked: checked(option) });
            const label = option.value === null ? "(vazio)" : formatValue(option.value, attribute);
            const row = el("label", { class: `column-filter-option${option.value === null ? " is-empty" : ""}` }, [
                box,
                el("span", { class: "column-filter-option-label", text: label, title: label }),
                el("span", { class: "column-filter-option-count", text: formatCount(option.count) })
            ]);

            return { option, box, row, search: normalizeText(label) };
        });

        const list = el("div", { class: "column-filter-list" }, boxes.map((item) => item.row));
        const setAll = (value) => boxes.forEach((item) => {
            if (!item.row.hidden) {
                item.box.checked = value;
            }
        });

        const children = [];

        if (boxes.length > SEARCH_THRESHOLD) {
            const search = el("input", { type: "search", class: "column-filter-search", placeholder: "Procurar valor", "aria-label": "Procurar valor" });

            search.addEventListener("input", () => {
                const term = normalizeText(search.value);

                boxes.forEach((item) => {
                    item.row.hidden = Boolean(term) && !item.search.includes(term);
                });
            });

            children.push(search);
        }

        children.push(
            el("div", { class: "column-filter-bulk" }, [
                el("button", { type: "button", class: "link-button", text: "Marcar todos", onclick: () => setAll(true) }),
                el("button", { type: "button", class: "link-button", text: "Desmarcar todos", onclick: () => setAll(false) })
            ]),
            list
        );

        return {
            element: el("div", { class: "column-filter-values" }, children),
            build: () => {
                const selected = boxes.filter((item) => item.box.checked);

                if (selected.length === boxes.length) {
                    return null;
                }

                if (!selected.length) {
                    return { error: "Marque ao menos um valor." };
                }

                return createListFilter(attribute, selected.map((item) => item.option.value));
            }
        };
    };

    const booleanControl = (attribute, current) => {
        const name = `column-filter-${Math.random().toString(36).slice(2)}`;
        const choices = [
            { id: "", label: "Todos" },
            { id: "isTrue", label: "Sim" },
            { id: "isFalse", label: "Não" },
            { id: "empty", label: "Vazio" }
        ];
        const radios = choices.map((choice) => {
            const radio = el("input", {
                type: "radio",
                name,
                value: choice.id,
                checked: (current ? current.operator : "") === choice.id
            });

            return el("label", { class: "column-filter-option" }, [radio, el("span", { text: choice.label })]);
        });

        return {
            element: el("div", { class: "column-filter-list" }, radios),
            build: () => {
                const selected = radios.map((row) => row.querySelector("input")).find((radio) => radio.checked);

                return selected && selected.value ? createFilter(attribute, selected.value) : null;
            }
        };
    };

    const dateControl = (attribute, current) => {
        const from = el("input", { type: "date", "aria-label": "De" });
        const to = el("input", { type: "date", "aria-label": "Até" });

        if (current && current.operator === "between") {
            from.value = current.value;
            to.value = current.valueTo;
        } else if (current && current.operator === "gt") {
            from.value = current.value;
        } else if (current && current.operator === "lt") {
            to.value = current.value;
        }

        return {
            element: el("div", { class: "range-inputs" }, [
                el("label", { class: "range-input" }, [el("span", { class: "field-label", text: "De" }), from]),
                el("label", { class: "range-input" }, [el("span", { class: "field-label", text: "Até" }), to])
            ]),
            build: () => {
                if (from.value && to.value) {
                    return createFilter(attribute, "between", from.value, to.value);
                }

                if (from.value) {
                    return createFilter(attribute, "gt", from.value);
                }

                if (to.value) {
                    return createFilter(attribute, "lt", to.value);
                }

                return null;
            }
        };
    };

    const textControl = (attribute, current) => {
        const input = el("input", {
            type: "text",
            class: "column-filter-text",
            placeholder: "Contém…",
            "aria-label": `${attribute.name} contém`,
            value: current && current.operator === "contains" ? current.value : ""
        });

        return {
            element: input,
            build: () => (input.value.trim() ? createFilter(attribute, "contains", input.value) : null)
        };
    };


    /* ---------------- painel ---------------- */

    const open = (button, attribute) => {
        const layer = store.getActiveLayer();

        if (!layer || layer.status !== "ready") {
            return;
        }

        if (popover && anchor === button) {
            close();
            return;
        }

        close();
        anchor = button;

        /* Filtro atual do campo (o último, se houver mais de um vindo do painel Filtros). */
        const current = layer.filters.filter((filter) => filter.field === attribute.name).pop() || null;
        const kind = kindOf(attribute);
        const control = {
            range: rangeControl,
            list: listControl,
            boolean: booleanControl,
            date: dateControl,
            text: textControl
        }[kind](attribute, current, layer);

        const error = el("p", { class: "field-error", hidden: true });

        const apply = () => {
            const result = control.build();

            if (result && result.error) {
                error.textContent = result.error;
                error.hidden = false;
                return;
            }

            store.setFieldFilter(layer.id, attribute.name, result);
            close({ returnFocus: true });
        };

        const hasFilter = layer.filters.some((filter) => filter.field === attribute.name);

        popover = el("div", {
            class: "column-filter",
            role: "dialog",
            "aria-label": `Filtrar ${attribute.name}`
        }, [
            el("p", { class: "column-filter-title", text: attribute.name }),
            control.element,
            error,
            el("div", { class: "column-filter-actions" }, [
                el("button", {
                    type: "button",
                    class: "button button-ghost",
                    text: "Limpar",
                    disabled: !hasFilter,
                    onclick: () => {
                        store.setFieldFilter(layer.id, attribute.name, null);
                        close({ returnFocus: true });
                    }
                }),
                el("button", { type: "button", class: "button", text: "Aplicar", onclick: apply })
            ])
        ]);

        popover.style.width = `${WIDTH}px`;
        popover.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && event.target.tagName === "INPUT" && event.target.type !== "checkbox") {
                event.preventDefault();
                apply();
            }
        });

        /*
           Em tela cheia só o elemento em tela cheia (o mapa) é exibido:
           o painel entra nele; fora disso, no <body>.
        */
        (document.fullscreenElement || document.webkitFullscreenElement || document.body).appendChild(popover);
        place();

        const first = popover.querySelector("input, button");

        if (first) {
            first.focus();
        }
    };

    return { open, close };
}
