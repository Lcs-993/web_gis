/* ============================================================
   TEMA DO MAPA (simbologia por atributo)

   Dois tipos, escolhidos pelo papel do atributo (schema):
   - categoria: cada valor distinto recebe a sua própria cor —
     nenhum valor é agrupado ou resumido. Cores da paleta padrão
     (alto contraste) ou de uma rampa (js/data/ramps.js);
   - faixas de valor (atributos numéricos): os valores são
     divididos em classes (Jenks, quantis ou intervalos iguais) e
     cada classe recebe uma cor da rampa, do menor ao maior.
   Vazios têm cor própria nos dois.

   Saída: { kind, field, classes, empty, outside?, colors, classIndex }
   - classes: [{ key, count, color }] (categoria) ou
     [{ key, min, max, count, color }] (faixas);
   - outside: só nas faixas digitadas à mão, valores fora de todas;
   - colors: cor de cada feição, indexado pelo uid;
   - classIndex: classe de cada feição (−1 = vazio, −2 = fora das
     classes), indexado pelo uid.
   ============================================================ */

import { getAttribute, isEmpty, toNumber } from "./values.js";
import { isCategory, isMetric } from "./schema.js";
import { breaks, hasRamp, rampColors } from "./ramps.js";

/* Numérico com pelo menos dois valores diferentes: dá para fazer faixas. */
export const isGraduable = (attribute) =>
    isMetric(attribute) && Boolean(attribute.range) && attribute.range.max > attribute.range.min;

/* Podem virar tema: categorias e números com faixa. */
export const isThemeable = (attribute) => isCategory(attribute) || isGraduable(attribute);

export const themeKind = (attribute) => isCategory(attribute) ? "category" : "numeric";

/*
   Paleta categórica terrosa para os 12 primeiros valores:
   terracota, mostarda, verde-cana, azul-ardósia, vinho, areia,
   rosa-barro, lilás, palha, ameixa, barro e argila. Escolhida para
   continuar distinta com daltonismo vermelho-verde (menor ΔE
   simulado ≈ 11, contra ≈ 3 da paleta anterior) e sem tons muito
   escuros, que somem sobre o satélite.
*/
export const CATEGORY_PALETTE = [
    "#d9693f", "#f2c14e", "#5e9e4a", "#4f86b8",
    "#9a3b5c", "#eadcbc", "#d98c8c", "#c9b3e0",
    "#e3d58a", "#c784a8", "#b23a3a", "#f0a46a"
];

export const EMPTY_COLOR = "#5a5a5a";

/* Ângulo de ouro: matizes sucessivos ficam o mais afastados possível. */
const GOLDEN_ANGLE = 137.508;

/* HSL → #rrggbb (o KML só entende hex). */
const hslToHex = (h, s, l) => {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));

        return Math.round(value * 255).toString(16).padStart(2, "0");
    };

    return `#${f(0)}${f(8)}${f(4)}`;
};

/*
   Cor do i-ésimo valor. Depois da paleta fixa, as cores são
   geradas por ângulo de ouro no matiz, alternando saturação e
   luminosidade para separar valores de matiz próximo.
*/
export const categoryColor = (index) => {
    if (index < CATEGORY_PALETTE.length) {
        return CATEGORY_PALETTE[index];
    }

    const n = index - CATEGORY_PALETTE.length;
    const hue = Math.round((n * GOLDEN_ANGLE + 20) % 360);
    const saturation = [72, 58, 85][n % 3];
    const lightness = [55, 68, 45][Math.floor(n / 3) % 3];

    return hslToHex(hue, saturation, lightness);
};


function buildCategoryTheme(features, attribute, { ramp = null, invert = false } = {}) {
    const counts = new Map();
    let emptyCount = 0;

    features.forEach((feature) => {
        const raw = getAttribute(feature, attribute.name);

        if (isEmpty(raw)) {
            emptyCount++;
            return;
        }

        const key = String(raw);

        counts.set(key, (counts.get(key) || 0) + 1);
    });

    /* Mais frequentes primeiro (ganham as cores mais distintas); empate em ordem natural. */
    const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR", { numeric: true }));

    /* Com rampa, as cores seguem a ordem natural dos valores (a rampa "lê" da primeira à última). */
    const rampOrder = hasRamp(ramp)
        ? sorted.map(([key]) => key).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
        : null;
    const palette = rampOrder ? rampColors(ramp, rampOrder.length, { invert }) : null;
    const rampColorOf = rampOrder ? new Map(rampOrder.map((key, i) => [key, palette[i]])) : null;

    const classes = sorted.map(([key, count], index) => ({
        key,
        count,
        color: rampColorOf ? rampColorOf.get(key) : categoryColor(index)
    }));

    const indexByKey = new Map(classes.map((item, index) => [item.key, index]));
    const classIndex = features.map((feature) => {
        const raw = getAttribute(feature, attribute.name);

        return isEmpty(raw) ? -1 : indexByKey.get(String(raw));
    });

    return {
        kind: "category",
        field: attribute.name,
        classes,
        empty: emptyCount ? { count: emptyCount, color: EMPTY_COLOR } : null,
        colors: classIndex.map((index) => index < 0 ? EMPTY_COLOR : classes[index].color),
        classIndex
    };
}


/* Mais classes que isso não cabem numa legenda legível. */
export const MAX_CLASSES = 32;

/* Cor dos valores que não caem em nenhuma classe digitada à mão. */
export const OUTSIDE_COLOR = "#9a9a9a";

/* Limites digitados: pares [mín, máx] válidos, em ordem crescente do mínimo. */
export const cleanLimits = (limits) => (Array.isArray(limits) ? limits : [])
    .filter((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((value) => Number.isFinite(value)))
    .map(([low, high]) => low <= high ? [low, high] : [high, low])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1])
    .slice(0, MAX_CLASSES);

/*
   Faixas de valor. Automático: quebras (Jenks, quantis ou
   intervalos iguais) com "classes" classes contíguas. Manual
   (method "manual"): os pares [mín, máx] de "limits", digitados
   no painel Estilos para este atributo (limitsField); podem deixar buracos (valores fora de todas
   as classes vão para "fora das classes", classIndex −2).
   Um valor que cai num limite compartilhado fica na classe de baixo.
*/
function buildNumericTheme(features, attribute, { ramp, invert = false, method = "jenks", classes: wanted = 5, limits: typed = null, limitsField = null } = {}) {
    const values = features.map((feature) => {
        const raw = getAttribute(feature, attribute.name);

        return isEmpty(raw) ? null : toNumber(raw);
    });

    /* Limites digitados valem só para o atributo em que foram digitados. */
    const manualPairs = method === "manual" && limitsField === attribute.name ? cleanLimits(typed) : [];
    const manual = manualPairs.length > 0;
    let pairs;

    if (manual) {
        pairs = manualPairs;
    } else {
        const cuts = breaks(values.filter((value) => value !== null), Math.min(MAX_CLASSES, Math.max(1, wanted)), method === "manual" ? "jenks" : method);

        pairs = cuts.length > 1
            ? cuts.slice(0, -1).map((low, i) => [low, cuts[i + 1]])
            : cuts.length ? [[cuts[0], cuts[0]]] : [];
    }

    const count = pairs.length;
    const palette = hasRamp(ramp)
        ? rampColors(ramp, count, { invert })
        : Array.from({ length: count }, (_, i) => categoryColor(i));

    const classes = pairs.map(([min, max], i) => ({
        key: String(i),
        min,
        max,
        count: 0,
        color: palette[i]
    }));

    const classOf = (value) => {
        for (let i = 0; i < count; i++) {
            if (value >= classes[i].min && value <= classes[i].max) {
                return i;
            }
        }

        return -2;
    };

    let emptyCount = 0;
    let outsideCount = 0;

    const classIndex = values.map((value) => {
        if (value === null || !count) {
            emptyCount++;
            return -1;
        }

        const index = classOf(value);

        if (index < 0) {
            outsideCount++;
        } else {
            classes[index].count++;
        }

        return index;
    });

    return {
        kind: "numeric",
        field: attribute.name,
        method: manual ? "manual" : method === "manual" ? "jenks" : method,
        classes,
        empty: emptyCount ? { count: emptyCount, color: EMPTY_COLOR } : null,
        outside: outsideCount ? { count: outsideCount, color: OUTSIDE_COLOR } : null,
        colors: classIndex.map((index) => index === -1 ? EMPTY_COLOR : index === -2 ? OUTSIDE_COLOR : classes[index].color),
        classIndex
    };
}


/* Tema de um atributo, com as opções do tipo dele (ver THEME_DEFAULTS em config.js). */
export function buildTheme(features, attribute, options = {}) {
    return themeKind(attribute) === "category"
        ? buildCategoryTheme(features, attribute, options)
        : buildNumericTheme(features, attribute, options);
}
