/* ============================================================
   PRODUÇÃO E HISTÓRICO DA SAFRA — SIMULADOS (provisório)

   NÃO são dados reais. Os atributos de produção e de datas do
   arquivo dos talhões (Estágio de corte, TCH, Produção (t.),
   Data de plantio) estão vazios; para avaliar o desenho do cartão
   enquanto não chegam, este módulo gera, por talhão:

   - produção da safra: estágio de corte, TCH, produção, ATR, TAH,
     comparação com a safra anterior e a próxima colheita;
   - histórico: as operações da safra numa linha do tempo
     (colheita e tratos de soqueira; reforma e plantio nas áreas
     sem cana), realizadas até hoje e previstas depois.

   Coerente com o NDVI simulado: o mês da colheita é o mesmo da
   queda do NDVI (js/data/mock-random.js). Determinístico: o mesmo
   talhão gera sempre os mesmos números.

   Ligado por popup.production / popup.history = "simulado" em
   js/config.js. Para tirar, apague essas linhas (e este arquivo,
   quando houver dado real). Com os atributos preenchidos no
   arquivo, o cartão já usa os dados reais e ignora a simulação.
   ============================================================ */

import { getAttribute, toNumber } from "./values.js";
import { simulatedHarvestMonth, unitRandom } from "./mock-random.js";

/* Safra do Centro-Sul: abril de um ano a março do seguinte. */
const SEASON_START_MONTH = 3;

const DAY = 86400000;

const STAGES = ["1º corte", "2º corte", "3º corte", "4º corte", "5º corte", "6º corte"];

/* TCH típico por estágio (a produtividade cai a cada corte). */
const STAGE_TCH = [112, 96, 86, 78, 72, 66];

const between = (next, low, high) => low + next() * (high - low);

const utc = (year, month, day) => Date.UTC(year, month, day);

/* Safra que contém a data: "2026/27" e o ano de início. */
export const seasonOf = (time) => {
    const date = new Date(time);
    const start = date.getUTCMonth() >= SEASON_START_MONTH ? date.getUTCFullYear() : date.getUTCFullYear() - 1;

    return { start, label: `${start}/${String((start + 1) % 100).padStart(2, "0")}` };
};

const isWithoutCane = (feature) =>
    /^s\s*\/?\s*cana$/i.test(String(getAttribute(feature, "Variedade") ?? "").trim());

/*
   {
     season: "2026/27", fallow: false,
     production: { stage, tch, previousTch, production, atr, tah, area, harvest, nextHarvest },
     operations: [{ time, title, detail, done }]   (em ordem de data)
   }
   areaField: atributo com a área em hectares (ex.: "Área (ha.)").
*/
export function simulatedSeason(layer, feature, { areaField = null, now = Date.now() } = {}) {
    const next = unitRandom(layer, feature, "safra");
    const { start, label } = seasonOf(now);
    const area = areaField ? toNumber(getAttribute(feature, areaField)) : null;
    const fallow = isWithoutCane(feature);

    /* Colheita desta safra: mesmo mês da queda do NDVI simulado. */
    const harvestMonth = simulatedHarvestMonth(layer, feature);
    const harvestYear = harvestMonth >= SEASON_START_MONTH ? start : start + 1;
    const harvest = utc(harvestYear, harvestMonth, 3 + Math.floor(next() * 24));
    const at = (days) => harvest + Math.round(days) * DAY;

    const operations = [];
    const add = (time, title, detail) => operations.push({ time, title, detail });

    let production;

    if (fallow) {
        /* Área sem cana: reforma do canavial, plantio no fim da safra. */
        add(at(-between(next, 20, 40)), "Último corte (eliminação da soqueira)", "Área entra em reforma");
        add(at(between(next, 10, 25)), "Dessecação", "Glifosato · 3 L/ha");
        add(at(between(next, 35, 55)), "Calagem e gessagem", `Calcário ${between(next, 1.5, 3).toFixed(1).replace(".", ",")} t/ha`);
        add(at(between(next, 60, 85)), "Preparo de solo", "Gradagem pesada e subsolagem");
        add(at(between(next, 120, 160)), "Plantio (meiosi)", "Mudas pré-brotadas");
        add(at(between(next, 200, 240)), "Plantio da área total", "Cana de ano e meio");

        production = {
            stage: "Reforma",
            tch: null,
            previousTch: null,
            production: null,
            atr: null,
            tah: null,
            area,
            harvest: null,
            /* Cana de ano e meio: primeira colheita na safra seguinte à próxima. */
            nextHarvest: utc(start + 2, 4 + Math.floor(next() * 4), 1 + Math.floor(next() * 27))
        };
    } else {
        const stageIndex = Math.min(STAGES.length - 1, Math.floor(next() * STAGES.length));
        const tch = STAGE_TCH[stageIndex] * between(next, 0.85, 1.12);
        /* 1º corte: a cana foi plantada na safra anterior, não houve colheita para comparar. */
        const previousTch = stageIndex ? STAGE_TCH[stageIndex - 1] * between(next, 0.85, 1.1) : null;
        const atr = between(next, 128, 146);

        add(at(-between(next, 30, 45)), "Aplicação de maturador", "Via aérea · Trinexapac-etil");
        add(at(-between(next, 5, 15)), "Estimativa pré-colheita", `${Math.round(tch)} t/ha estimadas`);
        add(harvest, "Colheita mecanizada", `${STAGES[stageIndex]} · ${tch.toFixed(1).replace(".", ",")} t/ha`);
        add(at(between(next, 8, 20)), "Aplicação de vinhaça", `${Math.round(between(next, 90, 150))} m³/ha`);
        add(at(between(next, 25, 40)), "Cultivo de soqueira", "Quebra-lombo e adubação");
        add(at(between(next, 45, 70)), "Herbicida pré-emergente", "Sulfentrazona + diurom");
        add(at(between(next, 100, 140)), "Controle biológico da broca", "Cotesia flavipes · 6.000/ha");
        add(at(between(next, 160, 200)), "Levantamento de pragas", "Broca e cigarrinha");

        /* Calendário da safra: cigarrinha na estação das chuvas e estimativa em fevereiro. */
        add(utc(start, 11, 2 + Math.floor(next() * 25)), "Controle de cigarrinha", "Inseticida sistêmico · com as chuvas");
        add(utc(start + 1, 1, 2 + Math.floor(next() * 24)), `Estimativa de safra ${start + 1}/${String((start + 2) % 100).padStart(2, "0")}`, "Amostragem de colmos");

        const nextHarvest = at(between(next, 350, 375));

        add(nextHarvest, "Próxima colheita (prevista)", STAGES[Math.min(STAGES.length - 1, stageIndex + 1)]);

        production = {
            stage: STAGES[stageIndex],
            tch,
            previousTch,
            production: area !== null ? tch * area : null,
            atr,
            tah: (tch * atr) / 1000,
            area,
            harvest,
            /* Próxima colheita: cerca de um ano depois. */
            nextHarvest
        };
    }

    /* Só o que cai dentro da safra (1º de abril a 31 de março). */
    const seasonStart = utc(start, SEASON_START_MONTH, 1);
    const seasonEnd = utc(start + 1, SEASON_START_MONTH, 1);
    const inSeason = operations
        .filter((operation) => operation.time >= seasonStart && operation.time < seasonEnd)
        .sort((a, b) => a.time - b.time);

    inSeason.forEach((operation) => {
        operation.done = operation.time <= now;
    });

    return { season: label, fallow, production, operations: inSeason };
}
