/* ============================================================
   PAINEL DE FILTROS

   Construído a partir do schema da camada ativa.

   - Atributos numéricos: controle de intervalo com dois
     marcadores, limitado ao mínimo e máximo reais da coluna. O
     usuário arrasta ou digita "De" e "Até"; marcadores juntos
     significam "igual a".
   - Demais tipos: condição + valor; categorias ganham sugestões
     (datalist) com os valores existentes.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, formatValue, roleLabel } from "./format.js";
import { createFilter, describeFilter, findOperator, operatorsFor } from "../data/filters.js";
import { getAttribute, toNumber } from "../data/values.js";

const INPUT_TYPE = { number: "number", date: "date" };

const usesRange = (attribute) =>
    Boolean(attribute && attribute.type === "number" && attribute.range);

export function createFilterPanel(store) {
    const form = byId("filter-form");
    const fieldSelect = byId("filter-field");
    const operatorField = byId("filter-operator-field");
    const operatorSelect = byId("filter-operator");
    const valueRow = byId("filter-value-row");
    const valueInput = byId("filter-value");
    const valueToInput = byId("filter-value-to");
    const rangeSeparator = byId("filter-range-separator");
    const datalist = byId("filter-suggestions");
    const errorText = byId("filter-error");
    const list = byId("filter-list");
    const clearButton = byId("filter-clear");
    const summary = byId("filter-summary");
    const title = byId("filter-title");
    const submit = form.querySelector("button[type='submit']");

    const rangeBlock = byId("filter-range");
    const rangeSlider = byId("range-slider");
    const rangeMin = byId("range-min");
    const rangeMax = byId("range-max");
    const rangeMinInput = byId("range-min-input");
    const rangeMaxInput = byId("range-max-input");
    const rangeLimitMin = byId("range-limit-min");
    const rangeLimitMax = byId("range-limit-max");
    const rangeSummary = byId("range-summary");

    const currentAttribute = () => {
        const layer = store.getActiveLayer();

        return layer && layer.status === "ready"
            ? layer.schema.attributes.find((attribute) => attribute.name === fieldSelect.value) || null
            : null;
    };

    const showError = (message) => {
        errorText.textContent = message || "";
        errorText.hidden = !message;
    };


    /* ---------------- intervalo numérico ---------------- */

    let range = null;   // { min, max, decimals, step } do atributo atual
    let low = 0;
    let high = 0;

    const round = (value) => Number(Number(value).toFixed(range.decimals));
    const clamp = (value) => Math.min(range.max, Math.max(range.min, value));
    const percent = (value) => range.max === range.min ? 0 : ((value - range.min) / (range.max - range.min)) * 100;

    /* Quantas feições (dentre as que passam nos outros filtros) caem no intervalo. */
    const countInRange = (attribute) => {
        const layer = store.getActiveLayer();

        if (!layer) {
            return 0;
        }

        let count = 0;

        layer.view.filtered.forEach((uid) => {
            const value = toNumber(getAttribute(layer.features[uid], attribute.name));

            if (value !== null && value >= low && value <= high) {
                count++;
            }
        });

        return count;
    };

    const isFullRange = () => low <= range.min && high >= range.max;

    const renderRange = (attribute, { syncInputs = true } = {}) => {
        rangeMin.value = String(low);
        rangeMax.value = String(high);

        if (syncInputs) {
            rangeMinInput.value = String(low);
            rangeMaxInput.value = String(high);
        }

        rangeSlider.style.setProperty("--from", `${percent(low)}%`);
        rangeSlider.style.setProperty("--to", `${percent(high)}%`);

        /*
           Marcadores sobrepostos: o de cima recebe o arraste. Na
           metade direita o mínimo fica por cima (senão não sairia
           do máximo); na esquerda, o máximo.
        */
        rangeMin.style.zIndex = low > (range.min + range.max) / 2 ? "3" : "1";
        rangeMax.style.zIndex = "2";

        const format = (value) => formatValue(value, attribute);
        const count = formatCount(countInRange(attribute));

        if (range.min === range.max) {
            rangeSummary.textContent = `Todas as feições têm o valor ${format(range.min)}.`;
        } else if (isFullRange()) {
            rangeSummary.textContent = "Arraste os marcadores ou digite os valores.";
        } else if (low === high) {
            rangeSummary.textContent = `Exatamente ${format(low)} — ${count} feições`;
        } else {
            rangeSummary.textContent = `Entre ${format(low)} e ${format(high)} — ${count} feições`;
        }

        submit.disabled = range.min === range.max || isFullRange();
    };

    const setupRange = (attribute) => {
        range = attribute.range;
        low = range.min;
        high = range.max;

        [rangeMin, rangeMax, rangeMinInput, rangeMaxInput].forEach((input) => {
            input.min = String(range.min);
            input.max = String(range.max);
            input.step = String(range.step);
            input.disabled = range.min === range.max;
        });

        rangeLimitMin.textContent = `mín. ${formatValue(range.min, attribute)}`;
        rangeLimitMax.textContent = `máx. ${formatValue(range.max, attribute)}`;

        renderRange(attribute);
    };

    /* Arraste: um marcador não ultrapassa o outro (podem se encontrar). */
    const onSlide = (which) => {
        const attribute = currentAttribute();

        if (!usesRange(attribute)) {
            return;
        }

        const value = round(which === "min" ? rangeMin.value : rangeMax.value);

        if (which === "min") {
            low = Math.min(value, high);
        } else {
            high = Math.max(value, low);
        }

        showError(null);
        renderRange(attribute);
    };

    /* Digitação: valor fora da faixa é ajustado; o outro marcador é empurrado se preciso. */
    const onType = (which) => {
        const attribute = currentAttribute();

        if (!usesRange(attribute)) {
            return;
        }

        const input = which === "min" ? rangeMinInput : rangeMaxInput;
        const typed = toNumber(String(input.value).replace(",", "."));

        if (typed === null) {
            renderRange(attribute);
            return;
        }

        const value = round(clamp(typed));

        if (which === "min") {
            low = value;
            high = Math.max(high, value);
        } else {
            high = value;
            low = Math.min(low, value);
        }

        showError(null);
        renderRange(attribute);
    };

    rangeMin.addEventListener("input", () => onSlide("min"));
    rangeMax.addEventListener("input", () => onSlide("max"));

    [["min", rangeMinInput], ["max", rangeMaxInput]].forEach(([which, input]) => {
        input.addEventListener("change", () => onType(which));
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                /* Enter confirma o número digitado; um segundo Enter adiciona o filtro. */
                const before = `${low}|${high}`;

                onType(which);

                if (`${low}|${high}` !== before) {
                    event.preventDefault();
                }
            }
        });
    });


    /* ---------------- demais tipos ---------------- */

    const syncOperatorInputs = () => {
        const attribute = currentAttribute();
        const operator = attribute ? findOperator(attribute.type, operatorSelect.value) : null;
        const needsValue = Boolean(operator && operator.needsValue);
        const needsRange = Boolean(operator && operator.needsRange);
        const inputType = attribute ? INPUT_TYPE[attribute.type] || "text" : "text";

        valueInput.type = inputType;
        valueToInput.type = inputType;
        valueInput.hidden = !needsValue;
        valueToInput.hidden = !needsRange;
        rangeSeparator.hidden = !needsRange;
        valueInput.placeholder = needsRange ? "de" : "valor";
        valueToInput.placeholder = "até";
    };

    const syncField = () => {
        const attribute = currentAttribute();
        const numeric = usesRange(attribute);

        operatorField.hidden = numeric;
        valueRow.hidden = numeric;
        rangeBlock.hidden = !numeric;
        showError(null);

        if (numeric) {
            setupRange(attribute);
            return;
        }

        range = null;
        submit.disabled = !attribute;

        operatorSelect.replaceChildren(...(attribute ? operatorsFor(attribute.type) : []).map(
            (operator) => el("option", { value: operator.id, text: operator.label })
        ));

        datalist.replaceChildren(...(attribute ? attribute.values : []).map(
            (value) => el("option", { value })
        ));

        valueInput.value = "";
        valueToInput.value = "";
        syncOperatorInputs();
    };

    const renderFields = () => {
        const layer = store.getActiveLayer();
        const ready = Boolean(layer && layer.status === "ready");
        const previous = fieldSelect.value;
        const attributes = ready
            ? layer.schema.attributes.filter((attribute) => attribute.role !== "empty")
            : [];

        title.textContent = layer ? `Filtros — ${layer.name}` : "Filtros";

        fieldSelect.replaceChildren(...attributes.map((attribute) =>
            el("option", {
                value: attribute.name,
                text: `${attribute.name} (${roleLabel(attribute.role)})`
            })
        ));

        if (attributes.some((attribute) => attribute.name === previous)) {
            fieldSelect.value = previous;
        }

        [fieldSelect, operatorSelect, valueInput, valueToInput].forEach((control) => {
            control.disabled = !attributes.length;
        });

        syncField();
    };

    const renderFilters = () => {
        const layer = store.getActiveLayer();
        const filters = layer ? layer.filters : [];
        const ready = Boolean(layer && layer.status === "ready");

        list.replaceChildren(...filters.map((filter, index) =>
            el("li", { class: "filter-chip" }, [
                el("span", { class: "filter-chip-text", text: describeFilter(filter) }),
                el("button", {
                    type: "button",
                    class: "filter-chip-remove",
                    "aria-label": `Remover filtro ${describeFilter(filter)}`,
                    text: "×",
                    onclick: () => store.removeFilter(layer.id, index)
                })
            ])
        ));

        clearButton.hidden = !filters.length;

        summary.textContent = ready
            ? `${formatCount(layer.view.filtered.length)} de ${formatCount(layer.features.length)} feições`
            : "Nenhuma camada pronta.";

        document.querySelectorAll("[data-filter-count]").forEach((badge) => {
            badge.textContent = filters.length ? String(filters.length) : "";
            badge.hidden = !filters.length;
        });

        /* A contagem do intervalo depende dos outros filtros. */
        const attribute = currentAttribute();

        if (usesRange(attribute) && range) {
            renderRange(attribute, { syncInputs: false });
        }
    };

    fieldSelect.addEventListener("change", syncField);
    operatorSelect.addEventListener("change", syncOperatorInputs);

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const layer = store.getActiveLayer();
        const attribute = currentAttribute();

        if (!layer || !attribute) {
            return;
        }

        if (usesRange(attribute)) {
            if (isFullRange()) {
                showError("Ajuste os marcadores: o intervalo inteiro já inclui todos os valores.");
                return;
            }

            const filter = low === high
                ? createFilter(attribute, "equals", low)
                : createFilter(attribute, "between", low, high);

            store.addFilter(layer.id, filter);
            setupRange(attribute);
            return;
        }

        const filter = createFilter(attribute, operatorSelect.value, valueInput.value, valueToInput.value);

        if (!filter) {
            showError(attribute.type === "date" ? "Informe uma data válida." : "Informe um valor.");
            return;
        }

        showError(null);
        store.addFilter(layer.id, filter);
        valueInput.value = "";
        valueToInput.value = "";
        valueInput.focus();
    });

    clearButton.addEventListener("click", () => {
        const layer = store.getActiveLayer();

        if (layer) {
            store.clearFilters(layer.id);
        }
    });

    store.on("active", () => {
        renderFields();
        renderFilters();
    });

    store.on("view", (layer) => {
        if (layer.id === store.state.activeLayerId) {
            renderFilters();
        }
    });

    renderFields();
    renderFilters();
}
