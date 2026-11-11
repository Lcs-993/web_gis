/* ============================================================
   EDITORES DA APARÊNCIA DE UMA CAMADA

   Conteúdo das abas Simbologia e Rótulos da janela de Propriedades
   (js/ui/layer-properties.js), para qualquer camada:

   Simbologia: tipo (símbolo único, categorizado, graduado), o
   símbolo (cor, preenchimento, contorno, tamanho do ponto), o
   tema (atributo, rampa de cores, classes e limites) e a
   opacidade da camada.
   Rótulos: ligar, atributos (um por linha), texto (tamanho, cor,
   negrito, halo) e zoom mínimo.

   Tudo passa pelas ações do store (setSymbol, setTheme,
   setLabels) e aparece no mapa na hora. Controles contínuos
   (cursor e seletor de cor) avisam por `quiet`: o mapa muda, mas
   a aba não é redesenhada no meio do arraste.
   ============================================================ */

import { el } from "./dom.js";
import { buildLabelFields, buildThemeBlock, buildThemeFieldSelect } from "./layer-panel.js";
import { CATEGORY_PALETTE, MAX_CLASSES, isThemeable, themeKind } from "../data/theme.js";
import { BREAK_METHODS, RAMP_TYPES, listRamps, rampGradient, rampName } from "../data/ramps.js";
import { SYMBOL_LIMITS, baseFillOpacity, resolveSymbol } from "../data/symbol.js";
import { LABEL_SIZE_LIMITS } from "../core/store.js";
import { formatCount } from "./format.js";
import { openColorPicker } from "./color-picker.js";

/* Número digitado (aceita vírgula decimal): "3,77" → 3.77; inválido → null. */
const parseTyped = (text) => {
    const clean = String(text).trim().replace(/\s+/g, "");

    if (!clean) {
        return null;
    }

    const number = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);

    return Number.isFinite(number) ? number : null;
};

/* Limite no campo: sem separador de milhar (para poder ser lido de volta). */
const limitText = (value, decimals) =>
    Number(value).toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: decimals });

/* n classes de mesma largura entre low e high (base para o modo manual). */
const equalPairs = (low, high, n) => Array.from({ length: n }, (_, i) =>
    [low + (high - low) * i / n, i === n - 1 ? high : low + (high - low) * (i + 1) / n]);

/* Amostra da paleta padrão: as 12 cores em faixas iguais. */
const defaultPaletteGradient = () => {
    const step = 100 / CATEGORY_PALETTE.length;

    return `linear-gradient(to right, ${CATEGORY_PALETTE
        .map((color, i) => `${color} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`)
        .join(", ")})`;
};

const rampBar = (background) => {
    const bar = el("span", { class: "ramp-bar", "aria-hidden": "true" });

    bar.style.backgroundImage = background;

    return bar;
};

/* Linha "rótulo + controle" dos ajustes do tema. */
export const fieldRow = (label, control) =>
    el("label", { class: "layer-label-field" }, [el("span", { class: "field-label", text: label }), control]);

/* replaceChildren escreveria null como o texto "null": os blocos opcionais (null) saem antes. */
export const fill = (container, ...nodes) => container.replaceChildren(...nodes.filter(Boolean));

/* Interruptor (estilo iOS) com rótulo e texto de apoio. */
export const switchRow = ({ label, hint, checked, disabled, focusKey, onChange }) =>
    el("label", { class: "settings-row" }, [
        el("span", { class: "settings-text" }, [
            el("span", { class: "settings-label", text: label }),
            hint ? el("span", { class: "settings-hint", text: hint }) : null
        ]),
        el("input", {
            type: "checkbox",
            class: "switch",
            checked: Boolean(checked),
            disabled: Boolean(disabled),
            dataset: { focusKey },
            onchange: (event) => onChange(event.target.checked)
        })
    ]);


/* Título de seção dentro da aba. */
const section = (title, children, hint = null) => el("section", { class: "settings-group" }, [
    el("h3", { class: "settings-title", text: title }),
    el("div", { class: "glass-card panel-block prop-card" }, children),
    hint ? el("p", { class: "settings-hint prop-hint", text: hint }) : null
]);

const percent = (value) => `${Math.round(value * 100)}%`;

/* Um quadro por repintura: arrastar um cursor não empilha repinturas do mapa. */
const throttled = (apply) => {
    let pending = null;
    let frame = 0;

    return (value) => {
        pending = value;

        if (!frame) {
            frame = requestAnimationFrame(() => {
                frame = 0;
                apply(pending);
            });
        }
    };
};

export function createAppearanceEditor(store, { rerender, quiet }) {
    /* Lista de rampas aberta (fecha ao escolher). */
    let rampListOpen = false;

    /*
       Linha "rótulo + cursor + valor". Enquanto arrasta (input), o
       mapa muda sem redesenhar a aba; ao soltar (change), a aba se
       redesenha para os textos que dependem do valor.
    */
    const sliderRow = ({ label, value, min, max, step, format, focusKey, disabled, onChange }) => {
        const output = el("output", { class: "prop-value", text: format(value) });
        const live = throttled((number) => quiet(() => onChange(number)));
        /* Parte do trilho até o botão, pintada na cor de destaque (como no macOS). */
        const paint = (input, number) => input.style.setProperty("--fill", `${((number - min) / (max - min || 1)) * 100}%`);

        const input = el("input", {
            type: "range",
            class: "prop-range",
            min: String(min),
            max: String(max),
            step: String(step),
            value: String(value),
            disabled: Boolean(disabled),
            dataset: { focusKey },
            oninput: (event) => {
                const number = Number(event.target.value);

                output.textContent = format(number);
                paint(event.target, number);
                live(number);
            },
            onchange: (event) => onChange(Number(event.target.value))
        });

        paint(input, value);

        return el("label", { class: "prop-row" }, [
            el("span", { class: "prop-label", text: label }),
            input,
            output
        ]);
    };

    /*
       Linha "rótulo + cor": amostra clicável e o código da cor. A
       amostra abre o seletor do app (js/ui/color-picker.js), não o
       do sistema: enquanto se escolhe, o mapa muda sem redesenhar a
       aba; ao fechar, a cor final é gravada.
    */
    const colorRow = ({ label, value, focusKey, disabled, hint, onChange }) => {
        const code = el("span", { class: "prop-value prop-color-code", text: String(value).toUpperCase() });
        const live = throttled((color) => quiet(() => onChange(color)));
        const paint = (color) => {
            well.style.setProperty("--swatch", color);
            code.textContent = color.toUpperCase();
        };

        const well = el("button", {
            type: "button",
            class: "prop-color",
            disabled: Boolean(disabled),
            "aria-haspopup": "dialog",
            "aria-expanded": "false",
            "aria-label": `${label}: ${String(value).toUpperCase()}. Escolher cor`,
            dataset: { focusKey },
            onclick: () => openColorPicker(well, {
                value,
                title: label,
                onInput: (color) => {
                    paint(color);
                    live(color);
                },
                onChange: (color) => {
                    paint(color);
                    onChange(color);
                }
            })
        });

        paint(value);

        return el("div", { class: "prop-row" }, [
            el("span", { class: "prop-label" }, [
                el("span", { text: label }),
                hint ? el("span", { class: "settings-hint", text: hint }) : null
            ]),
            well,
            code
        ]);
    };

    /* O seletor trabalha em #rrggbb: cores nomeadas ou hsl() do catálogo viram hex. */
    const toHex = (color) => {
        if (/^#[0-9a-f]{6}$/i.test(color || "")) {
            return color.toLowerCase();
        }

        const probe = document.createElement("canvas").getContext("2d");

        probe.fillStyle = "#000000";
        probe.fillStyle = color || "#000000";

        return /^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : "#000000";
    };


    /* ---------------- simbologia ---------------- */

    const TYPE_OPTIONS = [
        ["single", "Símbolo único", "Uma cor só para a camada inteira."],
        ["category", "Categorias", "Uma cor para cada valor de um atributo de categoria."],
        ["numeric", "Graduado", "Faixas de valor de um atributo numérico, numa rampa de cores."]
    ];

    /* Amostra do símbolo atual (polígono, linha ou ponto), como a do ArcGIS. */
    const SVG_NS = "http://www.w3.org/2000/svg";
    const svgNode = (tag, attributes) => {
        const node = document.createElementNS(SVG_NS, tag);

        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));

        return node;
    };

    const symbolPreview = (layer, symbol, themed) => {
        const box = svgNode("svg", { viewBox: "0 0 44 32", class: "prop-preview", "aria-hidden": "true" });
        /* Com tema, a amostra mostra as três primeiras cores dele. */
        const colors = themed && layer.theme.legend
            ? layer.theme.legend.classes.slice(0, 3).map((item) => item.color)
            : [layer.color];
        const fillOpacity = symbol.fill ? baseFillOpacity(symbol, { isPoint: symbol.kind === "point", themed }) : 0;
        const opacity = symbol.opacity;

        if (symbol.icon) {
            box.appendChild(svgNode("path", { d: "M22 4c-6 0-10 4.4-10 10 0 7 10 15 10 15s10-8 10-15c0-5.6-4-10-10-10Z", fill: layer.color, opacity }));
        } else if (symbol.kind === "line") {
            box.appendChild(svgNode("path", { d: "M5 24 C14 6, 26 30, 39 9", fill: "none", stroke: colors[0], "stroke-width": Math.max(1.5, symbol.strokeWidth), "stroke-linecap": "round", opacity }));
        } else if (symbol.kind === "point") {
            colors.forEach((color, i) => box.appendChild(svgNode("circle", {
                cx: 12 + i * 10, cy: 16, r: Math.min(8, Math.max(4, symbol.pointSize)),
                fill: color, "fill-opacity": fillOpacity, stroke: symbol.strokeColor, "stroke-width": symbol.strokeWidth, opacity
            })));
        } else {
            const shapes = ["M4 8 L20 4 L22 18 L6 22 Z", "M20 4 L40 7 L38 20 L22 18 Z", "M6 22 L22 18 L38 20 L36 29 L8 29 Z"];

            shapes.forEach((d, i) => box.appendChild(svgNode("path", {
                d,
                fill: symbol.fill ? colors[i % colors.length] : "none",
                "fill-opacity": fillOpacity,
                stroke: symbol.fill ? symbol.strokeColor : colors[0],
                "stroke-width": Math.max(0.8, symbol.strokeWidth),
                "stroke-linejoin": "round",
                opacity
            })));
        }

        return box;
    };

    const symbology = (layer) => {
        const themeable = layer.schema.attributes.filter(isThemeable);
        const themeOn = layer.theme.visible && Boolean(layer.theme.legend);
        const attribute = themeOn ? themeable.find((item) => item.name === layer.theme.field) : null;
        const current = attribute ? themeKind(attribute) : "single";
        const firstOf = (kind) => themeable.find((item) => themeKind(item) === kind) || null;
        const symbol = resolveSymbol(layer);
        const set = (patch) => store.setSymbol(layer.id, patch);

        const setType = (type) => {
            if (type === "single") {
                store.setTheme(layer.id, { visible: false });
                return;
            }

            const target = firstOf(type);

            if (target) {
                /* Já num atributo desse tipo: mantém; senão, o primeiro do tipo. */
                store.setTheme(layer.id, { visible: true, field: current === type ? layer.theme.field : target.name });
            }
        };

        const typeInfo = TYPE_OPTIONS.find(([id]) => id === current);

        /*
           Estilo primário, como nas opções de estilo do ArcGIS, num
           controle segmentado do macOS. Tipo sem atributo que sirva
           (ex.: Graduado sem campo numérico) fica desabilitado.
        */
        const typeCard = section("Estilo", [
            el("div", { class: "prop-type" }, [
                el("div", {
                    class: "tabs segmented prop-segmented",
                    role: "radiogroup",
                    "aria-label": "Tipo de simbologia"
                }, TYPE_OPTIONS.map(([id, text]) => {
                    const available = id === "single" || Boolean(firstOf(id));

                    return el("button", {
                        type: "button",
                        class: "tab",
                        role: "radio",
                        "aria-checked": String(id === current),
                        disabled: !available,
                        title: available ? TYPE_OPTIONS.find(([key]) => key === id)[2] : "A camada não tem atributo para este tipo",
                        dataset: { focusKey: `symbol-type:${layer.id}:${id}` },
                        onclick: () => {
                            if (id !== current) {
                                setType(id);
                            }
                        }
                    }, text);
                })),
                symbolPreview(layer, symbol, themeOn)
            ]),
            el("p", { class: "settings-hint", text: typeInfo[2] })
        ]);

        /* Com tema, a cor principal de cada feição vem dele. */
        const themedHint = themeOn ? "Definida pelo tema" : null;
        const mainColor = (label) => colorRow({
            label,
            value: toHex(layer.color),
            hint: themedHint,
            disabled: themeOn,
            focusKey: `symbol-color:${layer.id}`,
            onChange: (color) => set({ color })
        });

        const strokeWidth = (label) => sliderRow({
            label,
            value: symbol.strokeWidth,
            ...SYMBOL_LIMITS.strokeWidth,
            format: (value) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} px`,
            focusKey: `symbol-stroke-width:${layer.id}`,
            onChange: (value) => set({ strokeWidth: value })
        });

        const strokeColor = () => colorRow({
            label: "Cor do contorno",
            value: toHex(symbol.strokeColor),
            focusKey: `symbol-stroke-color:${layer.id}`,
            onChange: (color) => set({ strokeColor: color })
        });

        const fillOpacity = (isPoint) => sliderRow({
            label: "Opacidade do preenchimento",
            value: baseFillOpacity(symbol, { isPoint, themed: themeOn }),
            min: 0,
            max: 1,
            step: 0.05,
            format: percent,
            focusKey: `symbol-fill-opacity:${layer.id}`,
            onChange: (value) => set({ fillOpacity: value })
        });

        let symbolRows;

        if (symbol.icon) {
            symbolRows = [el("p", { class: "settings-hint", text: "Esta camada é desenhada com uma imagem (ícone). Só a opacidade da camada, abaixo, se aplica." })];
        } else if (symbol.kind === "line") {
            symbolRows = [mainColor("Cor da linha"), strokeWidth("Espessura")];
        } else if (symbol.kind === "point") {
            symbolRows = [
                mainColor("Cor"),
                fillOpacity(true),
                sliderRow({
                    label: "Tamanho",
                    value: symbol.pointSize,
                    ...SYMBOL_LIMITS.pointSize,
                    format: (value) => `${value} px`,
                    focusKey: `symbol-point-size:${layer.id}`,
                    onChange: (value) => set({ pointSize: value })
                }),
                strokeColor(),
                strokeWidth("Espessura do contorno")
            ];
        } else {
            symbolRows = [
                switchRow({
                    label: "Preenchimento",
                    hint: symbol.fill ? null : "Só o contorno, na cor da camada.",
                    checked: symbol.fill,
                    focusKey: `symbol-fill:${layer.id}`,
                    onChange: (on) => set({ fill: on })
                }),
                ...(symbol.fill
                    ? [mainColor("Cor do preenchimento"), fillOpacity(false), strokeColor()]
                    : [mainColor("Cor do contorno")]),
                strokeWidth("Espessura do contorno")
            ];
        }

        const themeCards = themeOn
            ? [
                section(current === "numeric" ? "Graduado" : "Categorias", buildThemeSettings(layer, themeable)),
                section(layer.theme.legend.kind === "numeric" ? "Classes (limites editáveis)" : "Classes", [
                    layer.theme.legend.kind === "numeric"
                        ? buildLimitEditor(layer, themeable)
                        : buildThemeBlock(store, layer, themeable, { showField: false })
                ])
            ]
            : [];

        return [
            typeCard,
            section("Símbolo", symbolRows),
            ...themeCards,
            section("Renderização da camada", [
                sliderRow({
                    label: "Opacidade",
                    value: symbol.opacity,
                    min: 0,
                    max: 1,
                    step: 0.05,
                    format: percent,
                    focusKey: `symbol-opacity:${layer.id}`,
                    onChange: (value) => set({ opacity: value })
                })
            ], "100% é a camada como definida acima; menos que isso deixa o mapa base aparecer por trás.")
        ];
    };

    /* Atributo, cores (rampa), inverter e, nas faixas, método e número de classes. */
    const buildThemeSettings = (layer, themeable) => {
        const attribute = themeable.find((item) => item.name === layer.theme.field);
        const kind = themeKind(attribute);
        const options = layer.theme.options[kind];
        const legend = layer.theme.legend;
        const set = (patch) => store.setTheme(layer.id, patch);
        const ramps = listRamps();
        const current = options.ramp && rampName(options.ramp) ? options.ramp : null;
        const currentName = current ? rampName(current) : "Padrão (terrosa)";
        const preview = (id) => id ? rampGradient(id, { invert: options.invert }) : defaultPaletteGradient();

        const pick = el("button", {
            type: "button",
            class: "ramp-current",
            "aria-expanded": String(rampListOpen),
            "aria-label": `Cores do tema: ${currentName}. Escolher outra rampa`,
            dataset: { focusKey: `ramp-current:${layer.id}` },
            onclick: () => {
                rampListOpen = !rampListOpen;
                rerender();
            }
        }, [
            rampBar(preview(current)),
            el("span", { class: "ramp-name", text: currentName }),
            el("span", { class: "ramp-chevron", "aria-hidden": "true" })
        ]);

        const choose = (id) => {
            rampListOpen = false;
            set({ ramp: id });
        };

        const option = (id, name, title) => el("button", {
            type: "button",
            class: "ramp-option",
            "aria-pressed": String(current === id),
            title,
            dataset: { focusKey: `ramp:${layer.id}:${id}` },
            onclick: () => choose(id)
        }, [rampBar(preview(id)), el("span", { class: "ramp-name", text: name })]);

        const groups = RAMP_TYPES.map(([type, title]) => {
            const items = ramps.filter((ramp) => ramp.type === type);

            return items.length
                ? el("div", { class: "ramp-group" }, [
                    el("p", { class: "ramp-group-title", text: title }),
                    el("div", { class: "ramp-grid" }, items.map((ramp) =>
                        option(ramp.id, ramp.name, `${ramp.name} (${title.toLowerCase()})`)))
                ])
                : null;
        });

        const list = rampListOpen
            ? el("div", { class: "ramp-list", role: "group", "aria-label": "Rampas de cores" }, [
                kind === "category"
                    ? el("div", { class: "ramp-group" }, [option(null, "Padrão (terrosa)", "12 cores terrosas bem distintas; acima disso, geradas")])
                    : null,
                ...groups,
                ramps.length
                    ? null
                    : el("p", { class: "panel-empty", text: "Rampas indisponíveis: assets/rampas_de_cores/rampas.js não carregou." })
            ])
            : null;

        const shown = legend.classes.length;
        const manual = legend.method === "manual";
        const currentPairs = () => legend.classes.map((item) => [item.min, item.max]);

        /*
           Número de classes digitado (1 a 32). No modo manual, as
           classes são refeitas com a mesma largura entre o menor e o
           maior limite atuais, e seguem editáveis.
        */
        const setClassCount = (event) => {
            const typed = Math.round(Number(event.target.value));

            if (!Number.isFinite(typed) || typed < 1) {
                rerender();
                return;
            }

            const n = Math.min(MAX_CLASSES, typed);

            if (manual && shown) {
                set({ classes: n, limits: equalPairs(legend.classes[0].min, legend.classes[shown - 1].max, n), limitsField: legend.field });
            } else {
                set({ classes: n });
            }
        };

        /* Manual: o que está na tela vira o ponto de partida dos limites digitados. */
        const setMethod = (event) => {
            const method = event.target.value;

            set(method === "manual" ? { method, limits: currentPairs(), limitsField: legend.field, classes: shown } : { method });
        };

        const numeric = kind === "numeric"
            ? [
                fieldRow("Classificação", el("select", {
                    dataset: { focusKey: `theme-method:${layer.id}` },
                    onchange: setMethod
                }, BREAK_METHODS.map(([value, text]) => el("option", { value, text, selected: value === legend.method })))),
                fieldRow("Classes", el("input", {
                    type: "number",
                    class: "theme-classes-input",
                    min: "1",
                    max: String(MAX_CLASSES),
                    step: "1",
                    value: String(manual ? shown : options.classes),
                    "aria-label": `Número de classes (1 a ${MAX_CLASSES})`,
                    dataset: { focusKey: `theme-classes:${layer.id}` },
                    onchange: setClassCount
                })),
                !manual && shown < options.classes
                    ? el("p", { class: "settings-hint", text: `Os valores só permitem ${shown} ${shown === 1 ? "classe distinta" : "classes distintas"}.` })
                    : null
            ]
            : [];

        return el("div", { class: "theme-settings" }, [
            fieldRow("Atributo", buildThemeFieldSelect(store, layer, themeable, `Atributo do tema de ${layer.name}`)),
            el("div", { class: "layer-label-field" }, [el("span", { class: "field-label", text: "Cores" }), pick]),
            list,
            switchRow({
                label: "Inverter cores",
                hint: kind === "numeric" ? "Troca as pontas da rampa: a cor do maior vai para o menor." : null,
                checked: options.invert,
                focusKey: `theme-invert:${layer.id}`,
                onChange: (on) => set({ invert: on })
            }),
            ...numeric
        ]);
    };

    /*
       Faixas de valor com limites editáveis: cor · [mín] – [máx] ·
       quantidade. Digitar um limite passa o tema para "Manual"; se
       o limite era compartilhado com a classe vizinha (contíguas),
       ela acompanha. Valor inválido volta ao anterior.
    */
    const buildLimitEditor = (layer, themeable) => {
        const legend = layer.theme.legend;
        const attribute = themeable.find((item) => item.name === legend.field);
        const decimals = Math.min(6, Math.max(2, attribute && attribute.range ? attribute.range.decimals : 2));
        const pairs = legend.classes.map((item) => [item.min, item.max]);

        const commit = (index, side, event) => {
            const value = parseTyped(event.target.value);

            if (value === null) {
                rerender();
                return;
            }

            const next = pairs.map((pair) => pair.slice());
            const old = next[index][side];

            next[index][side] = value;

            if (side === 1 && index + 1 < next.length && next[index + 1][0] === old) {
                next[index + 1][0] = value;
            }

            if (side === 0 && index > 0 && next[index - 1][1] === old) {
                next[index - 1][1] = value;
            }

            store.setTheme(layer.id, { method: "manual", limits: next, limitsField: legend.field, classes: next.length });
        };

        const limitInput = (index, side, label) => el("input", {
            type: "text",
            inputmode: "decimal",
            class: "theme-limit-input",
            value: limitText(pairs[index][side], decimals),
            "aria-label": `${label} da classe ${index + 1}`,
            dataset: { focusKey: `theme-limit:${layer.id}:${index}:${side}` },
            onchange: (event) => commit(index, side, event),
            onkeydown: (event) => {
                if (event.key === "Enter") {
                    event.target.blur();
                }
            }
        });

        const swatch = (color) => {
            const node = el("span", { class: "legend-swatch", "aria-hidden": "true" });

            node.style.backgroundColor = color;

            return node;
        };

        const rows = legend.classes.map((item, index) => el("li", { class: "legend-item theme-limit-row" }, [
            swatch(item.color),
            limitInput(index, 0, "Limite inferior"),
            el("span", { class: "theme-limit-dash", "aria-hidden": "true", text: "–" }),
            limitInput(index, 1, "Limite superior"),
            el("span", { class: "legend-count", text: formatCount(item.count) })
        ]));

        const extra = (entry, label) => entry
            ? el("li", { class: "legend-item is-muted" }, [
                swatch(entry.color),
                el("span", { class: "legend-label", text: label }),
                el("span", { class: "legend-count", text: formatCount(entry.count) })
            ])
            : null;

        return el("div", { class: "layer-theme-block" }, [
            el("ul", { class: "legend theme-limits", "aria-label": `Classes do tema ${legend.field}` }, [
                ...rows,
                extra(legend.outside, "(fora das classes)"),
                extra(legend.empty, "(vazio)")
            ]),
            el("p", { class: "settings-hint theme-limits-hint", text: "Digite os limites e tecle Enter. Um valor igual a um limite compartilhado fica na classe de baixo." })
        ]);
    };


    /* ---------------- rótulos ---------------- */

    const labels = (layer, { zoom = null, maxZoom = 18, minMapZoom = 4 } = {}) => {
        const on = layer.labels.visible;
        const style = layer.labels;
        const set = (patch) => store.setLabels(layer.id, patch);
        const zooms = [];

        for (let level = minMapZoom + 1; level <= maxZoom; level++) {
            zooms.push(level);
        }

        /*
           As opções ficam sempre à vista (como no ArcGIS); com os rótulos
           desligados, esmaecidas e fora do alcance do teclado (inert).
        */
        const options = el("div", { class: `prop-dependent${on ? "" : " is-off"}`, inert: !on }, [
            section("Conteúdo", [buildLabelFields(store, layer)], "Um atributo por linha, na ordem."),
            section("Texto", [
                sliderRow({
                    label: "Tamanho",
                    value: style.size,
                    min: LABEL_SIZE_LIMITS.min,
                    max: LABEL_SIZE_LIMITS.max,
                    step: 1,
                    format: (value) => `${value} px`,
                    focusKey: `labels-size:${layer.id}`,
                    onChange: (value) => set({ size: value })
                }),
                colorRow({
                    label: "Cor",
                    value: toHex(style.color),
                    focusKey: `labels-color:${layer.id}`,
                    onChange: (color) => set({ color })
                }),
                switchRow({
                    label: "Negrito",
                    checked: style.bold,
                    focusKey: `labels-bold:${layer.id}`,
                    onChange: (checked) => set({ bold: checked })
                }),
                switchRow({
                    label: "Halo",
                    hint: "Contorno suave que destaca o texto do mapa (escuro sob letra clara e vice-versa).",
                    checked: style.halo,
                    focusKey: `labels-halo:${layer.id}`,
                    onChange: (checked) => set({ halo: checked })
                })
            ]),
            section("Visibilidade", [
                el("label", { class: "prop-row" }, [
                    el("span", { class: "prop-label", text: "Mostrar a partir do zoom" }),
                    el("select", {
                        class: "prop-select",
                        dataset: { focusKey: `labels-zoom:${layer.id}` },
                        onchange: (event) => set({ minZoom: Number(event.target.value) || null })
                    }, [
                        el("option", { value: "0", text: "Sempre", selected: !style.minZoom }),
                        ...zooms.map((level) => el("option", {
                            value: String(level),
                            text: String(level),
                            selected: style.minZoom === level
                        }))
                    ])
                ])
            ], zoom === null
                ? "Rótulos que se sobreporiam são omitidos e aparecem ao aproximar."
                : `O mapa está no zoom ${zoom}. Rótulos que se sobreporiam são omitidos e aparecem ao aproximar.`)
        ]);

        return [
            section("Rótulos", [
                switchRow({
                    label: "Mostrar rótulos",
                    hint: "Só uma camada fica rotulada por vez.",
                    checked: on,
                    focusKey: `labels-on:${layer.id}`,
                    onChange: (checked) => set({ visible: checked })
                })
            ]),
            options
        ];
    };

    return { symbology, labels };
}
