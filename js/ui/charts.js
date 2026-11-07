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
        const segment = el("span", { class: "chart-segment", title: tooltip(item) });

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
