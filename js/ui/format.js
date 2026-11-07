/* Formatação de valores para exibição, guiada pelo papel do atributo. */

import { isEmpty, toBoolean, toNumber, toTime } from "../data/values.js";

const LOCALE = "pt-BR";

export const formatCount = (value) => Number(value || 0).toLocaleString(LOCALE);

export const formatNumber = (value, maximumFractionDigits = 2) =>
    value === null || value === undefined
        ? "—"
        : Number(value).toLocaleString(LOCALE, { maximumFractionDigits });

const TYPE_LABELS = {
    measure: "número",
    integer: "inteiro",
    category: "categoria",
    text: "texto",
    boolean: "sim/não",
    date: "data",
    empty: "vazio"
};

export const roleLabel = (role) => TYPE_LABELS[role] || role;


export function formatValue(value, attribute) {
    if (isEmpty(value)) {
        return "—";
    }

    const role = attribute ? attribute.role : null;

    if (role === "integer") {
        /* Inteiros costumam ser códigos: sem separador de milhar. */
        return String(toNumber(value) ?? value);
    }

    if (role === "measure") {
        const number = toNumber(value);

        return number === null
            ? String(value)
            : number.toLocaleString(LOCALE, { maximumFractionDigits: 6 });
    }

    if (role === "boolean") {
        const flag = toBoolean(value);

        return flag === null ? String(value) : flag ? "Sim" : "Não";
    }

    if (role === "date") {
        const time = toTime(value);

        return time === null
            ? String(value)
            : new Date(time).toLocaleDateString(LOCALE, { timeZone: "UTC" });
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}
