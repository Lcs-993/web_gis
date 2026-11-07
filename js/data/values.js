/* Utilitários de valor compartilhados por schema, filtros, busca e estatísticas. */

export const isEmpty = (value) =>
    value === null || value === undefined || value === "";

/* Número finito ou null. Aceita números e strings numéricas. */
export const toNumber = (value) => {
    if (isEmpty(value) || typeof value === "boolean") {
        return null;
    }

    const number = typeof value === "number" ? value : Number(value);

    return Number.isFinite(number) ? number : null;
};

/* Timestamp (ms) ou null. */
export const toTime = (value) => {
    if (isEmpty(value)) {
        return null;
    }

    const time = Date.parse(String(value));

    return Number.isNaN(time) ? null : time;
};

export const toBoolean = (value) => {
    if (typeof value === "boolean") {
        return value;
    }

    const text = String(value).trim().toLowerCase();

    if (text === "true") {
        return true;
    }

    if (text === "false") {
        return false;
    }

    return null;
};

export const getAttribute = (feature, name) =>
    feature && feature.properties ? feature.properties[name] : undefined;

/* Faixa de marcas combinantes (U+0300–U+036F) separadas pelo NFD. */
const COMBINING_MARKS = new RegExp(
    "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
    "g"
);

/* Aspas e apóstrofos somem: "D'AGUA" e "DAGUA" viram o mesmo texto. */
const QUOTES = /['"‘’ʼ“”`´]/g;

/* Demais separadores viram espaço: "40002-ALTO" → "40002 alto". */
const SEPARATORS = /[^\p{L}\p{N}]+/gu;

/* Texto comparável: sem acento, sem caixa, sem pontuação. */
export const normalizeText = (value) =>
    String(value)
        .normalize("NFD")
        .replace(COMBINING_MARKS, "")
        .toLowerCase()
        .replace(QUOTES, "")
        .replace(SEPARATORS, " ")
        .trim();
