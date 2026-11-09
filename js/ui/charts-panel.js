/* ============================================================
   PAINEL GRÁFICOS (barra esquerda)

   Porta de entrada para os gráficos: "Adicionar gráfico" e os
   tipos com os ícones do sprite. Os tipos prontos abrem o
   Analytics no Resumo com aquele tipo; os demais ficam "Em breve".
   O gráfico em si (agrupar por, operador, métrica) continua no
   Resumo: um só lugar para configurar.
   ============================================================ */

import { byId } from "./dom.js";

export function createChartsPanel({ onPick, getCurrent }) {
    const addButton = byId("charts-add");
    const cards = Array.from(document.querySelectorAll("#panel-charts [data-chart-type]"));

    const sync = () => {
        const current = getCurrent();

        cards.forEach((card) => card.setAttribute("aria-pressed", String(card.dataset.chartType === current)));
    };

    addButton.addEventListener("click", () => {
        onPick(null);
        sync();
    });

    cards.forEach((card) => {
        card.addEventListener("click", () => {
            onPick(card.dataset.chartType);
            sync();
        });
    });

    return { sync };
}
