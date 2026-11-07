/* ============================================================
   SCHEMA ENGINE

   Descobre os atributos de uma camada a partir das features.
   Nenhum nome de campo é conhecido de antemão.

   Cada atributo recebe:
   - type: string | number | boolean | date
   - role: papel semântico, usado pela interface para decidir o
     que somar, agrupar, indexar e como formatar:
       measure   número com casas decimais → estatísticas
       integer   número inteiro → sem separador de milhar
       category  texto com poucos valores distintos → agrupável
       text      texto livre
       boolean   verdadeiro/falso
       date      data ISO
       empty     sem nenhum valor preenchido
   ============================================================ */

import { isEmpty, toBoolean, toNumber, toTime } from "./values.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[tT ][\d:.]+(?:[zZ]|[+-]\d{2}:?\d{2})?)?$/;

/* Strings numéricas sem zero à esquerda: "0012" é código, não número. */
const NUMERIC_STRING = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/* Limites para considerar um texto categórico. */
const CATEGORY_MAX_DISTINCT = 500;
const CATEGORY_MAX_RATIO = 0.5;

/* Valores guardados no schema para sugestão em filtros. */
const MAX_STORED_VALUES = 500;


const inferType = (values) => {
    if (values.every((value) => toBoolean(value) !== null)) {
        return "boolean";
    }

    if (values.every((value) =>
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && NUMERIC_STRING.test(value.trim()))
    )) {
        return "number";
    }

    if (values.every((value) =>
        typeof value === "string" && ISO_DATE.test(value) && toTime(value) !== null
    )) {
        return "date";
    }

    return "string";
};


const inferRole = (type, values, distinctCount) => {
    if (!values.length) {
        return "empty";
    }

    if (type === "number") {
        return values.every((value) => Number.isInteger(toNumber(value)))
            ? "integer"
            : "measure";
    }

    if (type === "boolean" || type === "date") {
        return type;
    }

    const isCategory =
        distinctCount <= CATEGORY_MAX_DISTINCT &&
        (values.length < 20 || distinctCount / values.length <= CATEGORY_MAX_RATIO);

    return isCategory ? "category" : "text";
};


/*
   Campos internos ignorados em todas as camadas (atuais e futuras):
   o identificador único "fid" que o QGIS/GeoPackage grava. Sem
   entrar no schema, ele não aparece em popup, tabela, dashboard,
   filtros, busca, rótulos, tema nem nas exportações CSV/KML.
   Comparação sem caixa: "fid", "FID", "Fid".
*/
const IGNORED_FIELDS = new Set(["fid"]);

export const isIgnoredField = (name) => IGNORED_FIELDS.has(String(name).trim().toLowerCase());

export function inferSchema(features) {
    /* Ordem de primeira aparição, como no arquivo. */
    const names = [];
    const seen = new Set();

    features.forEach((feature) => {
        Object.keys(feature.properties || {}).forEach((name) => {
            if (!seen.has(name) && !isIgnoredField(name)) {
                seen.add(name);
                names.push(name);
            }
        });
    });

    const attributes = names.map((name) => {
        const filled = [];

        features.forEach((feature) => {
            const value = feature.properties ? feature.properties[name] : undefined;

            if (!isEmpty(value)) {
                filled.push(value);
            }
        });

        const distinct = new Set(filled.map((value) => String(value)));
        const type = filled.length ? inferType(filled) : "string";
        const role = inferRole(type, filled, distinct.size);

        const values = role === "category" || role === "integer" || role === "boolean"
            ? Array.from(distinct)
                .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
                .slice(0, MAX_STORED_VALUES)
            : [];

        return {
            name,
            type,
            role,
            filled: filled.length,
            empty: features.length - filled.length,
            distinct: distinct.size,
            values,
            range: type === "number" ? numericRange(filled) : null
        };
    });

    return { attributes };
}


/* Casas decimais de um número (limitado a 6, suficiente para coordenadas e moeda). */
const decimalsOf = (number) => {
    const text = String(number);

    if (text.includes("e")) {
        return 6;
    }

    const dot = text.indexOf(".");

    return dot === -1 ? 0 : Math.min(6, text.length - dot - 1);
};


/*
   Faixa de valores de um atributo numérico, usada pelo filtro de
   intervalo: mínimo, máximo e passo (10^-casas decimais do dado).
*/
function numericRange(values) {
    let min = Infinity;
    let max = -Infinity;
    let decimals = 0;

    values.forEach((value) => {
        const number = toNumber(value);

        if (number === null) {
            return;
        }

        if (number < min) {
            min = number;
        }

        if (number > max) {
            max = number;
        }

        if (decimals < 6) {
            decimals = Math.max(decimals, decimalsOf(number));
        }
    });

    return Number.isFinite(min)
        ? { min, max, decimals, step: Number((10 ** -decimals).toFixed(decimals)) }
        : null;
}


/*
   Atributos do tipo categoria: os únicos que podem agrupar no
   dashboard ("Agrupar por") e virar tema no mapa.
*/
export const isCategory = (attribute) => attribute.role === "category";

/*
   Atributos numéricos com valores (inteiros e decimais): os que
   podem ser métrica no dashboard ("Soma de …").
*/
export const isNumeric = (attribute) => attribute.type === "number";

export const isMetric = (attribute) => isNumeric(attribute) && attribute.role !== "empty";

/* Campos indexados pela busca: medidas contínuas ficam de fora. */
export const isSearchable = (attribute) =>
    attribute.role !== "measure" && attribute.role !== "empty";
