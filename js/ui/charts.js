/* ============================================================
   GRÁFICOS DO DASHBOARD

   Renderizadores leves (HTML/SVG, sem biblioteca) para o
   resultado do agrupamento. Todos recebem a mesma entrada:

     items: [{ label, value, valueText, muted }]
       muted = "Outros" ou "(vazio)": desenhados em cinza.

   Tipos:
   - bars      barras horizontais ordenadas (padrão; comparação)
   - columns   colunas verticais
   - segmented barra segmentada (participação; ≤ 6 partes)
   - donut     rosca (participação; ≤ 6 partes)

   Barras e colunas: uma cor só (uma métrica). Participação:
   paleta categórica em ordem fixa (--chart-1…--chart-5) + cinza
   para "Outros", com legenda. Texto sempre nas cores de texto.
   Cada marca tem dica (title) com nome e valor.
   ============================================================ */

import { el } from "./dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export const CHART_TYPES = [
    { id: "bars", label: "Barras", partToWhole: false },
    { id: "columns", label: "Colunas", partToWhole: false },
    { id: "segmented", label: "Barra segmentada", partToWhole: true },
    { id: "donut", label: "Rosca", partToWhole: true }
];

/* Partes máximas nos gráficos de participação (o resto vira "Outros"). */
export const PART_LIMIT = 5;

const svg = (tag, attributes = {}) => {
    const node = document.createElementNS(SVG_NS, tag);

    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));

    return node;
};

const tooltip = (item) => `${item.label}: ${item.valueText}`;

const sliceColor = (item, index) =>
    item.muted ? "var(--chart-muted)" : `var(--chart-${(index % PART_LIMIT) + 1})`;


/* ---------------- barras horizontais ---------------- */

function bars(items) {
    const max = Math.max(0, ...items.map((item) => item.value || 0));

    return el("ol", { class: "chart-bars" }, items.map((item) => {
        const fill = el("span", { class: "chart-bar-fill" });

        fill.style.width = `${max > 0 && item.value > 0 ? Math.max(1.5, (item.value / max) * 100) : 0}%`;

        return el("li", { class: `chart-bar-row${item.muted ? " is-muted" : ""}`, title: tooltip(item) }, [
            el("span", { class: "chart-label", text: item.label }),
            el("span", { class: "chart-bar-track" }, fill),
            el("span", { class: "chart-value", text: item.valueText })
        ]);
    }));
}


/* ---------------- colunas ---------------- */

function columns(items) {
    const max = Math.max(0, ...items.map((item) => item.value || 0));

    return el("div", { class: "chart-columns" }, items.map((item) => {
        const fill = el("span", { class: "chart-column-fill" });

        fill.style.height = `${max > 0 && item.value > 0 ? Math.max(1.5, (item.value / max) * 100) : 0}%`;

        return el("div", { class: `chart-column${item.muted ? " is-muted" : ""}`, title: tooltip(item) }, [
            el("span", { class: "chart-value", text: item.valueText }),
            el("span", { class: "chart-column-track" }, fill),
            el("span", { class: "chart-label", text: item.label })
        ]);
    }));
}


/* ---------------- participação: legenda comum ---------------- */

function legend(items, total) {
    return el("ul", { class: "chart-legend" }, items.map((item, index) => {
        const swatch = el("span", { class: "chart-swatch", "aria-hidden": "true" });

        swatch.style.background = sliceColor(item, index);

        const share = total > 0 ? ((item.value || 0) / total) * 100 : 0;

        return el("li", { class: "chart-legend-item", title: tooltip(item) }, [
            swatch,
            el("span", { class: "chart-label", text: item.label }),
            el("span", {
                class: "chart-value",
                text: `${item.valueText} · ${share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
            })
        ]);
    }));
}

const totalOf = (items) => items.reduce((sum, item) => sum + Math.max(0, item.value || 0), 0);


/* ---------------- barra segmentada ---------------- */

function segmented(items) {
    const total = totalOf(items);

    const bar = el("div", { class: "chart-segmented" }, items.map((item, index) => {
        const share = total > 0 ? Math.max(0, item.value || 0) / total : 0;
        const segment = el("span", { class: `chart-segment${item.muted ? " is-muted" : ""}`, title: tooltip(item) });

        segment.style.flexGrow = String(share);
        segment.style.background = sliceColor(item, index);

        /* Percentual impresso só onde cabe. */
        if (share >= 0.08) {
            segment.textContent = `${Math.round(share * 100)}%`;
        }

        return segment;
    }));

    return el("div", { class: "chart-part" }, [bar, legend(items, total)]);
}


/* ---------------- rosca ---------------- */

function donut(items, centerText) {
    const total = totalOf(items);
    const size = 160;
    const radius = 62;
    const stroke = 26;
    const circumference = 2 * Math.PI * radius;
    const gap = items.length > 1 ? 2 : 0;

    const chart = svg("svg", { viewBox: `0 0 ${size} ${size}`, class: "chart-donut", role: "img" });

    chart.appendChild(svg("title")).textContent = items.map(tooltip).join("; ");

    chart.appendChild(svg("circle", {
        cx: size / 2, cy: size / 2, r: radius, fill: "none",
        stroke: "var(--fill-segment)", "stroke-width": stroke
    }));

    let offset = 0;

    items.forEach((item, index) => {
        const length = total > 0 ? (Math.max(0, item.value || 0) / total) * circumference : 0;

        if (length <= 0) {
            return;
        }

        const arc = svg("circle", {
            cx: size / 2,
            cy: size / 2,
            r: radius,
            fill: "none",
            stroke: sliceColor(item, index),
            "stroke-width": stroke,
            "stroke-dasharray": `${Math.max(0, length - gap)} ${circumference}`,
            "stroke-dashoffset": String(-offset),
            transform: `rotate(-90 ${size / 2} ${size / 2})`
        });

        arc.appendChild(svg("title")).textContent = tooltip(item);
        chart.appendChild(arc);
        offset += length;
    });

    const label = svg("text", {
        x: size / 2, y: size / 2, "text-anchor": "middle", "dominant-baseline": "central",
        class: "chart-donut-total"
    });

    label.textContent = centerText;
    chart.appendChild(label);

    return el("div", { class: "chart-part chart-part-donut" }, [chart, legend(items, total)]);
}


/* ============================================================
   COM SUBGRUPO (agrupamento cruzado)

     groups: [{ label, muted, valueText, parts: [{ value, valueText }] }]
     series: [{ label, muted, valueText }]   (parts alinhado a series)

   - stacked: partes empilhadas, comprimento total = soma do grupo
     (contagem e soma);
   - normalized: cada grupo vira 100% e as partes, sua composição;
   - grouped: uma barra fina por série, lado a lado (média, mín.,
     máx., que não se somam).
   ============================================================ */

/*
   Fundo de "(vazio)": cinza listrado, para não se confundir com o
   cinza liso de "Outros" (padrão comum para "sem dado").
*/
/*
   Listras com um linear-gradient comum repetido pelo tamanho do fundo
   (o repeating-linear-gradient não sai na exportação PNG).
*/
export const EMPTY_FILL = "linear-gradient(135deg, var(--chart-muted) 25%, transparent 25%, transparent 50%, var(--chart-muted) 50%, var(--chart-muted) 75%, transparent 75%) 0 0 / 6px 6px";

/* Cor de cada série: paleta em ordem, pulando as neutras (vazio listrado, Outros cinza). */
export const seriesColors = (series) => {
    let index = 0;

    return series.map((item) => {
        if (item.empty) {
            return EMPTY_FILL;
        }

        return item.muted ? "var(--chart-muted)" : `var(--chart-${(index++ % PART_LIMIT) + 1})`;
    });
};

const partTip = (group, serie, part) => `${group.label} · ${part.label || serie.label}: ${part.valueText}`;

function seriesLegend(series, colors) {
    return el("ul", { class: "chart-series-legend" }, series.map((serie, index) => {
        const swatch = el("span", { class: "chart-swatch", "aria-hidden": "true" });

        swatch.style.background = colors[index];

        return el("li", { title: `${serie.label}: ${serie.valueText}` }, [swatch, el("span", { text: serie.label })]);
    }));
}

/* Segmentos (ou barras finas) de um grupo; `axis` = "width" (barras) ou "height" (colunas). */
function groupMarks(group, series, colors, mode, scale, axis) {
    const total = group.parts.reduce((sum, part) => sum + Math.max(0, part.value || 0), 0);

    return group.parts.map((part, index) => {
        if (part.value === null || part.value <= 0) {
            return null;
        }

        const serie = series[index];
        const mark = el("span", {
            class: `chart-stack-part${serie.muted || serie.empty ? " is-muted" : ""}`,
            title: partTip(group, serie, part)
        });
        const ratio = mode === "normalized"
            ? (total > 0 ? part.value / total : 0)
            : (scale > 0 ? part.value / scale : 0);

        mark.style.background = colors[index];
        mark.style[axis] = `${ratio * 100}%`;

        /* Sem percentual sobre as listras de "(vazio)": nenhuma cor de texto lê bem ali (a dica mostra o valor). */
        if (mode === "normalized" && ratio >= 0.12 && !serie.empty) {
            mark.textContent = `${Math.round(ratio * 100)}%`;
        }

        return mark;
    });
}

export function renderSubgroupChart(type, groups, series, mode) {
    if (!groups.length) {
        return el("p", { class: "group-empty", text: "Nenhuma feição no conjunto atual." });
    }

    const colors = seriesColors(series);
    const values = mode === "grouped"
        ? groups.flatMap((group) => group.parts.map((part) => part.value || 0))
        : groups.map((group) => group.parts.reduce((sum, part) => sum + Math.max(0, part.value || 0), 0));
    const scale = Math.max(0, ...values);
    const vertical = type === "columns";
    const axis = vertical ? "height" : "width";

    const body = vertical
        ? el("div", { class: `chart-columns chart-stack-columns is-${mode}` }, groups.map((group) =>
            el("div", { class: `chart-column${group.muted ? " is-muted" : ""}` }, [
                el("span", { class: "chart-value", text: group.valueText }),
                el("span", { class: "chart-column-track" },
                    el("span", { class: "chart-stack" }, groupMarks(group, series, colors, mode, scale, axis))),
                el("span", { class: "chart-label", text: group.label, title: group.label })
            ])))
        : el("ol", { class: `chart-bars chart-stack-bars is-${mode}` }, groups.map((group) =>
            el("li", { class: `chart-bar-row${group.muted ? " is-muted" : ""}` }, [
                el("span", { class: "chart-label", text: group.label, title: group.label }),
                el("span", { class: "chart-bar-track" },
                    el("span", { class: "chart-stack" }, groupMarks(group, series, colors, mode, scale, axis))),
                el("span", { class: "chart-value", text: mode === "normalized" ? "100%" : group.valueText })
            ])));

    return el("div", { class: "chart-part" }, [seriesLegend(series, colors), body]);
}


/* Desenha o gráfico escolhido; `centerText` é o total exibido no centro da rosca. */
export function renderChart(type, items, { centerText = "" } = {}) {
    if (!items.length) {
        return el("p", { class: "group-empty", text: "Nenhuma feição no conjunto atual." });
    }

    switch (type) {
        case "columns":
            return columns(items);
        case "segmented":
            return segmented(items);
        case "donut":
            return donut(items, centerText);
        default:
            return bars(items);
    }
}
