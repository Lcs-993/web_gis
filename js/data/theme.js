/* ============================================================
   TEMA POR CATEGORIA

   Classifica as features de uma camada pelos valores de um
   atributo do tipo categoria. Cada valor distinto recebe a sua
   própria cor — nenhum valor é agrupado ou resumido. Vazios têm
   cor própria.

   Saída: { field, classes, empty, colors }, onde colors é um
   array indexado pelo uid da feature (cor de cada uma).
   ============================================================ */

import { getAttribute, isEmpty } from "./values.js";
import { isCategory } from "./schema.js";

/* Só atributos do tipo categoria podem virar tema (mesma regra do "Agrupar por"). */
export const isThemeable = isCategory;

/*
   Paleta categórica de alto contraste para os 12 primeiros
   valores, legível sobre satélite, mapa de ruas e nos dois temas.
*/
export const CATEGORY_PALETTE = [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8",
    "#f58231", "#911eb4", "#46f0f0", "#f032e6",
    "#bcf60c", "#fabebe", "#008080", "#e6beff"
];

export const EMPTY_COLOR = "#5a5a5a";

/* Ângulo de ouro: matizes sucessivos ficam o mais afastados possível. */
const GOLDEN_ANGLE = 137.508;

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

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};


export function buildCategoryTheme(features, attribute) {
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
    const classes = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR", { numeric: true }))
        .map(([key, count], index) => ({ key, count, color: categoryColor(index) }));

    const colorByKey = new Map(classes.map((item) => [item.key, item.color]));

    const colors = features.map((feature) => {
        const raw = getAttribute(feature, attribute.name);

        return isEmpty(raw) ? EMPTY_COLOR : colorByKey.get(String(raw));
    });

    return {
        field: attribute.name,
        classes,
        empty: emptyCount ? { count: emptyCount, color: EMPTY_COLOR } : null,
        colors
    };
}
