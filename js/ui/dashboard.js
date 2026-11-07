/* ============================================================
   DASHBOARD — resumo e tabela da camada ativa

   Opera sobre o conjunto "considerado": features que passam nos
   filtros e, havendo busca, que casam com ela. Os indicadores
   vêm dos papéis do schema:
   - "Agrupar por": só atributos do tipo categoria (top 10);
   - "Métrica": qualquer atributo numérico (inteiro ou decimal);
   - "Operador": contagem, soma, média, mínimo ou máximo;
   - lista (à esquerda) com valor e participação % de cada grupo;
   - "Gráfico" (à direita): o mesmo resultado em barras, colunas,
     barra segmentada ou rosca (ui/charts.js).

   Só renderiza com o painel aberto; mudanças com ele fechado
   marcam o conteúdo como desatualizado.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, formatNumber, formatValue } from "./format.js";
import { GROUP_OPERATORS, columnOperatorsFor, columnSummary, groupBy } from "../data/stats.js";
import { createColumnFilter } from "./column-filter.js";
import { CHART_TYPES, PART_LIMIT, renderChart } from "./charts.js";
import { isCategory, isMetric, isNumeric } from "../data/schema.js";
import { getAttribute, isEmpty, toNumber } from "../data/values.js";
import { describeFilter } from "../data/filters.js";
import { downloadText, safeFileName, toCsv } from "../data/csv.js";
import { toKml } from "../data/kml-export.js";
import { EMPTY_COLOR } from "../data/theme.js";
import { TABLE_PAGE_SIZE } from "../config.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/*
   Ícone de filtro do cabeçalho: três traços que encurtam (padrão
   de "filtrar lista"). Diferente do funil triangular, não se
   confunde com as setas ▲▼ da ordenação.
*/
const funnelIcon = () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const path = document.createElementNS(SVG_NS, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", "M4 6.5h16M7 12h10M10 17.5h4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2.4");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);

    return svg;
};

export function createDashboard(store, { isOpen, onRowSelect }) {
    const context = byId("dashboard-context");
    const chartType = byId("chart-type");
    const chartArea = byId("chart-area");
    const chartNote = byId("chart-note");
    const groupField = byId("group-field");
    const groupMeasure = byId("group-measure");
    const groupMeasureField = byId("group-measure-field");
    const groupOperator = byId("group-operator");
    const groupCard = byId("group-card");
    const groupBars = byId("group-bars");
    const tableHead = byId("table-head");
    const tableBody = byId("table-body");
    const tableFoot = byId("table-foot");
    const columnFilter = createColumnFilter(store);
    const tableEmpty = byId("table-empty");
    const pagerText = byId("table-page-text");
    const pagerPrev = byId("table-prev");
    const pagerNext = byId("table-next");
    const exportCsvButton = byId("export-csv");
    const exportKmlButton = byId("export-kml");
    const tabs = Array.from(document.querySelectorAll("#dashboard [role='tab']"));

    let dirty = true;
    /* A tabela é a visão padrão ao abrir o dashboard; o HTML já nasce nela. */
    let activeTab = "table";
    let sort = { field: null, direction: 1 };
    let page = 0;
    let sortedCache = null;
    /* Operador do rodapé por camada e coluna ("camada::campo" → id); padrão por tipo. */
    const totals = new Map();

    const ready = (layer) => Boolean(layer && layer.status === "ready");
    const columnsOf = (layer) => layer.schema.attributes.filter((attribute) => attribute.role !== "empty");
    const consideredFeatures = (layer) => layer.view.considered.map((uid) => layer.features[uid]);


    /* ---------------- contexto ---------------- */

    const renderContext = (layer) => {
        if (!ready(layer)) {
            context.textContent = layer && layer.status === "error"
                ? `Erro: ${layer.error}`
                : "Aguardando dados…";
            return;
        }

        const parts = [
            `${formatCount(layer.view.considered.length)} de ${formatCount(layer.features.length)} feições`
        ];

        if (layer.filters.length) {
            parts.push(layer.filters.map(describeFilter).join(" · "));
        }

        if (layer.search.term) {
            parts.push(`busca: “${layer.search.term}”`);
        }

        context.textContent = parts.join(" — ");
    };


    /* ---------------- resumo ---------------- */

    const fillSelect = (select, options, fallback) => {
        const previous = select.value;

        select.replaceChildren(...options.map(([value, label]) => el("option", { value, text: label })));

        if (options.some(([value]) => value === previous)) {
            select.value = previous;
        } else if (fallback !== undefined) {
            select.value = fallback;
        }
    };

    const renderGroups = (layer, features) => {
        const groupable = layer.schema.attributes.filter(isCategory);
        const numeric = layer.schema.attributes.filter(isMetric);

        groupCard.hidden = !groupable.length;

        if (!groupable.length) {
            chartArea.replaceChildren(el("p", {
                class: "group-empty",
                text: "Esta camada não tem atributos do tipo categoria para agrupar."
            }));
            return;
        }

        /*
           Controles: Agrupar por (categoria), Operador (contagem,
           soma, média, mín., máx.) e Métrica (atributo numérico).
           Contagem não usa métrica; sem atributo numérico só há contagem.
        */
        fillSelect(groupField, groupable.map((attribute) => [attribute.name, attribute.name]), groupable[0].name);
        fillSelect(groupMeasure, numeric.map((attribute) => [attribute.name, attribute.name]), numeric.length ? numeric[0].name : undefined);

        const operators = numeric.length
            ? GROUP_OPERATORS
            : GROUP_OPERATORS.filter((operator) => !operator.needsMetric);

        fillSelect(groupOperator, operators.map((operator) => [operator.id, operator.label]), "count");

        const operator = GROUP_OPERATORS.find((item) => item.id === groupOperator.value) || GROUP_OPERATORS[0];

        groupMeasure.disabled = !operator.needsMetric || !numeric.length;
        groupMeasureField.classList.toggle("is-disabled", groupMeasure.disabled);

        const attribute = groupable.find((item) => item.name === groupField.value);
        const metric = operator.needsMetric ? numeric.find((item) => item.name === groupMeasure.value) || null : null;
        const result = groupBy(features, attribute, metric, operator.id, 10);

        const formatResult = (value) => {
            if (value === null) {
                return "—";
            }

            if (operator.id === "count") {
                return formatCount(value);
            }

            return metric && metric.role === "integer" && operator.id !== "mean"
                ? formatValue(value, metric)
                : formatNumber(value);
        };

        renderGroupList(result, attribute, operator, formatResult);
        renderChartView(features, attribute, metric, operator, result, formatResult);
    };


    /*
       Lista do agrupamento: barra proporcional ao maior grupo e
       participação % só para operadores aditivos (contagem, soma).
    */
    const renderGroupList = (result, attribute, operator, formatResult) => {
        const values = result.rows.map((row) => row.value).concat(result.others ? [result.others.value] : []);
        const max = Math.max(0, ...values.filter((value) => value !== null));
        const showShare = Boolean(operator.additive && result.total);

        const bar = (label, value, muted) => {
            const fill = el("span", { class: "group-bar-fill" });
            const share = showShare && value !== null ? ` · ${formatNumber((value / result.total) * 100, 1)}%` : "";

            fill.style.width = `${max && value !== null ? Math.max(2, (value / max) * 100) : 0}%`;

            return el("li", { class: `group-row${muted ? " is-muted" : ""}` }, [
                el("span", { class: "group-label", text: label, title: label }),
                el("span", { class: "group-bar" }, fill),
                el("span", { class: "group-value", text: `${formatResult(value)}${share}` })
            ]);
        };

        const rows = result.rows.map((row) =>
            bar(row.key === null ? "(vazio)" : formatValue(row.key, attribute), row.value, row.key === null)
        );

        if (result.others) {
            rows.push(bar(`Outros (${formatCount(result.others.groups)})`, result.others.value, true));
        }

        if (!rows.length) {
            rows.push(el("li", { class: "group-empty", text: "Nenhuma feição no conjunto atual." }));
        }

        groupBars.replaceChildren(...rows);
    };


    /*
       Gráfico do mesmo agrupamento. Participação (segmentada, rosca)
       só vale para operadores aditivos (contagem, soma) e mostra os
       PART_LIMIT maiores grupos + "Outros"; com média/mín./máx. esses
       tipos ficam desabilitados e o gráfico volta para barras.
    */
    const renderChartView = (features, attribute, metric, operator, result, formatResult) => {
        const additive = Boolean(operator.additive);

        fillSelect(chartType, CHART_TYPES.map((type) => [type.id, type.label]), "bars");

        Array.from(chartType.options).forEach((option) => {
            const type = CHART_TYPES.find((item) => item.id === option.value);

            option.disabled = Boolean(type && type.partToWhole && !additive);
        });

        let type = CHART_TYPES.find((item) => item.id === chartType.value) || CHART_TYPES[0];

        if (type.partToWhole && !additive) {
            type = CHART_TYPES[0];
            chartType.value = type.id;
        }

        chartNote.hidden = additive;
        chartNote.textContent = additive ? "" : "Segmentada e rosca: só com Contagem ou Soma.";

        const source = type.partToWhole
            ? groupBy(features, attribute, metric, operator.id, PART_LIMIT)
            : result;

        const items = source.rows.map((row) => ({
            label: row.key === null ? "(vazio)" : formatValue(row.key, attribute),
            value: row.value,
            valueText: formatResult(row.value),
            muted: row.key === null
        }));

        if (source.others) {
            items.push({
                label: `Outros (${formatCount(source.others.groups)})`,
                value: source.others.value,
                valueText: formatResult(source.others.value),
                muted: true
            });
        }

        chartArea.replaceChildren(renderChart(type.id, items, {
            centerText: source.total !== null ? formatResult(source.total) : ""
        }));
    };


    /* ---------------- tabela ---------------- */

    const compare = (attribute) => {
        const numeric = isNumeric(attribute);

        return (a, b) => {
            const left = getAttribute(a.feature, attribute.name);
            const right = getAttribute(b.feature, attribute.name);

            /* Vazios sempre no fim, independente da direção. */
            if (isEmpty(left) || isEmpty(right)) {
                return isEmpty(left) === isEmpty(right) ? 0 : isEmpty(left) ? 1 : -1;
            }

            const order = numeric
                ? toNumber(left) - toNumber(right)
                : String(left).localeCompare(String(right), "pt-BR", { numeric: true, sensitivity: "base" });

            return order * sort.direction;
        };
    };

    const sortedRows = (layer) => {
        if (sortedCache) {
            return sortedCache;
        }

        const rows = layer.view.considered.map((uid) => ({ uid, feature: layer.features[uid] }));
        const attribute = layer.schema.attributes.find((item) => item.name === sort.field);

        if (attribute) {
            rows.sort(compare(attribute));
        }

        sortedCache = rows;

        return rows;
    };

    const renderTable = (layer) => {
        const columns = columnsOf(layer);
        const rows = sortedRows(layer);
        const pages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));

        page = Math.min(page, pages - 1);

        const filteredFields = new Set(layer.filters.map((filter) => filter.field));

        /* Cabeçalho: nome ordena; funil abre o filtro da coluna (destacado se houver filtro nela). */
        tableHead.replaceChildren(el("tr", {}, columns.map((attribute) => {
            const active = sort.field === attribute.name;
            const direction = active ? (sort.direction === 1 ? "ascending" : "descending") : "none";
            const filtered = filteredFields.has(attribute.name);

            return el("th", { scope: "col", "aria-sort": direction }, el("div", { class: "table-head-cell" }, [
                el("button", {
                    type: "button",
                    class: "table-sort",
                    text: attribute.name,
                    title: "Ordenar",
                    onclick: () => {
                        sort = active
                            ? { field: attribute.name, direction: -sort.direction }
                            : { field: attribute.name, direction: 1 };
                        sortedCache = null;
                        page = 0;
                        renderTable(layer);
                    }
                }),
                el("button", {
                    type: "button",
                    class: `table-filter${filtered ? " is-active" : ""}`,
                    title: filtered ? "Filtro ativo nesta coluna" : "Filtrar coluna",
                    "aria-label": filtered ? `Editar filtro de ${attribute.name}` : `Filtrar ${attribute.name}`,
                    "aria-haspopup": "dialog",
                    onclick: (event) => columnFilter.open(event.currentTarget, attribute)
                }, funnelIcon())
            ]));
        })));

        const selection = store.state.selection;
        const start = page * TABLE_PAGE_SIZE;
        const slice = rows.slice(start, start + TABLE_PAGE_SIZE);

        tableBody.replaceChildren(...slice.map(({ uid, feature }) => {
            const selected = Boolean(selection && selection.layerId === layer.id && selection.uid === uid);

            return el("tr", {
                class: selected ? "is-selected" : null,
                tabindex: "0",
                "aria-selected": String(selected),
                dataset: { uid: String(uid) }
            }, columns.map((attribute) =>
                el("td", { text: formatValue(getAttribute(feature, attribute.name), attribute) })
            ));
        }));

        renderTotals(layer, columns, rows);

        tableEmpty.hidden = rows.length > 0;
        pagerText.textContent = rows.length
            ? `${formatCount(start + 1)}–${formatCount(start + slice.length)} de ${formatCount(rows.length)}`
            : "0 de 0";
        pagerPrev.disabled = page === 0;
        pagerNext.disabled = page >= pages - 1;
    };

    /* Padrão: decimais somam; inteiros (costumam ser códigos) e textos começam vazios. */
    const totalOperatorOf = (layer, attribute) => {
        const key = `${layer.id}::${attribute.name}`;

        if (!totals.has(key)) {
            totals.set(key, attribute.role === "measure" ? "sum" : "none");
        }

        return totals.get(key);
    };

    const formatTotal = (value, operator) => {
        if (value === null) {
            return "—";
        }

        return operator === "count" || operator === "distinct" ? formatCount(value) : formatNumber(value);
    };

    /*
       Rodapé fixo: um operador por coluna, calculado sobre todo o
       conjunto considerado (filtros + busca), não só a página.
    */
    const renderTotals = (layer, columns, rows) => {
        const features = rows.map((row) => row.feature);

        tableFoot.replaceChildren(el("tr", {
            title: `Totais de ${formatCount(features.length)} feições (filtros e busca aplicados)`
        }, columns.map((attribute) => {
            const numeric = isNumeric(attribute);
            const operator = totalOperatorOf(layer, attribute);
            const select = el("select", {
                class: "table-total-operator",
                "aria-label": `Total da coluna ${attribute.name}`,
                onchange: (event) => {
                    totals.set(`${layer.id}::${attribute.name}`, event.target.value);
                    renderTotals(layer, columns, rows);
                }
            }, columnOperatorsFor(numeric).map((item) => el("option", { value: item.id, text: item.label })));

            select.value = operator;

            const value = operator === "none" ? null : columnSummary(features, attribute, operator);

            return el("td", { class: operator === "none" ? "is-unset" : null }, el("div", { class: "table-total" }, [
                select,
                operator === "none" ? null : el("span", { class: "table-total-value", text: formatTotal(value, operator) })
            ]));
        })));
    };

    const activateRow = (row) => {
        const layer = store.getActiveLayer();

        if (row && layer) {
            onRowSelect(layer.id, Number(row.dataset.uid));
        }
    };

    tableBody.addEventListener("click", (event) => activateRow(event.target.closest("tr[data-uid]")));

    tableBody.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateRow(event.target.closest("tr[data-uid]"));
        }
    });

    pagerPrev.addEventListener("click", () => {
        page = Math.max(0, page - 1);
        render();
    });

    pagerNext.addEventListener("click", () => {
        page += 1;
        render();
    });


    /* ---------------- abas e exportação ---------------- */

    const selectTab = (name) => {
        activeTab = name;

        tabs.forEach((tab) => {
            const selected = tab.dataset.tab === name;

            tab.setAttribute("aria-selected", String(selected));
            tab.tabIndex = selected ? 0 : -1;
            byId(tab.getAttribute("aria-controls")).hidden = !selected;
        });

        render();
    };

    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => selectTab(tab.dataset.tab));
        tab.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                return;
            }

            const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];

            next.focus();
            selectTab(next.dataset.tab);
        });
    });

    [groupField, groupMeasure, groupOperator, chartType].forEach((select) => select.addEventListener("change", () => render()));

    /* Filtro ou busca ativos: o arquivo leva "filtrado" no nome. */
    const exportSuffix = (layer) => (layer.filters.length || layer.search.term ? "filtrado" : "completo");

    /*
       CSV = a tabela como está: só o conjunto considerado (filtros e
       busca), na ordem atual da tabela. Sem filtro nem busca, o
       conjunto é a camada inteira.
    */
    const exportCsv = () => {
        const layer = store.getActiveLayer();

        if (!ready(layer)) {
            return;
        }

        const features = sortedRows(layer).map((row) => row.feature);

        downloadText(toCsv(features, columnsOf(layer)), `${safeFileName(layer.name)}_${exportSuffix(layer)}.csv`);
        store.setStatus(`CSV exportado: ${formatCount(features.length)} feições`);
    };

    /*
       KML = o mapa como está: mesmas feições do CSV, com as cores do
       tema (uma pasta por categoria, na ordem da legenda) ou a cor da
       camada; o atributo dos rótulos vira o nome de cada feição.
    */
    const exportKml = () => {
        const layer = store.getActiveLayer();

        if (!ready(layer)) {
            return;
        }

        const uids = sortedRows(layer).map((row) => row.uid);
        const theme = layer.theme.visible && layer.theme.legend ? layer.theme.legend : null;
        const item = (uid) => ({ feature: layer.features[uid], color: theme ? theme.colors[uid] : layer.color });
        let groups;

        if (theme) {
            const field = theme.field;
            const byKey = new Map(theme.classes.map((entry) => [entry.key, []]));
            const empties = [];

            uids.forEach((uid) => {
                const value = getAttribute(layer.features[uid], field);
                const bucket = isEmpty(value) ? empties : byKey.get(String(value));

                (bucket || empties).push(item(uid));
            });

            groups = theme.classes
                .map((entry) => ({ name: `${field}: ${entry.key}`, items: byKey.get(entry.key) }))
                .filter((group) => group.items.length);

            if (empties.length) {
                groups.push({ name: `${field}: (vazio)`, items: empties.map((entry) => ({ ...entry, color: EMPTY_COLOR })) });
            }
        } else {
            groups = [{ name: layer.name, items: uids.map(item) }];
        }

        const kml = toKml({
            documentName: layer.name,
            groups,
            attributes: columnsOf(layer),
            nameFields: layer.labels.visible ? layer.labels.fields : [],
            outline: layer.style === "outline",
            themed: Boolean(theme)
        });

        downloadText(kml, `${safeFileName(layer.name)}_${exportSuffix(layer)}.kml`, "application/vnd.google-earth.kml+xml");
        store.setStatus(`KML exportado: ${formatCount(uids.length)} feições`);
    };

    exportCsvButton.addEventListener("click", exportCsv);
    exportKmlButton.addEventListener("click", exportKml);


    /* ---------------- ciclo de render ---------------- */

    const render = () => {
        const layer = store.getActiveLayer();

        renderContext(layer);

        const usable = ready(layer);

        exportCsvButton.disabled = !usable || !layer.view.considered.length;
        exportKmlButton.disabled = !usable || !layer.view.considered.length;

        if (!usable) {
            chartArea.replaceChildren();
            groupBars.replaceChildren();
            tableHead.replaceChildren();
            tableBody.replaceChildren();
            tableFoot.replaceChildren();
            tableEmpty.hidden = false;
            dirty = false;
            return;
        }

        if (activeTab === "summary") {
            const features = consideredFeatures(layer);

            renderGroups(layer, features);
        } else {
            renderTable(layer);
        }

        dirty = false;
    };

    const invalidate = () => {
        sortedCache = null;
        dirty = true;

        if (isOpen()) {
            render();
        }
    };

    store.on("view", (layer) => {
        if (layer.id === store.state.activeLayerId) {
            page = 0;
            invalidate();
        }
    });

    store.on("active", () => {
        sort = { field: null, direction: 1 };
        page = 0;
        invalidate();
    });

    store.on("selection", () => {
        if (isOpen() && activeTab === "table") {
            render();
        } else {
            /* Destaque da linha fica desatualizado até a próxima abertura. */
            dirty = true;
        }
    });

    return {
        onOpen: () => {
            if (dirty) {
                render();
            }
        },
        /* Mostra a feature na tabela, trocando para a aba Tabela se preciso. */
        showRow: (layerId, uid) => {
            if (activeTab !== "table") {
                selectTab("table");
            }

            revealRow(layerId, uid);
        },
        revealRow
    };

    /* Leva a tabela até a página que contém a feature. */
    function revealRow(layerId, uid) {
        const layer = store.getActiveLayer();

        if (!layer || layer.id !== layerId || activeTab !== "table") {
            return;
        }

        const index = sortedRows(layer).findIndex((row) => row.uid === uid);

        if (index !== -1) {
            page = Math.floor(index / TABLE_PAGE_SIZE);
            render();

            const row = tableBody.querySelector(`tr[data-uid="${uid}"]`);

            if (row) {
                row.scrollIntoView({ block: "nearest" });
            }
        }
    }
}
