/* ============================================================
   SELETOR DE COR DA APLICAÇÃO

   Substitui o seletor do sistema (input type="color"), que no
   Windows abre a caixa "Cor" do Win32, fora do estilo do app.
   Popover de vidro ancorado na amostra clicada, com abas de
   paletas já definidas:
   - Projeto: CATEGORY_PALETTE do tema, cores das camadas em
     config.js, tons neutros e as recentes (localStorage);
   - ArcGIS: as 120 cores nomeadas da paleta padrão do ArcMap;
   - AutoCAD: o índice ACI (1–255), no arranjo do AutoCAD;
   (as duas últimas vêm de window.PALETAS, gerado a partir dos .gpl
   em assets/rampas_de_cores/fontes) e, abaixo, a cor livre:
   - área saturação/brilho, matiz, código hex e conta-gotas
     (onde o navegador oferece EyeDropper).

   Enquanto se mexe, onInput recebe cada cor (prévia no mapa);
   ao fechar (clique fora, Enter ou escolher uma amostra),
   onChange recebe a cor final. Esc desfaz e volta à original.
   ============================================================ */

import { el } from "./dom.js";
import { CATEGORY_PALETTE, EMPTY_COLOR } from "../data/theme.js";
import { LAYERS, LAYER_PALETTE } from "../config.js";
import { paletteColors } from "../data/ramps.js";

const RECENT_KEY = "webgis:cores-recentes";
const TAB_KEY = "webgis:cores-aba";
const RECENT_MAX = 12;

const unique = (colors) => [...new Set(colors.map((color) => color.toLowerCase()))];

/* Paletas do projeto: categorias + cores das camadas (sem repetir). */
const PROJECT_COLORS = unique([
    ...CATEGORY_PALETTE,
    ...LAYER_PALETTE,
    ...LAYERS.map((layer) => layer.color).filter((color) => /^#[0-9a-f]{6}$/i.test(color || ""))
]).filter((color) => color !== "#ffffff");

const NEUTRAL_COLORS = ["#ffffff", "#d1d1d6", "#a8a8ae", EMPTY_COLOR, "#2c2c2e", "#000000"];

const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value || "");

const storageGet = (key) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const storageSet = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* Sem armazenamento: só não lembra. */
    }
};

/* ArcGIS: 12 matizes por linha, 10 linhas (do claro ao escuro), como no ArcMap. */
const arcgisGroups = () => {
    const colors = paletteColors("arcgis-color-palette");

    return colors.length
        ? [{ title: "ArcGIS Color Palette", columns: 12, colors }]
        : [];
};

/*
   AutoCAD (ACI): índices 10–249 são 24 matizes × 10 tons; como no
   seletor do AutoCAD, os tons pares (vivos → escuros) em cima e os
   ímpares (pastéis → escuros) embaixo. Depois, as cores padrão
   1–9 e os cinzas 250–255. Os nomes repetidos (red, yellow…) e o
   0 (ByBlock) ficam de fora.
*/
const aciGroups = () => {
    const byIndex = new Map(paletteColors("autocad-color-index-aci-colors")
        .filter(({ name }) => /^\d+$/.test(name))
        .map(({ name, color }) => [Number(name), { name: `ACI ${name}`, color }]));

    if (!byIndex.size) {
        return [];
    }

    const pick = (indexes) => indexes.map((i) => byIndex.get(i)).filter(Boolean);
    const hues = Array.from({ length: 24 }, (_, i) => 10 + i * 10);
    const grid = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9].flatMap((offset) => hues.map((hue) => hue + offset));

    return [
        { title: "Índice de cores (ACI)", columns: 24, colors: pick(grid), dense: true },
        { title: "Padrão e cinzas", columns: 15, colors: pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 250, 251, 252, 253, 254, 255]) }
    ];
};

const named = (colors) => colors.map((color) => ({ name: "", color }));

const projectGroups = () => [
    { title: "Paleta do projeto", columns: 12, colors: named(PROJECT_COLORS) },
    { title: "Neutras", columns: 12, colors: named(NEUTRAL_COLORS) },
    { title: "Recentes", columns: 12, colors: named(readRecent()) }
];

const TABS = [
    ["projeto", "Projeto", projectGroups],
    ["arcgis", "ArcGIS", arcgisGroups],
    ["autocad", "AutoCAD", aciGroups]
];

const readRecent = () => {
    try {
        const list = JSON.parse(storageGet(RECENT_KEY) || "[]");

        return Array.isArray(list) ? list.filter(isHex).slice(0, RECENT_MAX) : [];
    } catch {
        return [];
    }
};

const pushRecent = (color) => storageSet(RECENT_KEY, JSON.stringify(unique([color, ...readRecent()]).slice(0, RECENT_MAX)));

/* ---------- conversões (HSV com h 0–360, s e v 0–1) ---------- */

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const rgbToHex = (rgb) => `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

const rgbToHsv = ([r, g, b]) => {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const delta = max - Math.min(rn, gn, bn);
    let h = 0;

    if (delta) {
        if (max === rn) {
            h = ((gn - bn) / delta) % 6;
        } else if (max === gn) {
            h = (bn - rn) / delta + 2;
        } else {
            h = (rn - gn) / delta + 4;
        }
    }

    return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
};

const hsvToRgb = ({ h, s, v }) => {
    const f = (n) => {
        const k = (n + h / 60) % 6;

        return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
    };

    return [f(5), f(3), f(1)];
};

const hsvToHex = (hsv) => rgbToHex(hsvToRgb(hsv));

/* Texto digitado → #rrggbb ("abc", "#AABBCC", "aabbcc"); inválido → null. */
const parseHex = (text) => {
    let clean = String(text).trim().replace(/^#/, "").toLowerCase();

    if (/^[0-9a-f]{3}$/.test(clean)) {
        clean = clean.split("").map((c) => c + c).join("");
    }

    return /^[0-9a-f]{6}$/.test(clean) ? `#${clean}` : null;
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* Um popover por vez. */
let closeCurrent = null;
let currentAnchor = null;

/*
   Abre o seletor ancorado em `anchor`.
   value: cor inicial (#rrggbb) · title: rótulo para leitores de tela.
*/
export function openColorPicker(anchor, { value, title = "Cor", onInput, onChange }) {
    if (closeCurrent) {
        const sameAnchor = currentAnchor === anchor;

        closeCurrent(true);

        /* Clicar de novo na mesma amostra só fecha. */
        if (sameAnchor) {
            return null;
        }
    }

    const original = isHex(value) ? value.toLowerCase() : "#000000";
    let hsv = rgbToHsv(hexToRgb(original));
    let current = original;
    const focusKey = anchor.dataset.focusKey;

    const swatchButton = (color, label) => {
        const button = el("button", {
            type: "button",
            class: "color-swatch",
            title: `${label ? `${label} · ` : ""}${color.toUpperCase()}`,
            "aria-label": `${label ? `${label}, ` : ""}${color.toUpperCase()}`,
            dataset: { color },
            onclick: () => {
                set(color, { fromHsv: false });
                close(true);
            }
        });

        button.style.backgroundColor = color;

        return button;
    };

    const group = ({ title: label, columns, colors, dense }) => {
        if (!colors.length) {
            return null;
        }

        const grid = el("div", {
            class: `color-swatches${dense ? " is-dense" : ""}`,
            role: "group",
            "aria-label": label
        }, colors.map(({ name, color }) => swatchButton(color, name)));

        grid.style.setProperty("--columns", String(columns));

        return el("div", { class: "color-group" }, [el("p", { class: "color-group-title", text: label }), grid]);
    };

    /* Abas de paletas (controle segmentado, como no resto do app). */
    let tab = TABS.some(([id]) => id === storageGet(TAB_KEY)) ? storageGet(TAB_KEY) : "projeto";
    const palettes = el("div", { class: "color-palettes" });
    const tabButtons = TABS.map(([id, text]) => el("button", {
        type: "button",
        class: "tab",
        role: "radio",
        onclick: () => {
            tab = id;
            storageSet(TAB_KEY, id);
            showTab();
        }
    }, text));

    const showTab = () => {
        const [, , build] = TABS.find(([id]) => id === tab);
        const groups = build().map(group).filter(Boolean);

        tabButtons.forEach((button, i) => button.setAttribute("aria-checked", String(TABS[i][0] === tab)));
        palettes.replaceChildren(...(groups.length
            ? groups
            : [el("p", { class: "settings-hint", text: "Paleta indisponível: assets/rampas_de_cores/rampas.js não carregou." })]));
        markSelected();
    };

    const markSelected = () => {
        palettes.querySelectorAll(".color-swatch").forEach((node) => {
            node.setAttribute("aria-pressed", String(node.dataset.color === current));
        });
    };

    /* Área saturação (x) × brilho (y). */
    const thumb = el("span", { class: "color-area-thumb", "aria-hidden": "true" });
    const area = el("div", {
        class: "color-area",
        role: "slider",
        tabindex: "0",
        "aria-label": "Saturação e brilho",
        onkeydown: (event) => {
            const step = event.shiftKey ? 0.1 : 0.02;
            const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
            const move = moves[event.key];

            if (move) {
                event.preventDefault();
                hsv = { ...hsv, s: clamp(hsv.s + move[0], 0, 1), v: clamp(hsv.v + move[1], 0, 1) };
                set(hsvToHex(hsv), { fromHsv: true });
            }
        }
    }, [thumb]);

    const pickFromArea = (event) => {
        const box = area.getBoundingClientRect();

        hsv = {
            ...hsv,
            s: clamp((event.clientX - box.left) / box.width, 0, 1),
            v: clamp(1 - (event.clientY - box.top) / box.height, 0, 1)
        };
        set(hsvToHex(hsv), { fromHsv: true });
    };

    area.addEventListener("pointerdown", (event) => {
        area.setPointerCapture(event.pointerId);
        area.focus();
        pickFromArea(event);
    });
    area.addEventListener("pointermove", (event) => {
        if (area.hasPointerCapture(event.pointerId)) {
            pickFromArea(event);
        }
    });

    const hue = el("input", {
        type: "range",
        class: "color-hue",
        min: "0",
        max: "359",
        step: "1",
        "aria-label": "Matiz",
        oninput: (event) => {
            hsv = { ...hsv, h: Number(event.target.value) };
            set(hsvToHex(hsv), { fromHsv: true });
        }
    });

    const preview = el("span", { class: "color-preview", "aria-hidden": "true" });
    const hex = el("input", {
        type: "text",
        class: "color-hex",
        maxlength: "7",
        spellcheck: "false",
        autocomplete: "off",
        "aria-label": "Código hexadecimal",
        onchange: (event) => {
            const parsed = parseHex(event.target.value);

            if (parsed) {
                set(parsed, { fromHsv: false });
            } else {
                event.target.value = current.toUpperCase();
            }
        }
    });

    const eyedropper = "EyeDropper" in window
        ? el("button", {
            type: "button",
            class: "icon-button color-eyedropper",
            title: "Conta-gotas: pegar uma cor da tela",
            "aria-label": "Conta-gotas",
            onclick: async () => {
                try {
                    const result = await new window.EyeDropper().open();
                    const parsed = parseHex(result.sRGBHex);

                    if (parsed) {
                        set(parsed, { fromHsv: false });
                    }
                } catch {
                    /* Cancelado. */
                }
            }
        }, [eyedropperIcon()])
        : null;

    const popover = el("div", {
        class: "color-popover",
        role: "dialog",
        "aria-label": title
    }, [
        el("div", { class: "tabs segmented color-tabs", role: "radiogroup", "aria-label": "Paletas" }, tabButtons),
        palettes,
        el("div", { class: "color-custom" }, [
            el("p", { class: "color-group-title", text: "Personalizada" }),
            area,
            hue,
            el("div", { class: "color-hex-row" }, [preview, hex, eyedropper])
        ])
    ]);

    /* Reflete a cor atual em todos os controles (e na amostra de origem). */
    const paint = ({ fromHsv }) => {
        if (!fromHsv) {
            const next = rgbToHsv(hexToRgb(current));

            /* Cinzas não têm matiz: mantém o da área para não saltar. */
            hsv = { ...next, h: next.s ? next.h : hsv.h };
        }

        area.style.setProperty("--hue", `hsl(${hsv.h} 100% 50%)`);
        thumb.style.left = `${hsv.s * 100}%`;
        thumb.style.top = `${(1 - hsv.v) * 100}%`;
        thumb.style.backgroundColor = current;
        area.setAttribute("aria-valuetext", `Saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`);
        hue.value = String(Math.round(hsv.h));
        preview.style.backgroundColor = current;

        if (document.activeElement !== hex) {
            hex.value = current.toUpperCase();
        }

        markSelected();
    };

    function set(color, options) {
        current = color.toLowerCase();
        paint(options);
        onInput?.(current);
    }

    const place = () => {
        const box = anchor.getBoundingClientRect();
        const width = popover.offsetWidth;
        const height = popover.offsetHeight;
        const margin = 8;
        const below = box.bottom + 6;
        const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, box.top - 6 - height);
        const left = clamp(box.right - width, margin, window.innerWidth - width - margin);

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
    };

    const onOutside = (event) => {
        if (!popover.contains(event.target) && !anchor.contains(event.target)) {
            close(true);
        }
    };

    const onKey = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(false);
        } else if (event.key === "Enter" && event.target !== hex && !event.target.matches("button")) {
            event.preventDefault();
            close(true);
        } else if (event.key === "Enter" && event.target === hex) {
            event.preventDefault();
            hex.dispatchEvent(new Event("change"));
            close(true);
        }
    };

    const onResize = () => close(true);
    /* Outro módulo pediu para fechar os pop-ups (ex.: a tabela abriu): guarda a cor escolhida. */
    const onCloseAll = () => close(true);

    function close(commit) {
        if (closeCurrent !== close) {
            return;
        }

        closeCurrent = null;
        currentAnchor = null;
        document.removeEventListener("pointerdown", onOutside, true);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("webgis:close-popups", onCloseAll);
        popover.remove();
        anchor.setAttribute("aria-expanded", "false");

        const final = commit ? current : original;

        if (commit && final !== original) {
            pushRecent(final);
        }

        if (final !== original || current !== original) {
            onChange?.(final);
        }

        /* A aba pode ter sido redesenhada: devolve o foco à amostra nova. */
        requestAnimationFrame(() => {
            const target = anchor.isConnected
                ? anchor
                : focusKey && document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);

            target?.focus({ preventScroll: true });
        });
    }

    closeCurrent = close;
    currentAnchor = anchor;
    popover.addEventListener("keydown", onKey);
    document.body.appendChild(popover);
    anchor.setAttribute("aria-expanded", "true");
    showTab();
    paint({ fromHsv: true });
    place();
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("webgis:close-popups", onCloseAll);

    const selected = popover.querySelector('.color-swatch[aria-pressed="true"]');

    (selected || area).focus({ preventScroll: true });

    return close;
}

/* Conta-gotas (traço, herda currentColor). */
function eyedropperIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const path = document.createElementNS(ns, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", "m14.5 6.5 3 3M4 20l1-4 9.5-9.5 3 3L8 19l-4 1Zm12.5-15.5a2.1 2.1 0 0 1 3 3L18 9.5l-3-3 1.5-1.5Z");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    return svg;
}
