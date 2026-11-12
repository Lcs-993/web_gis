/* ============================================================
   POPUP DA FEIÇÃO (conteúdo do cartão, js/ui/feature-card.js)

   Montado a partir do schema da camada (nenhum atributo é
   conhecido de antemão), no desenho de um cartão de campo:

   1. Cabeçalho: "CAMADA · ATRIBUTO" em versalete (some com
      popup.kicker = false), o título da feição em destaque, um
      subtítulo logo abaixo (popup.subtitle: atributo, ex.: o
      talhão) e, se a camada pedir (popup.badge), um selo de estado
      ao lado. O título é o 1º atributo do rótulo da camada, se
      houver; senão, o 1º de texto/categoria preenchido.
   2. Abas: uma por seção; clicar rola até ela e a aba acompanha
      a rolagem (todas as seções ficam à vista, empilhadas).
   3. Seções, em três estilos:
      grid      rótulo sobre valor, em duas colunas;
      metrics   números num cartão, com a posição do valor na
                faixa da camada (mín. → máx.);
      timeline  datas numa linha do tempo, da mais recente.
      Sem popup.sections em config.js, as seções saem do tipo:
      Informações (texto/categoria), Medidas, Histórico (datas).
   4. Atributos sem valor, recolhidos numa linha.
   5. Ações (Aproximar, Ver na tabela) e, com popup.updated, a
      data dos dados no rodapé.

   Nada é inventado: seção sem atributo preenchido não aparece.
   Exceção provisória, sempre com o selo "Simulado": popup.ndvi,
   popup.production e popup.history = "simulado" geram NDVI,
   produção e histórico da safra fictícios (js/data/*-mock.js)
   para avaliar o desenho. Produção e Histórico simulados só
   entram se a seção de mesmo nome não tiver dado real.
   ============================================================ */

import { el } from "./dom.js";
import { formatValue } from "./format.js";
import { getAttribute, isEmpty, toNumber, toTime } from "../data/values.js";
import { MONTHS, simulatedNdvi } from "../data/ndvi-mock.js";
import { simulatedSeason } from "../data/season-mock.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const TITLE_ROLES = new Set(["category", "text", "integer"]);

const ACTION_ICONS = {
    zoom: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16 16l4.5 4.5M11 8v6M8 11h6",
    table: "M4 5.5h16v13H4zM4 10h16M4 14.5h16M10 10v8.5"
};

/* Seções padrão, pelo papel do atributo. */
const DEFAULT_SECTIONS = [
    { title: "Informações", style: "grid", accepts: (attribute) => !["measure", "date"].includes(attribute.role) },
    { title: "Medidas", style: "metrics", accepts: (attribute) => attribute.role === "measure" },
    { title: "Histórico", style: "timeline", accepts: (attribute) => attribute.role === "date" }
];

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

/*
   Mini-gráfico da medida: onde o valor fica entre o menor e o maior
   da camada (faixa do schema), numa barra de escala de cor. Sem
   faixa (todos iguais) não aparece.
*/
const rangeBar = (attribute, value) => {
    const range = attribute.range;
    const number = toNumber(value);

    if (!range || number === null || range.max === range.min) {
        return null;
    }

    const percent = Math.min(100, Math.max(0, ((number - range.min) / (range.max - range.min)) * 100));
    const bar = el("span", {
        class: "feature-metric-scale color-scale",
        title: `Entre ${formatValue(range.min, attribute)} (mín.) e ${formatValue(range.max, attribute)} (máx.) da camada`
    }, el("span", { class: "color-scale-marker" }));

    bar.style.setProperty("--position", `${percent.toFixed(1)}%`);

    return bar;
};

/*
   Distribui os atributos preenchidos nas seções: primeiro as da
   camada (popup.sections, na ordem dos campos), depois as padrão
   para o que sobrou. Seções vazias saem.
*/
const arrangeSections = (layer, filled) => {
    const configured = layer.popup && Array.isArray(layer.popup.sections) ? layer.popup.sections : [];
    const byName = new Map(filled.map((attribute) => [attribute.name, attribute]));
    const used = new Set();
    const sections = [];

    configured.forEach(({ title, fields = [], style = "grid" }) => {
        const items = fields.map((name) => byName.get(name)).filter((attribute) => attribute && !used.has(attribute));

        items.forEach((attribute) => used.add(attribute));
        sections.push({ title, style, items });
    });

    DEFAULT_SECTIONS.forEach(({ title, style, accepts }) => {
        const items = filled.filter((attribute) => !used.has(attribute) && accepts(attribute));

        items.forEach((attribute) => used.add(attribute));

        const same = sections.find((section) => section.title === title);

        if (same) {
            same.items.push(...items);
        } else {
            sections.push({ title, style, items });
        }
    });

    return sections.filter((section) => section.items.length);
};

const svg = (tag, attributes = {}) => {
    const node = document.createElementNS(SVG_NS, tag);

    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));

    return node;
};

const ndviText = (value) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/*
   Série NDVI mensal em SVG nativo: área + linha na cor de destaque,
   média tracejada, o mês atual marcado e um ponto por mês (com o
   valor ao passar o mouse). Acima, atual · média · pico.
*/
const ndviChart = (series) => {
    const width = 240;
    const height = 64;
    const pad = 4;
    const x = (index) => pad + (index * (width - pad * 2)) / (series.length - 1);
    const y = (value) => pad + (1 - value) * (height - pad * 2);
    const points = series.map((item, index) => `${x(index).toFixed(1)},${y(item.value).toFixed(1)}`);
    const mean = series.reduce((sum, item) => sum + item.value, 0) / series.length;
    const peak = series.reduce((best, item) => (item.value > best.value ? item : best), series[0]);
    const nowIndex = new Date().getMonth();
    const now = series[nowIndex];

    const chart = svg("svg", { viewBox: `0 0 ${width} ${height}`, class: "ndvi-chart", role: "img" });

    chart.append(
        svg("title"),
        svg("path", { class: "ndvi-area", d: `M${points[0]} L${points.join(" L")} L${x(series.length - 1)},${height} L${x(0)},${height} Z` }),
        svg("line", { class: "ndvi-mean", x1: 0, x2: width, y1: y(mean).toFixed(1), y2: y(mean).toFixed(1) }),
        svg("polyline", { class: "ndvi-line", points: points.join(" ") })
    );
    chart.querySelector("title").textContent =
        `NDVI simulado por mês: ${series.map((item) => `${item.month} ${ndviText(item.value)}`).join(", ")}`;

    series.forEach((item, index) => {
        const dot = svg("circle", {
            class: index === nowIndex ? "ndvi-dot is-now" : "ndvi-dot",
            cx: x(index).toFixed(1),
            cy: y(item.value).toFixed(1),
            r: index === nowIndex ? 3 : 6
        });
        const tip = svg("title");

        tip.textContent = `${item.month}: NDVI ${ndviText(item.value)}`;
        dot.appendChild(tip);
        chart.appendChild(dot);
    });

    const stat = (label, value) => el("div", { class: "ndvi-stat" }, [
        el("span", { class: "ndvi-stat-label", text: label }),
        el("span", { class: "ndvi-stat-value", text: value })
    ]);

    return el("div", { class: "ndvi-card" }, [
        el("div", { class: "ndvi-stats" }, [
            stat(`Atual (${now.month.toLowerCase()})`, ndviText(now.value)),
            stat("Média", ndviText(mean)),
            stat(`Pico (${peak.month.toLowerCase()})`, ndviText(peak.value))
        ]),
        chart,
        el("div", { class: "ndvi-months", "aria-hidden": "true" }, MONTHS.map((month) => el("span", { text: month.charAt(0) })))
    ]);
};

/* ---------------- produção e histórico da safra (simulados) ---------------- */

const SIM_TITLE = "Dados fictícios, só para avaliar a interface";

const number = (value, digits = 1) =>
    value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const shortDate = (time) =>
    new Date(time).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

const simulatedSection = (title, season, content) => ({
    title,
    node: el("section", { class: "feature-section", id: `feature-section-${++sectionCounter}`, "aria-label": title }, [
        el("h4", { class: "feature-section-title" }, [
            `${title} `,
            el("span", { class: "feature-section-note", text: `(safra ${season.season})` }),
            el("span", { class: "feature-sim-badge", title: SIM_TITLE, text: "Simulado" })
        ]),
        content
    ])
});

/*
   Produção: números da safra num cartão (estágio, TCH com a
   variação sobre a safra anterior, produção, ATR, TAH) e as datas
   de colheita abaixo. Área sem cana: em reforma, com o plantio.
*/
const productionView = (season) => {
    const p = season.production;
    const metric = (label, value, unit = null, note = null) => el("div", { class: "feature-metric" }, [
        el("dt", { text: label }),
        el("dd", {}, [value, unit ? el("span", { class: "feature-metric-unit", text: ` ${unit}` }) : null]),
        note
    ]);
    const today = Date.now();
    const when = (label, time) => el("div", { class: "feature-grid-item" }, [
        el("dt", { text: label }),
        el("dd", { text: shortDate(time) })
    ]);

    if (season.fallow) {
        return el("div", { class: "feature-production" }, [
            el("dl", { class: "feature-metrics" }, [
                metric("Estágio", p.stage),
                p.area !== null ? metric("Área", number(p.area, 2), "ha") : null
            ]),
            el("p", { class: "feature-production-note", text: "Sem cana nesta safra: área em reforma do canavial." }),
            el("dl", { class: "feature-grid" }, [when("1ª colheita prevista", p.nextHarvest)])
        ]);
    }

    const delta = p.previousTch ? ((p.tch - p.previousTch) / p.previousTch) * 100 : null;
    const trend = delta === null
        ? el("span", { class: "feature-metric-note", text: "1º corte: sem safra anterior" })
        : el("span", {
            class: `feature-metric-note ${delta >= 0 ? "is-up" : "is-down"}`,
            title: `Safra anterior: ${number(p.previousTch)} t/ha`
        }, `${delta >= 0 ? "▲" : "▼"} ${number(Math.abs(delta))}% sobre a safra anterior`);

    return el("div", { class: "feature-production" }, [
        el("dl", { class: "feature-metrics feature-metrics-wide" }, [
            metric("Estágio", p.stage),
            metric("TCH", number(p.tch), "t/ha", trend)
        ]),
        el("dl", { class: "feature-metrics" }, [
            p.production !== null ? metric("Produção", number(p.production, 0), "t") : null,
            metric("ATR", number(p.atr), "kg/t"),
            metric("TAH", number(p.tah), "t/ha")
        ]),
        el("dl", { class: "feature-grid" }, [
            p.harvest !== null ? when(p.harvest <= today ? "Colhido em" : "Colheita prevista", p.harvest) : null,
            when("Próxima colheita", p.nextHarvest)
        ])
    ]);
};

/*
   Histórico: as operações da safra em ordem de data, numa linha do
   tempo. Feitas com ponto cheio; previstas com ponto vazado e
   etiqueta; um marcador "Hoje" separa as duas partes.
*/
const historyView = (season) => {
    const items = [];
    let todayPlaced = false;

    season.operations.forEach((operation) => {
        if (!operation.done && !todayPlaced) {
            todayPlaced = true;
            items.push(el("li", { class: "feature-ops-today", "aria-label": "Hoje" }, el("span", { text: "Hoje" })));
        }

        items.push(el("li", { class: `feature-ops-item${operation.done ? "" : " is-planned"}` }, [
            el("span", { class: "feature-ops-date", text: shortDate(operation.time) }),
            el("span", { class: "feature-ops-title" }, [
                operation.title,
                operation.done ? null : el("span", { class: "feature-ops-tag", text: "Prevista" })
            ]),
            operation.detail ? el("span", { class: "feature-ops-detail", text: operation.detail }) : null
        ]));
    });

    return items.length
        ? el("ol", { class: "feature-ops", "aria-label": `Operações da safra ${season.season}` }, items)
        : el("p", { class: "feature-production-note", text: "Nenhuma operação registrada nesta safra." });
};

/* Título curto da feição (o mesmo do cabeçalho do pop-up), ou null. */
export function featureTitle(layer, feature) {
    const attributes = layer.schema.attributes.filter((attribute) => attribute.role !== "empty");
    const attribute = pickTitle(layer, attributes, feature);

    return attribute ? formatValue(getAttribute(feature, attribute.name), attribute) : null;
}

let sectionCounter = 0;

export function buildPopup(layer, feature, { onZoom = null, onShowInTable = null } = {}) {
    const attributes = layer.schema.attributes.filter((attribute) => attribute.role !== "empty");
    const valueOf = (attribute) => getAttribute(feature, attribute.name);
    const text = (attribute) => formatValue(valueOf(attribute), attribute);
    const options = layer.popup || {};

    const titleAttribute = pickTitle(layer, attributes, feature);
    const badgeAttribute = attributes.find((attribute) =>
        attribute.name === options.badge && attribute !== titleAttribute && !isEmpty(valueOf(attribute))) || null;
    const subtitleAttribute = attributes.find((attribute) =>
        attribute.name === options.subtitle && attribute !== titleAttribute && !isEmpty(valueOf(attribute))) || null;
    const rest = attributes.filter((attribute) =>
        attribute !== titleAttribute && attribute !== badgeAttribute && attribute !== subtitleAttribute);
    const filled = rest.filter((attribute) => !isEmpty(valueOf(attribute)));
    const blank = rest.filter((attribute) => isEmpty(valueOf(attribute)));

    /* 1. Cabeçalho */
    const header = el("header", { class: "feature-popup-header" }, [
        options.kicker === false
            ? null
            : el("p", {
                class: "feature-popup-layer",
                text: titleAttribute ? `${layer.name} · ${titleAttribute.name}` : layer.name
            }),
        el("div", { class: "feature-popup-heading" }, [
            titleAttribute
                ? el("h3", { class: "feature-popup-title", text: text(titleAttribute) })
                : null,
            badgeAttribute
                ? el("span", { class: "feature-badge", title: badgeAttribute.name }, [
                    el("span", { class: "feature-badge-dot", "aria-hidden": "true" }),
                    text(badgeAttribute)
                ])
                : null
        ]),
        subtitleAttribute
            ? el("p", { class: "feature-popup-subtitle", title: subtitleAttribute.name, text: text(subtitleAttribute) })
            : null
    ]);

    /* 3. Seções */
    const renderers = {
        grid: (items) => el("dl", { class: "feature-grid" }, items.map((attribute) => {
            const value = text(attribute);

            return el("div", { class: "feature-grid-item" }, [
                el("dt", { text: attribute.name }),
                el("dd", { text: value, title: value })
            ]);
        })),

        metrics: (items) => el("dl", { class: "feature-metrics" }, items.map((attribute) =>
            el("div", { class: "feature-metric" }, [
                el("dt", { text: attribute.name }),
                el("dd", { text: text(attribute) }),
                attribute.role === "measure" || attribute.role === "integer" ? rangeBar(attribute, valueOf(attribute)) : null
            ])
        )),

        timeline: (items) => {
            const time = (attribute) => toTime(valueOf(attribute)) ?? -Infinity;
            const ordered = items.slice().sort((a, b) => time(b) - time(a));

            return el("ol", { class: "feature-timeline" }, ordered.map((attribute) =>
                el("li", {}, [
                    el("span", { class: "feature-timeline-value", text: text(attribute) }),
                    el("span", { class: "feature-timeline-label", text: attribute.name })
                ])
            ));
        }
    };

    const sections = arrangeSections(layer, filled).map((section) => {
        const id = `feature-section-${++sectionCounter}`;

        return {
            ...section,
            node: el("section", { class: "feature-section", id, "aria-label": section.title }, [
                el("h4", { class: "feature-section-title", text: section.title }),
                (renderers[section.style] || renderers.grid)(section.items)
            ])
        };
    });

    /*
       Produção e Histórico da safra simulados (popup.production /
       popup.history = "simulado"): entram logo depois da 1ª seção,
       e só se a seção de mesmo nome não veio com dado real.
    */
    const hasReal = (title) => sections.some((section) => section.title === title);
    const wantsProduction = options.production === "simulado" && !hasReal("Produção");
    const wantsHistory = options.history === "simulado" && !hasReal("Histórico");

    if (wantsProduction || wantsHistory) {
        const season = simulatedSeason(layer, feature, { areaField: options.areaField || null });
        const extra = [
            wantsProduction ? simulatedSection("Produção", season, productionView(season)) : null,
            wantsHistory ? simulatedSection("Histórico", season, historyView(season)) : null
        ].filter(Boolean);

        sections.splice(Math.min(1, sections.length), 0, ...extra);
    }

    /* Análise espacial: série NDVI (por ora só a simulada, popup.ndvi = "simulado"). */
    if (options.ndvi === "simulado") {
        sections.push({
            title: "Análise espacial",
            /* Aba curta: com Produção e Histórico, as quatro abas cabem na largura do cartão. */
            tab: "NDVI",
            node: el("section", { class: "feature-section", id: `feature-section-${++sectionCounter}`, "aria-label": "Análise espacial" }, [
                el("h4", { class: "feature-section-title" }, [
                    "Análise espacial ",
                    el("span", { class: "feature-section-note", text: "(NDVI)" }),
                    el("span", { class: "feature-sim-badge", title: "Série fictícia, só para avaliar a interface", text: "Simulado" })
                ]),
                ndviChart(simulatedNdvi(layer, feature))
            ])
        });
    }

    /* 4. Vazios (recolhidos) */
    const blankBlock = blank.length
        ? el("details", { class: "feature-blank" }, [
            el("summary", { text: `${blank.length} ${blank.length === 1 ? "atributo sem valor" : "atributos sem valor"}` }),
            el("p", { class: "feature-blank-list", text: blank.map((attribute) => attribute.name).join(" · ") })
        ])
        : null;

    const empty = !titleAttribute && !sections.length && !blank.length
        ? el("p", { class: "feature-info-empty", text: "Sem atributos." })
        : null;

    const scroll = el("div", { class: "feature-popup-scroll" }, [
        ...sections.map((section) => section.node),
        blankBlock,
        empty
    ]);

    /* 2. Abas: rolam até a seção; a aba ativa acompanha a rolagem. */
    let nav = null;

    if (sections.length > 1) {
        const tabs = sections.map((section, index) => el("button", {
            type: "button",
            class: "feature-tab",
            "aria-controls": section.node.id,
            "aria-current": index === 0 ? "true" : "false",
            onclick: () => {
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

                setActive(index);
                scroll.scrollTo({ top: section.node.offsetTop - 4, behavior: reduce ? "auto" : "smooth" });
            }
        }, section.tab || section.title));

        const setActive = (active) => tabs.forEach((tab, index) =>
            tab.setAttribute("aria-current", String(index === active)));

        let frame = 0;

        scroll.addEventListener("scroll", () => {
            if (frame) {
                return;
            }

            frame = requestAnimationFrame(() => {
                frame = 0;

                /* offsetTop relativo à área que rola (position: relative no CSS). */
                const top = scroll.scrollTop + 12;
                const atEnd = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2;
                let active = 0;

                sections.forEach((section, index) => {
                    if (section.node.offsetTop <= top) {
                        active = index;
                    }
                });

                setActive(atEnd ? sections.length - 1 : active);
            });
        }, { passive: true });

        nav = el("nav", { class: "feature-tabs", "aria-label": "Seções da feição" }, tabs);
    }

    /* 5. Ações e rodapé */
    const actions = [
        onZoom ? action("zoom", "Aproximar", onZoom) : null,
        onShowInTable ? action("table", "Ver na tabela", onShowInTable) : null
    ].filter(Boolean);

    const updatedTime = options.updated ? toTime(options.updated) : null;
    const footer = updatedTime !== null
        ? el("footer", { class: "feature-popup-footer" }, [
            el("span", { text: `Dados atualizados em ${new Date(updatedTime).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` })
        ])
        : null;

    return el("div", { class: "feature-popup-body" }, [
        header,
        nav,
        scroll,
        actions.length ? el("div", { class: "feature-popup-actions" }, actions) : null,
        footer
    ]);
}
