/* ============================================================
   ESTADOS DE CARREGAMENTO E DE ERRO

   Esqueletos (blocos arredondados pulsando devagar) no lugar do
   conteúdo enquanto a camada carrega, e uma mensagem clara quando
   ela falha. Usados por painéis, tabela e lista de camadas.
   ============================================================ */

import { el } from "./dom.js";

/* Linhas de larguras variadas: parecem texto, não uma grade. */
const WIDTHS = ["92%", "74%", "86%", "60%", "80%"];

export const skeletonLine = (width = "70%") => {
    const line = el("span", { class: "skeleton skeleton-line", "aria-hidden": "true" });

    line.style.width = width;
    return line;
};

export function skeletonBlock({ lines = 3, caption = "" } = {}) {
    return el("div", { class: "skeleton-block", role: "status", "aria-live": "polite" }, [
        ...Array.from({ length: lines }, (_, index) => skeletonLine(WIDTHS[index % WIDTHS.length])),
        caption ? el("p", { class: "skeleton-caption", text: caption }) : null
    ]);
}

export function errorState({ title, detail = "" }) {
    return el("div", { class: "error-state", role: "alert" }, [
        el("p", { class: "error-state-title", text: title }),
        detail ? el("p", { class: "error-state-detail", text: detail }) : null
    ]);
}

/*
   Conteúdo para painéis da camada ativa quando ela não está pronta:
   esqueleto (carregando), erro (falhou) ou null (pronta).
*/
export function layerPendingState(layer) {
    if (!layer) {
        return el("p", { class: "panel-empty", text: "Nenhuma camada carregada." });
    }

    if (layer.status === "loading") {
        return skeletonBlock({ lines: 4, caption: `Carregando ${layer.name}…` });
    }

    if (layer.status === "error") {
        return errorState({ title: `Não foi possível carregar ${layer.name}`, detail: layer.error || "" });
    }

    return null;
}
