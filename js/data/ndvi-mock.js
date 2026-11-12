/* ============================================================
   NDVI SIMULADO (provisório, só para avaliar o frontend)

   NÃO são dados reais. Gera uma série mensal de NDVI (jan–dez)
   plausível para cana-de-açúcar, para desenhar a seção "Análise
   espacial" do cartão da feição enquanto não há a série real.

   - Determinística: a mesma feição gera sempre a mesma série
     (semente = camada + atributos de partFields, ex.: Fazenda +
     Talhão), então as partes de um talhão concordam entre si.
   - Curva da cana: queda no mês do corte (abr–nov, safra do
     Centro-Sul), rebrota rápida, platô e leve queda na maturação.

   Ligado por popup.ndvi: "simulado" em js/config.js. Para tirar,
   apague essa linha (e este arquivo, quando houver dado real).
   ============================================================ */

import { unitRandom } from "./mock-random.js";

export const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const round2 = (n) => Math.round(n * 100) / 100;

/* [{ month: "Jan", value: 0.42 }, …] — 12 meses. */
export function simulatedNdvi(layer, feature) {
    const next = unitRandom(layer, feature);

    /* Mês do corte entre abril (3) e novembro (10); o mesmo da produção e do histórico simulados. */
    const harvest = 3 + Math.floor(next() * 8);
    const floor = 0.18 + next() * 0.08;
    const peak = 0.72 + next() * 0.14;

    return MONTHS.map((month, index) => {
        const since = (index - harvest + 12) % 12;
        let value = floor + (peak - floor) * (1 - Math.exp(-since / 2.2));

        /* Maturação: queda leve nos dois meses antes do corte. */
        if (since >= 10) {
            value *= since === 10 ? 0.93 : 0.86;
        }

        value += (next() - 0.5) * 0.05;

        return { month, value: round2(Math.min(0.92, Math.max(0.08, value))) };
    });
}
