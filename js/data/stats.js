/* Agregações genéricas sobre um conjunto de features. */

import { getAttribute, isEmpty, toNumber } from "./values.js";


/*
   Operadores do agrupamento. "count" conta as features do grupo
   e dispensa métrica; os demais aplicam-se aos valores numéricos
   da métrica (vazios são ignorados).
*/
export const GROUP_OPERATORS = [
    { id: "count", label: "Contagem", needsMetric: false, additive: true },
    { id: "sum", label: "Soma", needsMetric: true, additive: true },
    { id: "mean", label: "Média", needsMetric: true, additive: false },
    { id: "min", label: "Mínimo", needsMetric: true, additive: false },
    { id: "max", label: "Máximo", needsMetric: true, additive: false }
];

const emptyAccumulator = (key) => ({ key, count: 0, n: 0, sum: 0, min: Infinity, max: -Infinity });

const merge = (target, source) => {
    target.count += source.count;
    target.n += source.n;
    target.sum += source.sum;
    target.min = Math.min(target.min, source.min);
    target.max = Math.max(target.max, source.max);

    return target;
};

/* Valor final do grupo para o operador; null quando não há valor numérico. */
const valueOf = (group, operator) => {
    switch (operator) {
        case "count":
            return group.count;
        case "sum":
            return group.n ? group.sum : null;
        case "mean":
            return group.n ? group.sum / group.n : null;
        case "min":
            return group.n ? group.min : null;
        case "max":
            return group.n ? group.max : null;
        default:
            return null;
    }
};


/*
   Agrupa por um atributo e calcula, por grupo, o operador sobre a
   métrica (ou a contagem). Retorna os `limit` maiores grupos e um
   grupo "outros" com o restante, calculado sobre os valores
   originais (a média de "outros" é a média real, não a média das
   médias). `share` (participação %) só existe para operadores
   aditivos (contagem e soma).
*/
export function groupBy(features, attribute, metric, operator = "count", limit = 10) {
    const groups = new Map();
    const usesMetric = operator !== "count" && metric;

    for (let i = 0; i < features.length; i++) {
        const raw = getAttribute(features[i], attribute.name);
        const key = isEmpty(raw) ? null : String(raw);
        let group = groups.get(key);

        if (!group) {
            group = emptyAccumulator(key);
            groups.set(key, group);
        }

        group.count++;

        if (usesMetric) {
            const value = toNumber(getAttribute(features[i], metric.name));

            if (value !== null) {
                group.n++;
                group.sum += value;

                if (value < group.min) {
                    group.min = value;
                }

                if (value > group.max) {
                    group.max = value;
                }
            }
        }
    }

    const rows = Array.from(groups.values()).map((group) => ({
        key: group.key,
        count: group.count,
        value: valueOf(group, operator),
        accumulator: group
    }));

    /* Maiores primeiro; grupos sem valor numérico vão para o fim. */
    rows.sort((a, b) => {
        if (a.value === null || b.value === null) {
            return a.value === b.value ? 0 : a.value === null ? 1 : -1;
        }

        return b.value - a.value;
    });

    const top = rows.slice(0, limit);
    const rest = rows.slice(limit);

    const others = rest.length
        ? (() => {
            const accumulator = rest.reduce((acc, row) => merge(acc, row.accumulator), emptyAccumulator(null));

            return { key: null, isOthers: true, groups: rest.length, count: accumulator.count, value: valueOf(accumulator, operator) };
        })()
        : null;

    const definition = GROUP_OPERATORS.find((item) => item.id === operator);
    const total = definition && definition.additive
        ? rows.reduce((acc, row) => acc + (row.value || 0), 0)
        : null;

    /*
       Valor do conjunto inteiro (linha de total): soma/contagem
       total, média real de todas as feições, mínimo/máximo geral.
    */
    const overall = valueOf(
        rows.reduce((acc, row) => merge(acc, row.accumulator), emptyAccumulator(null)),
        operator
    );

    return { operator, rows: top, others, total, overall, groupCount: rows.length };
}


/* ---------------- totais por coluna (rodapé da tabela) ---------------- */

/*
   Operadores do rodapé. numeric: só para colunas numéricas;
   os demais valem para qualquer coluna. Vazios são ignorados.
*/
export const COLUMN_OPERATORS = [
    { id: "none", label: "—" },
    { id: "sum", label: "Soma", numeric: true },
    { id: "mean", label: "Média", numeric: true },
    { id: "median", label: "Mediana", numeric: true },
    { id: "min", label: "Mínimo", numeric: true },
    { id: "max", label: "Máximo", numeric: true },
    { id: "std", label: "Desvio padrão", numeric: true },
    { id: "count", label: "Preenchidos" },
    { id: "distinct", label: "Distintos" }
];

export const columnOperatorsFor = (numeric) =>
    COLUMN_OPERATORS.filter((operator) => numeric || !operator.numeric);

/* Resultado do operador sobre a coluna; null quando não há valor. */
export function columnSummary(features, attribute, operator) {
    if (operator === "none") {
        return null;
    }

    if (operator === "count" || operator === "distinct") {
        const seen = new Set();
        let filled = 0;

        features.forEach((feature) => {
            const value = getAttribute(feature, attribute.name);

            if (!isEmpty(value)) {
                filled++;

                if (operator === "distinct") {
                    seen.add(String(value).trim().toLowerCase());
                }
            }
        });

        return operator === "count" ? filled : seen.size;
    }

    const values = [];

    features.forEach((feature) => {
        const number = toNumber(getAttribute(feature, attribute.name));

        if (number !== null) {
            values.push(number);
        }
    });

    if (!values.length) {
        return null;
    }

    const sum = values.reduce((total, value) => total + value, 0);
    const mean = sum / values.length;

    switch (operator) {
        case "sum":
            return sum;
        case "mean":
            return mean;
        case "min":
            return values.reduce((low, value) => Math.min(low, value), Infinity);
        case "max":
            return values.reduce((high, value) => Math.max(high, value), -Infinity);
        case "median": {
            const sorted = [...values].sort((a, b) => a - b);
            const middle = Math.floor(sorted.length / 2);

            return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        }
        case "std": {
            /* Desvio padrão amostral (n − 1); com um valor só, 0. */
            if (values.length < 2) {
                return 0;
            }

            const squares = values.reduce((total, value) => total + (value - mean) ** 2, 0);

            return Math.sqrt(squares / (values.length - 1));
        }
        default:
            return null;
    }
}
