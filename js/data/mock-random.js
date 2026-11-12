/* ============================================================
   SORTEIO DETERMINÍSTICO (dados simulados provisórios)

   Base dos dados fictícios do cartão da feição (NDVI, produção,
   histórico de operações): a mesma feição gera sempre os mesmos
   números. A semente é a camada + os atributos de partFields
   (ex.: Fazenda + Talhão), então as partes de um talhão
   concordam entre si e com as outras seções.
   ============================================================ */

import { getAttribute } from "./values.js";

/* FNV-1a 32 bits: texto → semente. */
export const hash = (text) => {
    let h = 0x811c9dc5;

    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return h >>> 0;
};

/* mulberry32: gerador pseudoaleatório pequeno e determinístico. */
export const random = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;

    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* Chave da unidade (talhão inteiro, não a parte): camada + partFields. */
export const unitKey = (layer, feature) => {
    const keyFields = layer.partFields && layer.partFields.length ? layer.partFields : null;
    const key = keyFields
        ? keyFields.map((name) => String(getAttribute(feature, name) ?? "")).join("|")
        : JSON.stringify(feature.properties || {});

    return `${layer.id}:${key}`;
};

/*
   Gerador da unidade. Sem salt, é o mesmo do NDVI simulado (o 1º
   sorteio dele é o mês do corte); com salt, uma sequência própria.
*/
export const unitRandom = (layer, feature, salt = "") =>
    random(hash(salt ? `${unitKey(layer, feature)}#${salt}` : unitKey(layer, feature)));

/* Mês do corte (0 = jan) do NDVI simulado: abril (3) a novembro (10). */
export const simulatedHarvestMonth = (layer, feature) => 3 + Math.floor(unitRandom(layer, feature)() * 8);
