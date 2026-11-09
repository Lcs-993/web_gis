/* ============================================================
   PAINÉIS DA CAMADA ATIVA (barra esquerda, grupos Consultar e Simbologia):
   Estilos, Rótulos e Pesquisa avançada

   Os mesmos controles da linha da camada no painel Camadas
   (js/ui/layer-panel.js), só que para a camada ativa e com mais
   espaço. Estilos tem também a personalização do tema: rampa de
   cores (assets/rampas_de_cores), inverter e, nos atributos
   numéricos, o método e o número de classes. Tudo passa pelas
   ações do store (setTheme, setLabels); aqui só fica guardado se
   a lista de rampas está aberta. A Pesquisa avançada ajusta a
   busca da caixa do mapa (store.setSearchOptions).
   ============================================================ */

import { el, byId } from "./dom.js";
import { buildLabelFields, buildThemeBlock, buildThemeFieldSelect } from "./layer-panel.js";
import { CATEGORY_PALETTE, MAX_CLASSES, isThemeable, themeKind } from "../data/theme.js";
import { BREAK_METHODS, RAMP_TYPES, listRamps, rampGradient, rampName } from "../data/ramps.js";
import { formatCount } from "./format.js";
import { SEARCH_COMBINE, SEARCH_MATCH, isDefaultSearch } from "../data/search.js";
import { isSearchable } from "../data/schema.js";

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
const fieldRow = (label, control) =>
    el("label", { class: "layer-label-field" }, [el("span", { class: "field-label", text: label }), control]);
import { layerPendingState } from "./skeleton.js";

/* replaceChildren escreveria null como o texto "null": os blocos opcionais (null) saem antes. */
const fill = (container, ...nodes) => container.replaceChildren(...nodes.filter(Boolean));

/* Interruptor (estilo iOS) com rótulo e texto de apoio. */
const switchRow = ({ label, hint, checked, disabled, focusKey, onChange }) =>
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

export function createLayerTools(store) {
    const stylesBody = byId("styles-body");
    const labelsBody = byId("labels-body");
    const searchBody = byId("search-body");

    /* Lista de rampas aberta no painel Estilos (fecha ao escolher). */
    let rampListOpen = false;

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

    const drawStyles = () => {
        const layer = store.getActiveLayer();

        if (!layer || layer.status !== "ready") {
            stylesBody.replaceChildren(layerPendingState(layer));
            return;
        }

        const themeable = layer.schema.attributes.filter(isThemeable);
        const themeOn = layer.theme.visible && Boolean(layer.theme.legend);

        fill(stylesBody,
            el("div", { class: "glass-card" }, [
                switchRow({
                    label: "Tema",
                    hint: themeable.length
                        ? "Cores pelo atributo: uma por categoria ou por faixas de valor."
                        : "Esta camada não tem atributos para tematizar.",
                    checked: themeOn,
                    disabled: !themeable.length,
                    focusKey: `styles-theme:${layer.id}`,
                    onChange: (on) => store.setTheme(layer.id, { visible: on })
                })
            ]),
            themeOn ? el("div", { class: "glass-card panel-block" }, buildThemeSettings(layer, themeable)) : null,
            themeOn
                ? el("div", { class: "glass-card panel-block" }, [
                    el("p", { class: "field-label", text: layer.theme.legend.kind === "numeric" ? "Classes (limites editáveis)" : "Legenda" }),
                    layer.theme.legend.kind === "numeric"
                        ? buildLimitEditor(layer, themeable)
                        : buildThemeBlock(store, layer, themeable, { showField: false })
                ])
                : null
        );
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
        const currentName = current ? rampName(current) : "Padrão (alto contraste)";
        const preview = (id) => id ? rampGradient(id, { invert: options.invert }) : defaultPaletteGradient();

        const pick = el("button", {
            type: "button",
            class: "ramp-current",
            "aria-expanded": String(rampListOpen),
            "aria-label": `Cores do tema: ${currentName}. Escolher outra rampa`,
            dataset: { focusKey: `ramp-current:${layer.id}` },
            onclick: () => {
                rampListOpen = !rampListOpen;
                render();
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
                    ? el("div", { class: "ramp-group" }, [option(null, "Padrão (alto contraste)", "12 cores bem distintas; acima disso, geradas")])
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
                render();
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
                render();
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

    const drawLabels = () => {
        const layer = store.getActiveLayer();

        if (!layer || layer.status !== "ready") {
            labelsBody.replaceChildren(layerPendingState(layer));
            return;
        }

        const on = layer.labels.visible;
        const minZoom = layer.labels.minZoom;

        fill(labelsBody,
            el("div", { class: "glass-card" }, [
                switchRow({
                    label: "Mostrar rótulos",
                    hint: minZoom
                        ? `Aparecem a partir do zoom ${minZoom}. Só uma camada fica rotulada por vez.`
                        : "Só uma camada fica rotulada por vez.",
                    checked: on,
                    focusKey: `labels-on:${layer.id}`,
                    onChange: (checked) => store.setLabels(layer.id, { visible: checked })
                })
            ]),
            on ? el("div", { class: "glass-card panel-block" }, buildLabelFields(store, layer)) : null
        );
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

    const render = () => {
        keepFocus(stylesBody, drawStyles);
        keepFocus(labelsBody, drawLabels);
        keepFocus(searchBody, drawSearch);
    };

    store.on("layers", render);
    store.on("active", render);
    store.on("theme", render);
    store.on("labels", render);
    /* Termo ou opções da busca mudaram: só a Pesquisa avançada precisa redesenhar. */
    store.on("view", (layer) => {
        if (layer && layer.id === store.state.activeLayerId) {
            keepFocus(searchBody, drawSearch);
        }
    });

    render();
}
