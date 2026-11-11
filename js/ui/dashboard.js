/* ============================================================
   DASHBOARD — resumo e tabela da camada ativa

   Opera sobre o conjunto "considerado": features que passam nos
   filtros e, havendo busca, que casam com ela. Os indicadores
   vêm dos papéis do schema:
   - "Agrupar por": só atributos do tipo categoria (top 10);
   - "Métrica": qualquer atributo numérico (inteiro ou decimal);
   - "Operador": contagem, soma, média, mínimo ou máximo;
   - "+ Agrupador": subagrupa cada grupo por outra categoria (ex.:
     área por setor, separada por variedade); a lista mostra as
     partes de cada grupo e o gráfico empilha (ou põe lado a lado);
   - lista (à esquerda) com valor e participação % de cada grupo;
   - "Gráfico" (à direita): o mesmo resultado em barras, colunas,
     barra segmentada ou rosca (ui/charts.js);
   - os controles de agrupamento ficam numa barra acima dos dois
     cards; cada card tem título (gerado do agrupamento) e a sua
     exportação: CSV dos grupos e PNG do gráfico.

   Só renderiza com o painel aberto; mudanças com ele fechado
   marcam o conteúdo como desatualizado.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, formatNumber, formatValue, themeClassLabel } from "./format.js";
import { GROUP_OPERATORS, columnOperatorsFor, columnSummary, crossTab, groupBy } from "../data/stats.js";
import { createColumnFilter } from "./column-filter.js";
import { CHART_TYPES, PART_LIMIT, renderChart, renderSubgroupChart, seriesColors } from "./charts.js";
import { isCategory, isMetric, isNumeric } from "../data/schema.js";
import { getAttribute, isEmpty, toNumber } from "../data/values.js";
import { describeFilters } from "../data/filters.js";
import { resolveSymbol } from "../data/symbol.js";
import { downloadText, rowsToCsv, safeFileName, toCsv } from "../data/csv.js";
import { toKml } from "../data/kml-export.js";
import { EMPTY_COLOR } from "../data/theme.js";
import { TABLE_PAGE_SIZE } from "../config.js";
import { exportCardPng } from "./export-png.js";
import { layerPendingState, skeletonLine } from "./skeleton.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/* Grupos por página no Resumo: mais com o painel maximizado. */
const GROUP_PAGE_SIZE = 10;
const GROUP_PAGE_SIZE_MAXIMIZED = 25;

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

export function createDashboard(store, { isOpen, onRowSelect, onRowsSelect, onTabChange }) {
    const context = byId("dashboard-context");
    const chartType = byId("chart-type");
    const chartArea = byId("chart-area");
    const chartCard = byId("chart-card");
    const chartTitle = byId("chart-title");
    const chartSubtitle = byId("chart-subtitle");
    const summaryToolbar = byId("summary-toolbar");
    const groupTitle = byId("group-title");
    const groupSubtitle = byId("group-subtitle");
    const groupField = byId("group-field");
    const groupMeasure = byId("group-measure");
    const summaryKpis = byId("summary-kpis");
    const groupMeasureField = byId("group-measure-field");
    const groupOperator = byId("group-operator");
    const subRow = byId("group-sub");
    const subAdd = byId("group-sub-add");
    const subRemove = byId("group-sub-remove");
    const subField = byId("group-sub-field");
    const groupCard = byId("group-card");
    const groupBars = byId("group-bars");
    const groupTotal = byId("group-total");
    const chartTotal = byId("chart-total");
    const tableHead = byId("table-head");
    const tableBody = byId("table-body");
    const tableFoot = byId("table-foot");
    const columnFilter = createColumnFilter(store);
    const tableEmpty = byId("table-empty");
    const pagerText = byId("table-page-text");
    const pagerPrev = byId("table-prev");
    const pagerNext = byId("table-next");
    const exportCsvButton = byId("export-csv");
    const exportSummaryCsvButton = byId("export-summary-csv");
    const exportChartPngButton = byId("export-chart-png");
    const groupPager = byId("group-pager");
    const groupPagerText = byId("group-page-text");
    const groupPrev = byId("group-prev");
    const groupNext = byId("group-next");
    const tabs = Array.from(document.querySelectorAll("#dashboard [role='tab']"));

    let dirty = true;
    /* A tabela é a visão padrão ao abrir o dashboard; o HTML já nasce nela. */
    let activeTab = "table";
    /* Tipo pedido pelo painel Gráficos antes de o seletor existir (1ª abertura do Resumo). */
    let pendingChartType = null;
    let sort = { field: null, direction: 1 };
    let page = 0;
    let sortedCache = null;
    /* Subagrupamento do Resumo ligado? (o select guarda o atributo) */
    let subEnabled = false;
    /* O que o Resumo mostra agora (exportações); null sem agrupamento. */
    let summaryInfo = null;
    /* Página da lista do Resumo e "Outros" (de subgrupo) abertos, por grupo. */
    let groupPage = 0;
    let groupPageSize = GROUP_PAGE_SIZE;
    const expandedOthers = new Set();

    const isMaximized = () => document.documentElement.classList.contains("dashboard-maximized");

    /* Qualquer mudança no que é agrupado volta à 1ª página e fecha os "Outros". */
    const resetGroups = () => {
        groupPage = 0;
        expandedOthers.clear();
    };
    /* "Soma de Área (ha.)", "Contagem de feições": a medida nos títulos e no CSV. */
    const measureLabel = (operator, metric) =>
        (operator.needsMetric && metric ? `${operator.label} de ${metric.name}` : "Contagem de feições");

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
        const selection = store.state.selection;

        if (selection && selection.layerId === layer.id && selection.uids.length > 1) {
            parts.push(selection.parts
                ? `1 seleção em ${formatCount(selection.uids.length)} partes`
                : `${formatCount(selection.uids.length)} selecionadas`);
        }

        if (layer.filters.length) {
            parts.push(describeFilters(layer.filters, layer.filterMode));
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

    /*
       Indicadores (KPIs) do conjunto considerado, no topo do Resumo:
       feições, soma e média de uma medida e quantidade de grupos.
       A medida é a do Operador quando ele usa uma; senão, o 1º número
       decimal da camada (inteiros costumam ser códigos: somá-los não
       tem sentido). Com filtro ou busca, cada número mostra também a
       fração do total da camada.
    */
    const renderKpis = (layer, features, { metric = null, groupAttribute = null, groupCount = null } = {}) => {
        const total = layer.features.length;
        const partial = features.length !== total;
        const share = (part, whole) => whole ? `${formatNumber((part / whole) * 100, 1)}% do total` : null;


        const tile = (label, value, caption) => el("div", { class: "kpi" }, [
            el("dt", { class: "kpi-label", text: label, title: label }),
            el("dd", { class: "kpi-value", text: value }),
            caption ? el("dd", { class: "kpi-caption", text: caption }) : null
        ]);

        const tiles = [
            tile("Feições", formatCount(features.length), partial ? share(features.length, total) : null)
        ];

        const measure = metric || layer.schema.attributes.find((attribute) => attribute.role === "measure") || null;

        if (measure) {
            const sum = columnSummary(features, measure, "sum");
            const mean = columnSummary(features, measure, "mean");
            const layerSum = partial ? columnSummary(layer.features, measure, "sum") : null;

            tiles.push(
                tile(`Soma de ${measure.name}`, formatNumber(sum), partial && layerSum ? share(sum || 0, layerSum) : null),
                tile(`Média de ${measure.name}`, formatNumber(mean), null)
            );
        }

        if (groupAttribute && groupCount !== null) {
            tiles.push(tile(`Valores de ${groupAttribute.name}`, formatCount(groupCount), null));
        }

        summaryKpis.replaceChildren(...tiles);
    };

    const renderGroups = (layer, features) => {
        const groupable = layer.schema.attributes.filter(isCategory);
        const numeric = layer.schema.attributes.filter(isMetric);

        groupCard.hidden = !groupable.length;
        summaryToolbar.hidden = !groupable.length;

        if (!groupable.length) {
            summaryInfo = null;
            groupPager.hidden = true;
            chartTitle.textContent = "Resumo indisponível";
            chartSubtitle.textContent = "";
            renderTotal(chartTotal, null);
            chartArea.replaceChildren(el("p", {
                class: "group-empty",
                text: "Esta camada não tem atributos do tipo categoria para agrupar."
            }));
            renderKpis(layer, features);
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

        fillSelect(groupOperator, operators.map((operator) => [operator.id, operator.label]), numeric.length ? "sum" : "count");

        const operator = GROUP_OPERATORS.find((item) => item.id === groupOperator.value) || GROUP_OPERATORS[0];

        groupMeasure.disabled = !operator.needsMetric || !numeric.length;
        groupMeasureField.classList.toggle("is-disabled", groupMeasure.disabled);

        const attribute = groupable.find((item) => item.name === groupField.value);
        const metric = operator.needsMetric ? numeric.find((item) => item.name === groupMeasure.value) || null : null;
        const subAttribute = renderSubControls(groupable, attribute);

        /*
           Lista e barras/colunas são paginadas (sem "Outros"): todos os
           grupos ficam acessíveis, como na tabela.
        */
        groupPageSize = isMaximized() ? GROUP_PAGE_SIZE_MAXIMIZED : GROUP_PAGE_SIZE;

        const compute = () => {
            const paging = { paged: true, offset: groupPage * groupPageSize };

            return subAttribute
                ? crossTab(features, attribute, subAttribute, metric, operator.id, groupPageSize, PART_LIMIT, paging)
                : groupBy(features, attribute, metric, operator.id, groupPageSize, paging);
        };

        let result = compute();
        const lastPage = Math.max(0, Math.ceil(result.groupCount / groupPageSize) - 1);

        /* Menos grupos que antes (filtro novo, página maior): volta para a última página válida. */
        if (groupPage > lastPage) {
            groupPage = lastPage;
            result = compute();
        }

        renderGroupPager(result);

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

        const series = subAttribute ? seriesOf(result, subAttribute, formatResult) : null;

        summaryInfo = { attribute, metric, operator, subAttribute };

        renderKpis(layer, features, { metric, groupAttribute: attribute, groupCount: result.groupCount });

        /*
           Título do card dos dados: o que foi calculado e por quê
           (ex.: "Soma de Área (ha.) por Setor e Variedade").
        */
        groupTitle.textContent = `${measureLabel(operator, metric)} por ${subAttribute ? `${attribute.name} e ${subAttribute.name}` : attribute.name}`;
        groupSubtitle.textContent = [
            `${formatCount(result.groupCount)} ${result.groupCount === 1 ? "grupo" : "grupos"}`,
            subAttribute ? `cada um separado por ${subAttribute.name}` : null,
            result.groupCount > 1 ? "do maior para o menor" : null
        ].filter(Boolean).join(" · ");
        exportSummaryCsvButton.disabled = !result.rows.length;

        renderGroupList(result, attribute, operator, formatResult, series);
        renderChartView(features, attribute, metric, operator, result, formatResult, series);
    };

    const renderGroupPager = (result) => {
        const pages = Math.ceil(result.groupCount / groupPageSize);

        groupPager.hidden = pages <= 1;
        groupPagerText.textContent = `${formatCount(result.offset + 1)}–${formatCount(result.offset + result.rows.length)} de ${formatCount(result.groupCount)} grupos`;
        groupPrev.disabled = groupPage === 0;
        groupNext.disabled = groupPage >= pages - 1;
    };

    /*
       Controles do subagrupamento: qualquer outra categoria que não a
       do "Agrupar por". Sem uma segunda categoria, o botão some.
       Retorna o atributo escolhido, ou null quando desligado.
    */
    const renderSubControls = (groupable, attribute) => {
        const options = groupable.filter((item) => item.name !== attribute.name);
        const active = subEnabled && options.length > 0;

        subAdd.hidden = subEnabled || !options.length;
        subRow.hidden = !active;

        if (!active) {
            return null;
        }

        fillSelect(subField, options.map((item) => [item.name, item.name]), options[0].name);

        return options.find((item) => item.name === subField.value) || options[0];
    };

    /* Séries do subagrupamento (rótulo, cor, cinza para "Outros"/vazio). */
    const seriesOf = (result, subAttribute, formatResult) => {
        const series = result.series.map((item) => ({
            label: item.isOthers
                ? `Outros (${formatCount(item.groups)})`
                : item.key === null ? "(vazio)" : formatValue(item.key, subAttribute),
            muted: item.isOthers || item.key === null,
            isOthers: item.isOthers,
            empty: !item.isOthers && item.key === null,
            valueText: formatResult(item.value),
            /* Para listar o que há dentro de "Outros" em cada grupo. */
            formatKey: (key) => (key === null ? "(vazio)" : formatValue(key, subAttribute))
        }));
        const colors = seriesColors(series);

        return series.map((item, index) => ({ ...item, color: colors[index] }));
    };


    /* Rótulo da linha de total conforme o operador, com o nº de grupos. */
    const TOTAL_LABELS = { count: "Total", sum: "Total", mean: "Média geral", min: "Mínimo geral", max: "Máximo geral" };

    const totalLabel = (operator, groupCount) =>
        `${TOTAL_LABELS[operator.id] || "Total"} (${formatCount(groupCount)} ${groupCount === 1 ? "grupo" : "grupos"})`;

    /* Rodapé de total de um card (null esconde). */
    const renderTotal = (node, total) => {
        node.hidden = !total;
        node.replaceChildren(...(total ? [
            el("span", { class: "summary-total-label", text: total.label }),
            el("span", { class: "summary-total-value", text: total.value })
        ] : []));
    };


    /*
       Lista do agrupamento: barra proporcional ao maior grupo e
       participação % só para operadores aditivos (contagem, soma).
    */
    const renderGroupList = (result, attribute, operator, formatResult, series) => {
        const values = result.rows.map((row) => row.value).concat(result.others ? [result.others.value] : []);
        const max = Math.max(0, ...values.filter((value) => value !== null));
        const showShare = Boolean(operator.additive && result.total);

        /* `only`: série única do grupo (com subgrupo), mostrada ao lado do nome. */
        const bar = (label, value, muted, only = null) => {
            const fill = el("span", { class: "group-bar-fill" });
            const share = showShare && value !== null ? ` · ${formatNumber((value / result.total) * 100, 1)}%` : "";
            let tag = null;

            fill.style.width = `${max && value !== null ? Math.max(2, (value / max) * 100) : 0}%`;

            if (only) {
                const swatch = el("span", { class: "group-swatch", "aria-hidden": "true" });

                swatch.style.background = only.color;
                tag = el("span", { class: "group-only-part" }, [swatch, only.label]);
            }

            return el("li", { class: `group-row${muted ? " is-muted" : ""}` }, [
                el("span", { class: "group-label", title: only ? `${label} · ${only.label}` : label }, [label, tag]),
                el("span", { class: "group-bar" }, fill),
                el("span", { class: "group-value", text: `${formatResult(value)}${share}` })
            ]);
        };

        /*
           Partes do grupo (com subgrupo). Contagem/soma: barra e % são
           a fatia dentro do grupo. Média/mín./máx.: barra na mesma
           escala dos grupos, sem %.
        */
        const partMax = series
            ? Math.max(max, ...result.rows.concat(result.others ? [result.others] : [])
                .flatMap((row) => row.parts.filter((part) => part !== null)))
            : max;

        const subRows = (row) => (series ? row.parts.flatMap((part, index) => {
            if (part === null) {
                return [];
            }

            const serie = series[index];
            const fill = el("span", { class: "group-bar-fill" });
            const swatch = el("span", { class: "group-swatch", "aria-hidden": "true" });
            const ratio = operator.additive
                ? (row.value ? part / row.value : 0)
                : (partMax ? part / partMax : 0);
            const share = operator.additive && row.value ? ` · ${formatNumber(ratio * 100, 1)}%` : "";

            fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
            fill.style.background = serie.color;
            swatch.style.background = serie.color;

            /*
               "Outros" conta só os subgrupos presentes neste grupo (não o
               total do conjunto) e a dica lista os maiores deles.
            */
            let label = serie.label;
            let title = `${serie.label}: ${formatResult(part)}${share}`;

            if (!(serie.isOthers && row.othersDetail)) {
                return [el("li", { class: "group-row group-subrow", title }, [
                    el("span", { class: "group-label" }, [swatch, el("span", { text: label })]),
                    el("span", { class: "group-bar" }, fill),
                    el("span", { class: "group-value", text: `${formatResult(part)}${share}` })
                ])];
            }

            /*
               "Outros" do subgrupo: clique (ou Enter) abre os subgrupos
               reunidos nele, só os presentes neste grupo, do maior para
               o menor. O gráfico continua com as cores de sempre.
            */
            const inside = row.othersDetail;
            const expandKey = row.key === null ? "\u0000" : row.key;
            const open = expandedOthers.has(expandKey);

            label = `Outros (${formatCount(inside.length)})`;

            const head = el("li", {
                class: "group-row group-subrow is-expandable",
                tabindex: "0",
                role: "button",
                "aria-expanded": String(open),
                title: open ? "Recolher" : `Mostrar os ${formatCount(inside.length)} itens agrupados em Outros`,
                dataset: { expand: expandKey }
            }, [
                el("span", { class: "group-label" }, [
                    swatch,
                    el("span", { text: label }),
                    el("span", { class: "group-expand-icon", "aria-hidden": "true", text: open ? "▾" : "▸" })
                ]),
                el("span", { class: "group-bar" }, fill),
                el("span", { class: "group-value", text: `${formatResult(part)}${share}` })
            ]);

            if (!open) {
                return [head];
            }

            return [head, ...inside.map((item) => {
                const itemFill = el("span", { class: "group-bar-fill" });
                const itemRatio = operator.additive
                    ? (row.value ? item.value / row.value : 0)
                    : (partMax ? item.value / partMax : 0);
                const itemShare = operator.additive && row.value ? ` · ${formatNumber(itemRatio * 100, 1)}%` : "";
                const name = serie.formatKey(item.key);

                itemFill.style.width = `${Math.max(0, Math.min(1, itemRatio)) * 100}%`;
                itemFill.style.background = serie.color;

                return el("li", { class: "group-row group-subrow group-subrow-detail", title: `${name}: ${formatResult(item.value)}${itemShare}` }, [
                    el("span", { class: "group-label" }, el("span", { text: name })),
                    el("span", { class: "group-bar" }, itemFill),
                    el("span", { class: "group-value", text: `${formatResult(item.value)}${itemShare}` })
                ]);
            })];
        }) : []);

        /* Grupo e suas partes; com uma parte só, ela vira etiqueta (a sub-linha repetiria o grupo a 100%). */
        const block = (label, row, muted) => {
            const present = series ? row.parts.map((part, index) => (part === null ? -1 : index)).filter((index) => index !== -1) : [];

            return present.length === 1
                ? [bar(label, row.value, muted, series[present[0]])]
                : [bar(label, row.value, muted), ...subRows(row)];
        };

        const rows = result.rows.flatMap((row) =>
            block(row.key === null ? "(vazio)" : formatValue(row.key, attribute), row, row.key === null)
        );

        if (result.others) {
            rows.push(...block(`Outros (${formatCount(result.others.groups)})`, result.others, true));
        }

        groupBars.classList.toggle("has-sub", Boolean(series));

        if (!rows.length) {
            rows.push(el("li", { class: "group-empty", text: "Nenhuma feição no conjunto atual." }));
        }

        renderTotal(groupTotal, rows.length && result.rows.length ? {
            label: totalLabel(operator, result.groupCount),
            value: `${formatResult(result.overall)}${showShare ? " · 100%" : ""}`
        } : null);

        groupBars.replaceChildren(...rows);
    };


    /*
       Gráfico do mesmo agrupamento. Participação (segmentada, rosca)
       só vale para operadores aditivos (contagem, soma) e mostra os
       PART_LIMIT maiores grupos + "Outros"; com média/mín./máx. esses
       tipos ficam desabilitados e o gráfico volta para barras.
    */
    const renderChartView = (features, attribute, metric, operator, result, formatResult, series) => {
        const additive = Boolean(operator.additive);

        /*
           Com subgrupo, a rosca não se aplica (seriam várias); a
           segmentada vira composição 100% de cada grupo.
        */
        const unavailable = (type) => Boolean(type && ((type.partToWhole && !additive) || (series && type.id === "donut")));

        fillSelect(chartType, CHART_TYPES.map((type) => [type.id, type.label]), pendingChartType || "bars");
        pendingChartType = null;

        /* Opção indisponível diz o porquê no próprio nome (dica em option desabilitada não aparece). */
        Array.from(chartType.options).forEach((option) => {
            const item = CHART_TYPES.find((entry) => entry.id === option.value);

            option.disabled = unavailable(item);

            if (option.disabled) {
                option.textContent = `${item.label} (${item.partToWhole && !additive ? "só Contagem ou Soma" : "só sem subgrupo"})`;
            }
        });

        let type = CHART_TYPES.find((item) => item.id === chartType.value) || CHART_TYPES[0];

        if (unavailable(type)) {
            type = CHART_TYPES[0];
            chartType.value = type.id;
        }

        /*
           Título do gráfico conforme o tipo e o agrupamento; o
           subtítulo explica a leitura (empilhado, 100%, lado a lado,
           5 maiores) e diz a página, quando há mais de uma.
        */
        const measure = measureLabel(operator, metric);
        const subAttribute = summaryInfo && summaryInfo.subAttribute;
        const shape = type.id === "columns" ? "Colunas" : "Barras";
        const pageText = groupPager.hidden ? null : `grupos ${groupPagerText.textContent.replace(/ grupos$/, "")}`;
        const setTitles = (title, ...details) => {
            chartTitle.textContent = title;
            chartSubtitle.textContent = details.filter(Boolean).join(" · ");
        };

        if (series) {
            const group = (label, row, muted) => ({
                label,
                muted,
                valueText: formatResult(row.value),
                parts: row.parts.map((value, index) => ({
                    value,
                    valueText: formatResult(value),
                    /* "Outros" com a contagem deste grupo, não a do conjunto. */
                    label: series[index].isOthers && row.othersDetail ? `Outros (${formatCount(row.othersDetail.length)})` : null
                }))
            });
            const groups = result.rows.map((row) =>
                group(row.key === null ? "(vazio)" : formatValue(row.key, attribute), row, row.key === null)
            );

            if (result.others) {
                groups.push(group(`Outros (${formatCount(result.others.groups)})`, result.others, true));
            }

            const mode = type.id === "segmented" ? "normalized" : additive ? "stacked" : "grouped";

            if (mode === "normalized") {
                setTitles(`Composição de cada ${attribute.name} por ${subAttribute.name}`, `${measure} · 100% por grupo`, pageText);
            } else if (mode === "stacked") {
                setTitles(`${measure} por ${attribute.name} e ${subAttribute.name}`, `${shape} empilhadas por ${subAttribute.name}`, pageText);
            } else {
                setTitles(`${measure} por ${attribute.name} e ${subAttribute.name}`,
                    `${shape} lado a lado por ${subAttribute.name} (${operator.label.toLowerCase()} não se soma)`, pageText);
            }

            chartArea.replaceChildren(renderSubgroupChart(type.id === "columns" ? "columns" : "bars", groups, series, mode));

            renderTotal(chartTotal, groups.length ? {
                label: totalLabel(operator, result.groupCount),
                value: `${formatResult(result.overall)}${additive ? " · 100%" : ""}`
            } : null);
            return;
        }

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

        if (type.partToWhole) {
            setTitles(`Participação de cada ${attribute.name}`, measure,
                source.others ? `${PART_LIMIT} maiores + Outros` : null);
        } else {
            setTitles(`${measure} por ${attribute.name}`, shape, pageText);
        }

        chartArea.replaceChildren(renderChart(type.id, items, {
            centerText: source.total !== null ? formatResult(source.total) : ""
        }));

        renderTotal(chartTotal, items.length ? {
            label: totalLabel(operator, source.groupCount),
            value: `${formatResult(source.overall)}${additive ? " · 100%" : ""}`
        } : null);
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
        const selectedSet = new Set(selection && selection.layerId === layer.id ? selection.uids : []);
        const start = page * TABLE_PAGE_SIZE;
        const slice = rows.slice(start, start + TABLE_PAGE_SIZE);

        tableBody.replaceChildren(...slice.map(({ uid, feature }) => {
            const selected = selectedSet.has(uid);

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

    /* Seleção feita na própria tabela: a linha já está à vista, não salta para o topo. */
    let selectingFromTable = false;
    /* Âncora do Shift: a última linha clicada sem Shift. */
    let anchorUid = null;

    /*
       Clique simples: seleciona só a linha.
       Ctrl (ou ⌘): acrescenta ou retira a linha da seleção.
       Shift: seleciona o intervalo da âncora até a linha, na ordem
       atual da tabela (com Ctrl+Shift, soma o intervalo ao que já
       estava selecionado).
    */
    const activateRow = (row, event = {}) => {
        const layer = store.getActiveLayer();

        if (!row || !layer) {
            return;
        }

        const uid = Number(row.dataset.uid);
        const toggle = Boolean(event.ctrlKey || event.metaKey);
        const range = Boolean(event.shiftKey);
        const selection = store.state.selection;
        const current = selection && selection.layerId === layer.id ? selection.uids : [];

        selectingFromTable = true;

        if (range && anchorUid !== null) {
            const order = sortedRows(layer).map((item) => item.uid);
            const from = order.indexOf(anchorUid);
            const to = order.indexOf(uid);

            if (from !== -1 && to !== -1) {
                const span = order.slice(Math.min(from, to), Math.max(from, to) + 1);

                onRowsSelect(layer.id, toggle ? [...current, ...span] : span, uid);
            } else {
                anchorUid = uid;
                onRowSelect(layer.id, uid);
            }
        } else if (toggle) {
            anchorUid = uid;
            onRowsSelect(layer.id, current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid], uid);
        } else {
            anchorUid = uid;
            onRowSelect(layer.id, uid);
        }

        selectingFromTable = false;
    };

    tableBody.addEventListener("click", (event) => activateRow(event.target.closest("tr[data-uid]"), event));

    /* Shift+clique não deve selecionar o texto das células. */
    tableBody.addEventListener("mousedown", (event) => {
        if (event.shiftKey) {
            event.preventDefault();
        }
    });

    tableBody.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateRow(event.target.closest("tr[data-uid]"), event);
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

        /* A barra esquerda destaca Tabela ou Gráficos conforme a aba. */
        if (onTabChange) {
            onTabChange(name);
        }
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

    [groupField, groupMeasure, groupOperator, subField].forEach((select) => select.addEventListener("change", () => {
        resetGroups();
        render();
    }));

    chartType.addEventListener("change", () => render());

    groupPrev.addEventListener("click", () => {
        groupPage = Math.max(0, groupPage - 1);
        render();
    });

    groupNext.addEventListener("click", () => {
        groupPage += 1;
        render();
    });

    /* Abre/fecha um "Outros" de subgrupo (delegado: as linhas são recriadas a cada render). */
    const toggleOthers = (target) => {
        const row = target.closest("[data-expand]");

        if (!row) {
            return false;
        }

        const key = row.dataset.expand;

        if (expandedOthers.has(key)) {
            expandedOthers.delete(key);
        } else {
            expandedOthers.add(key);
        }

        render();

        const again = groupBars.querySelector(`[data-expand="${CSS.escape(key)}"]`);

        if (again) {
            again.focus();
        }

        return true;
    };

    groupBars.addEventListener("click", (event) => toggleOthers(event.target));
    groupBars.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-expand]")) {
            event.preventDefault();
            toggleOthers(event.target);
        }
    });

    subAdd.addEventListener("click", () => {
        subEnabled = true;
        resetGroups();
        render();
        subField.focus();
    });

    subRemove.addEventListener("click", () => {
        subEnabled = false;
        resetGroups();
        render();
        subAdd.focus();
    });

    /* Filtro ou busca ativos: o arquivo leva "filtrado" no nome. */
    /*
       Nome do arquivo exportado: camada + valores filtrados, ex.
       "talhoes_40002-alto_rb867515.kml". Cada filtro contribui com
       seus valores ("é um de" até 3, depois "+N"; "entre" vira
       "a_b"); filtros sem valor (vazio, preenchido, sim/não) entram
       pelo nome do campo. A busca entra pelo termo. Sem filtro nem
       busca: "completo". Limitado para não estourar o nome do arquivo.
    */
    const MAX_NAME_PARTS_LENGTH = 80;

    const filterNamePart = (filter) => {
        if (filter.operator === "in") {
            const values = (filter.values || []).map((value) => (value === null ? "vazio" : value));
            const shown = values.slice(0, 3).join("-");

            return values.length > 3 ? `${shown}-mais${values.length - 3}` : shown;
        }

        if (filter.operator === "between") {
            return `${filter.value}_a_${filter.valueTo}`;
        }

        const prefix = { gt: "acima_", gte: "min_", lt: "abaixo_", lte: "max_", notEquals: "exceto_", notContains: "sem_" }[filter.operator] || "";

        const noValue = { empty: "vazio", notEmpty: "preenchido", isTrue: "sim", isFalse: "nao" }[filter.operator] || filter.operator;

        return filter.value ? `${prefix}${filter.value}` : `${filter.field}_${noValue}`;
    };

    const exportSuffix = (layer) => {
        const parts = [
            ...layer.filters.map(filterNamePart),
            ...(layer.search.term ? [layer.search.term] : [])
        ].map(safeFileName).filter((part) => part && part !== "camada");

        if (!parts.length) {
            return layer.filters.length || layer.search.term ? "filtrado" : "completo";
        }

        const joined = parts.join("_");

        return joined.length > MAX_NAME_PARTS_LENGTH
            ? joined.slice(0, MAX_NAME_PARTS_LENGTH).replace(/[_-]+$/, "")
            : joined;
    };

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
    /*
       Sem argumentos: a camada ativa como está (filtros, busca, ordem).
       Com { layerId, uids, fileLabel }: só essas feições (menu de
       contexto: "Exportar KML" de uma feição).
    */
    const exportKml = ({ layerId = null, uids: only = null, fileLabel = null } = {}) => {
        const layer = layerId ? store.getLayer(layerId) : store.getActiveLayer();

        if (!ready(layer)) {
            store.setStatus("KML: nenhuma camada pronta para exportar.");
            return;
        }

        if (!only && !layer.view.considered.length) {
            store.setStatus(`KML: nada para exportar em ${layer.name} (os filtros não deixaram feições).`);
            return;
        }

        const uids = only || sortedRows(layer).map((row) => row.uid);
        const theme = layer.theme.visible && layer.theme.legend ? layer.theme.legend : null;
        const item = (uid) => ({ feature: layer.features[uid], color: theme ? theme.colors[uid] : layer.color });
        let groups;

        if (theme) {
            /* Uma pasta por classe do tema (valor ou faixa), na ordem da legenda. */
            const field = theme.field;
            const attribute = layer.schema.attributes.find((entry) => entry.name === field);
            const buckets = theme.classes.map(() => []);
            const empties = [];
            const outside = [];

            uids.forEach((uid) => {
                const index = theme.classIndex[uid];

                (index >= 0 ? buckets[index] : index === -2 ? outside : empties).push(item(uid));
            });

            groups = theme.classes
                .map((entry, index) => ({ name: `${field}: ${themeClassLabel(entry, attribute)}`, items: buckets[index] }))
                .filter((group) => group.items.length);

            if (outside.length) {
                groups.push({ name: `${field}: (fora das classes)`, items: outside });
            }

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
            outline: !resolveSymbol(layer).fill,
            themed: Boolean(theme),
            formatValue,
            exportedAt: new Date().toLocaleDateString("pt-BR")
        });

        const suffix = only ? safeFileName(fileLabel || "feicao") : exportSuffix(layer);

        downloadText(kml, `${safeFileName(layer.name)}_${suffix}.kml`, "application/vnd.google-earth.kml+xml");
        store.setStatus(`KML exportado: ${layer.name}, ${formatCount(uids.length)} feições`);
    };

    exportCsvButton.addEventListener("click", exportCsv);

    /* Nome dos arquivos do Resumo: camada, tipo, agrupamento e filtros. */
    const summaryFileName = (layer, kind, extension) => {
        const { attribute, subAttribute } = summaryInfo;

        return `${[layer.name, kind, attribute.name, subAttribute && subAttribute.name, exportSuffix(layer)]
            .filter(Boolean)
            .map(safeFileName)
            .join("_")}.${extension}`;
    };

    /* Resumo pronto para exportar (renderiza se estava desatualizado). */
    const summaryLayer = () => {
        const layer = store.getActiveLayer();

        if (!ready(layer)) {
            return null;
        }

        if (dirty) {
            render();
        }

        if (!summaryInfo || groupCard.hidden) {
            store.setStatus("Nada para exportar: a camada não tem categorias para agrupar.");
            return null;
        }

        return layer;
    };

    /* Números do CSV sem resíduo de ponto flutuante (241.07000000000002 → 241.07). */
    const csvNumber = (value) => (value === null || value === undefined ? null : Math.round(value * 1e6) / 1e6);
    const csvKey = (key) => (key === null ? "(vazio)" : key);

    /*
       CSV dos dados agrupados: todos os grupos (não só a página).
       Sem subgrupo: grupo, valor e % (contagem/soma). Com subgrupo:
       tabela cruzada, um subgrupo por coluna (todos, sem "Outros");
       em contagem/soma a célula sem feições vale 0. Última linha:
       o total (ou média/mín./máx. geral).
    */
    const exportSummaryCsv = () => {
        const layer = summaryLayer();

        if (!layer) {
            return;
        }

        const { attribute, metric, operator, subAttribute } = summaryInfo;
        const features = consideredFeatures(layer);
        const measure = measureLabel(operator, metric);
        const totalName = TOTAL_LABELS[operator.id] || "Total";
        let header;
        let rows;

        if (subAttribute) {
            const result = crossTab(features, attribute, subAttribute, metric, operator.id, Infinity, Infinity, { paged: true, offset: 0 });
            const cell = (value) => (value === null ? (operator.additive ? 0 : null) : csvNumber(value));

            header = [attribute.name, `${measure} (total)`, ...result.series.map((serie) => csvKey(serie.key))];
            rows = result.rows.map((row) => [csvKey(row.key), csvNumber(row.value), ...row.parts.map(cell)]);
            rows.push([totalName, csvNumber(result.overall), ...result.series.map((serie) => cell(serie.value))]);
        } else {
            const result = groupBy(features, attribute, metric, operator.id, Infinity, { paged: true, offset: 0 });
            const share = operator.additive && result.total;

            header = [attribute.name, measure, ...(share ? ["%"] : [])];
            rows = result.rows.map((row) => [
                csvKey(row.key),
                csvNumber(row.value),
                ...(share ? [Math.round((row.value / result.total) * 10000) / 100] : [])
            ]);
            rows.push([totalName, csvNumber(result.overall), ...(share ? [100] : [])]);
        }

        downloadText(rowsToCsv(header, rows), summaryFileName(layer, "resumo", "csv"));
        store.setStatus(`CSV do resumo exportado: ${formatCount(rows.length - 1)} grupos`);
    };

    /*
       PNG do gráfico: o card como está na tela (legenda, barras e
       total), com o título do card e, abaixo, camada e filtros.
    */
    const exportChartPng = async () => {
        const layer = summaryLayer();

        if (!layer) {
            return;
        }

        exportChartPngButton.disabled = true;
        store.setStatus("Gerando PNG…");

        try {
            await exportCardPng({
                card: chartCard,
                title: chartTitle.textContent,
                subtitle: chartSubtitle.textContent,
                meta: `${layer.name} — ${context.textContent}`,
                fileName: summaryFileName(layer, "grafico", "png")
            });
            store.setStatus("PNG exportado");
        } catch (error) {
            store.setStatus(`Erro ao exportar PNG: ${error.message}`);
        } finally {
            exportChartPngButton.disabled = false;
        }
    };

    exportSummaryCsvButton.addEventListener("click", exportSummaryCsv);
    exportChartPngButton.addEventListener("click", exportChartPng);


    /* ---------------- ciclo de render ---------------- */

    const render = () => {
        const layer = store.getActiveLayer();

        renderContext(layer);

        const usable = ready(layer);

        exportCsvButton.disabled = !usable || !layer.view.considered.length;
        exportSummaryCsvButton.disabled = !usable || !layer.view.considered.length;
        exportChartPngButton.disabled = !usable || !layer.view.considered.length;

        if (!usable) {
            const loading = Boolean(layer && layer.status === "loading");
            const pending = layerPendingState(layer);

            groupBars.replaceChildren();
            tableHead.replaceChildren();
            tableFoot.replaceChildren();

            /* Carregando: linhas-esqueleto na tabela; falha: a mensagem no lugar do vazio. */
            tableBody.replaceChildren(...(loading
                ? Array.from({ length: 8 }, () => el("tr", { class: "skeleton-row", "aria-hidden": "true" },
                    ["60%", "80%", "45%", "70%"].map((width) => el("td", {}, skeletonLine(width)))))
                : []));
            tableEmpty.replaceChildren(loading ? `Carregando ${layer.name}…` : pending || "Nenhuma feição no conjunto atual.");
            tableEmpty.hidden = false;
            chartArea.replaceChildren(pending || "");
            dirty = false;
            return;
        }

        tableEmpty.textContent = "Nenhuma feição no conjunto atual.";

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
            resetGroups();
            invalidate();
        }
    });

    /*
       Seletor da camada analisada: lista todas as camadas, na ordem do
       painel, com a quantidade de feições. Trocar aqui = clicar no
       nome da camada no painel (store.setActiveLayer); e vice-versa.
       Camadas ainda carregando ou com erro aparecem desabilitadas.
    */
    const layerSelect = byId("dashboard-layer");

    const renderLayerSelect = () => {
        const layers = store.state.layers;

        layerSelect.replaceChildren(...layers.map((layer) => el("option", {
            value: layer.id,
            disabled: !ready(layer),
            text: ready(layer)
                ? `${layer.name} (${formatCount(layer.features.length)})`
                : `${layer.name} (${layer.status === "error" ? "erro" : "carregando…"})`
        })));

        layerSelect.value = store.state.activeLayerId || "";
        layerSelect.disabled = !layers.length;
    };

    layerSelect.addEventListener("change", () => store.setActiveLayer(layerSelect.value));

    store.on("layers", renderLayerSelect);

    /* A camada ativa terminou de carregar (ou falhou): sai o esqueleto. */
    store.on("layers", () => {
        const layer = store.getActiveLayer();

        if (layer && layer.status !== "loading" && tableBody.querySelector(".skeleton-row")) {
            invalidate();
        }
    });
    renderLayerSelect();

    store.on("active", () => {
        renderLayerSelect();
        sort = { field: null, direction: 1 };
        page = 0;
        resetGroups();
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
        /* Ferramentas › Exportar KML (barra superior). */
        exportKml,
        /* Barra esquerda: Tabela de atributos (table) e Gráficos (summary). */
        selectTab: (name) => {
            if (name !== activeTab) {
                selectTab(name);
            }
        },
        getTab: () => activeTab,
        /* Painel Gráficos: escolhe o tipo (barras, rosca…) do gráfico do Resumo. */
        setChartType: (id) => {
            if (!CHART_TYPES.some((type) => type.id === id)) {
                return;
            }

            if (Array.from(chartType.options).some((option) => option.value === id)) {
                chartType.value = id;
            } else {
                pendingChartType = id;
            }

            render();
        },
        getChartType: () => chartType.value || pendingChartType || "bars",
        onOpen: () => {
            if (dirty) {
                render();
            }
        },
        /* Maximizar/restaurar muda os grupos por página do Resumo. */
        onLayoutChange: () => {
            const size = isMaximized() ? GROUP_PAGE_SIZE_MAXIMIZED : GROUP_PAGE_SIZE;

            if (size !== groupPageSize && activeTab === "summary" && isOpen()) {
                /* Mantém à vista o primeiro grupo que estava na tela. */
                groupPage = Math.floor((groupPage * groupPageSize) / size);
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

            if (!row) {
                return;
            }

            if (selectingFromTable) {
                row.scrollIntoView({ block: "nearest" });
                return;
            }

            /*
               Seleção vinda do mapa (ou da busca): a linha vai para o topo
               da tabela, logo abaixo do cabeçalho fixo, sem rolar o resto
               da página.
            */
            const scroller = row.closest(".table-scroll");

            if (scroller) {
                const header = tableHead.getBoundingClientRect().height;
                const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

                scroller.scrollTop += offset - header;
            }
        }
    }
}
