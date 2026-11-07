/* ============================================================
   FILTROS GENÉRICOS

   Filtro = { field, type, operator, value, valueTo, values? }
   Os operadores dependem apenas do tipo do atributo.

   "in" (é um de) usa values: lista de valores aceitos; null na
   lista aceita vazios. É criado pelo filtro de coluna da tabela
   (createListFilter) e não aparece no seletor do painel Filtros.

   Valores vazios (null, undefined, "") não passam em nenhuma
   comparação — exceto "≠", "não contém" e "vazio", em que a
   ausência de valor satisfaz a condição.
   ============================================================ */

import { getAttribute, isEmpty, normalizeText, toBoolean, toNumber, toTime } from "./values.js";

const OPERATORS = {
    string: [
        { id: "contains", label: "contém", needsValue: true },
        { id: "notContains", label: "não contém", needsValue: true },
        { id: "equals", label: "é igual a", needsValue: true },
        { id: "notEquals", label: "é diferente de", needsValue: true },
        { id: "in", label: "é um de", hidden: true },
        { id: "empty", label: "está vazio" },
        { id: "notEmpty", label: "está preenchido" }
    ],
    /* Na interface, números usam o controle de intervalo (entre / igual a). */
    number: [
        { id: "equals", label: "igual a", needsValue: true },
        { id: "notEquals", label: "diferente de", needsValue: true },
        { id: "gt", label: "maior que", needsValue: true },
        { id: "gte", label: "maior ou igual a", needsValue: true },
        { id: "lt", label: "menor que", needsValue: true },
        { id: "lte", label: "menor ou igual a", needsValue: true },
        { id: "between", label: "entre", needsValue: true, needsRange: true },
        { id: "empty", label: "está vazio" },
        { id: "notEmpty", label: "está preenchido" }
    ],
    date: [
        { id: "equals", label: "em", needsValue: true },
        { id: "lt", label: "antes de", needsValue: true },
        { id: "gt", label: "depois de", needsValue: true },
        { id: "between", label: "entre", needsValue: true, needsRange: true },
        { id: "empty", label: "está vazio" },
        { id: "notEmpty", label: "está preenchido" }
    ],
    boolean: [
        { id: "isTrue", label: "é verdadeiro" },
        { id: "isFalse", label: "é falso" },
        { id: "empty", label: "está vazio" }
    ]
};

/* Operadores oferecidos no painel Filtros (sem os de uso interno, como "in"). */
export const operatorsFor = (type) => (OPERATORS[type] || OPERATORS.string).filter((operator) => !operator.hidden);

export const findOperator = (type, id) =>
    (OPERATORS[type] || OPERATORS.string).find((operator) => operator.id === id) || null;


/* Normaliza o valor de comparação conforme o tipo. */
const coerce = (type, value) => {
    if (type === "number") {
        return toNumber(value);
    }

    if (type === "date") {
        const time = toTime(value);

        /* Compara por dia: "2024-05-01" casa com "2024-05-01T13:00". */
        return time === null ? null : Math.floor(time / 86400000);
    }

    return isEmpty(value) ? null : normalizeText(value) || null;
};


/* Valida e completa um filtro vindo da interface. Retorna null se inválido. */
export function createFilter(attribute, operatorId, value, valueTo) {
    const operator = findOperator(attribute.type, operatorId);

    if (!operator) {
        return null;
    }

    const filter = {
        field: attribute.name,
        type: attribute.type,
        operator: operator.id,
        value: operator.needsValue ? String(value ?? "").trim() : "",
        valueTo: operator.needsRange ? String(valueTo ?? "").trim() : ""
    };

    if (operator.needsValue && coerce(filter.type, filter.value) === null) {
        return null;
    }

    if (operator.needsRange && coerce(filter.type, filter.valueTo) === null) {
        return null;
    }

    return filter;
}


/*
   Filtro "é um de" (lista de valores marcados). null na lista
   representa "(vazio)". Lista vazia → null (sem filtro).
*/
export function createListFilter(attribute, values) {
    if (!values || !values.length) {
        return null;
    }

    return {
        field: attribute.name,
        type: "string",
        operator: "in",
        value: "",
        valueTo: "",
        values: values.map((value) => (value === null ? null : String(value)))
    };
}


/* Número legível: vírgula decimal, sem separador de milhar (códigos). */
const formatNumber = (value) =>
    Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 6, useGrouping: false });


/* Descrição em palavras, sem símbolos: "Valor por ha.: de 130 a 470". */
export function describeFilter(filter) {
    const operator = findOperator(filter.type, filter.operator);
    const label = operator ? operator.label : filter.operator;
    const show = (value) => filter.type === "number" ? formatNumber(value) : value;

    if (filter.operator === "in") {
        const names = (filter.values || []).map((value) => (value === null ? "(vazio)" : value));
        const shown = names.slice(0, 3).join(", ");

        return `${filter.field}: ${shown}${names.length > 3 ? ` (+${names.length - 3})` : ""}`;
    }

    if (filter.type === "number" && filter.operator === "between") {
        const low = Math.min(Number(filter.value), Number(filter.valueTo));
        const high = Math.max(Number(filter.value), Number(filter.valueTo));

        return `${filter.field}: de ${formatNumber(low)} a ${formatNumber(high)}`;
    }

    if (operator && operator.needsRange) {
        return `${filter.field}: ${label} ${show(filter.value)} e ${show(filter.valueTo)}`;
    }

    return operator && operator.needsValue
        ? `${filter.field}: ${label} ${show(filter.value)}`
        : `${filter.field}: ${label}`;
}


/* Compila o filtro em um predicado (feature) => boolean. */
function compile(filter) {
    const expected = coerce(filter.type, filter.value);
    const expectedTo = coerce(filter.type, filter.valueTo);
    const read = (feature) => getAttribute(feature, filter.field);

    switch (filter.operator) {
        case "empty":
            return (feature) => isEmpty(read(feature));
        case "notEmpty":
            return (feature) => !isEmpty(read(feature));
        case "isTrue":
            return (feature) => toBoolean(read(feature)) === true;
        case "isFalse":
            return (feature) => toBoolean(read(feature)) === false;
        case "in": {
            const accepted = new Set();
            let acceptsEmpty = false;

            (filter.values || []).forEach((value) => {
                if (value === null) {
                    acceptsEmpty = true;
                } else {
                    accepted.add(normalizeText(value));
                }
            });

            return (feature) => {
                const actual = read(feature);

                return isEmpty(actual) ? acceptsEmpty : accepted.has(normalizeText(actual));
            };
        }
        default:
            break;
    }

    return (feature) => {
        const actual = coerce(filter.type, read(feature));

        switch (filter.operator) {
            case "contains":
                return actual !== null && actual.includes(expected);
            case "notContains":
                return actual === null || !actual.includes(expected);
            case "equals":
                return actual !== null && actual === expected;
            case "notEquals":
                return actual === null || actual !== expected;
            case "gt":
                return actual !== null && actual > expected;
            case "gte":
                return actual !== null && actual >= expected;
            case "lt":
                return actual !== null && actual < expected;
            case "lte":
                return actual !== null && actual <= expected;
            case "between": {
                const low = Math.min(expected, expectedTo);
                const high = Math.max(expected, expectedTo);

                return actual !== null && actual >= low && actual <= high;
            }
            default:
                return true;
        }
    };
}


/* Índices (uid) das features que passam em todos os filtros. */
export function applyFilters(features, filters) {
    const predicates = filters.map(compile);
    const result = [];

    for (let uid = 0; uid < features.length; uid++) {
        const feature = features[uid];
        let pass = true;

        for (let i = 0; i < predicates.length; i++) {
            if (!predicates[i](feature)) {
                pass = false;
                break;
            }
        }

        if (pass) {
            result.push(uid);
        }
    }

    return result;
}
