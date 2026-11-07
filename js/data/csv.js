/* Exportação CSV (UTF-8 com BOM, separador vírgula). */

import { getAttribute } from "./values.js";

/*
   Texto que começa com = + - @ (ou tab/CR) é interpretado como
   fórmula pelo Excel/LibreOffice. O apóstrofo neutraliza a
   fórmula sem alterar o valor visível. Números não são tocados.
*/
const FORMULA_START = /^[=+\-@\t\r]/;

const escapeCell = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    let text = typeof value === "object" ? JSON.stringify(value) : String(value);

    if (typeof value === "string" && FORMULA_START.test(text)) {
        text = `'${text}`;
    }

    return /[",\r\n]/.test(text) || text !== text.trim()
        ? `"${text.replace(/"/g, '""')}"`
        : text;
};


export function toCsv(features, attributes) {
    const header = attributes.map((attribute) => escapeCell(attribute.name)).join(",");
    const rows = features.map((feature) =>
        attributes.map((attribute) => escapeCell(getAttribute(feature, attribute.name))).join(",")
    );

    return `﻿${[header, ...rows].join("\r\n")}`;
}


/* Linhas prontas (ex.: o resumo agrupado): cabeçalho + valores, mesmo formato. */
export function rowsToCsv(header, rows) {
    return `﻿${[header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")}`;
}


export function downloadText(text, fileName, type = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/* Nome de arquivo seguro a partir do nome da camada. */
export const safeFileName = (name) =>
    String(name || "camada")
        .normalize("NFD")
        /* Tira os acentos (marcas separadas pelo NFD) antes de trocar o resto por "_". */
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase() || "camada";
