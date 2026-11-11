/* ============================================================
   SIMBOLOGIA DA CAMADA (símbolo único)

   layer.color é a cor principal: preenchimento dos polígonos e
   pontos, traço das linhas e das camadas só de contorno. É ela
   que aparece no painel Camadas, na Legenda e no KML.

   layer.symbol guarda só o que o usuário mudou (null = padrão):
     fill          polígonos com preenchimento? (padrão: sim, salvo
                   nas camadas "outline" do catálogo)
     fillOpacity   0–1 (padrão: 0,35; 0,5 com tema, para a cor ser
                   lida sobre o satélite; 0,85 nos pontos)
     strokeColor   cor do contorno (com preenchimento; sem ele, o
                   contorno usa a cor principal)
     strokeWidth   espessura do contorno, em px
     pointSize     raio dos pontos, em px
     opacity       opacidade da camada inteira, 0–1

   resolveSymbol devolve os valores finais, já com os padrões,
   que o mapa (js/map/leaflet-view.js) e a janela de Propriedades
   usam. O tema (cores por atributo) troca só a cor principal de
   cada feição; contorno, espessura e opacidades continuam daqui.
   ============================================================ */

export const EMPTY_SYMBOL = Object.freeze({
    fill: null,
    fillOpacity: null,
    strokeColor: null,
    strokeWidth: null,
    pointSize: null,
    opacity: null
});

export const SYMBOL_LIMITS = Object.freeze({
    strokeWidth: { min: 0, max: 8, step: 0.1 },
    pointSize: { min: 2, max: 20, step: 1 }
});

const POLYGON_STROKE = "#ffffff";
const POINT_STROKE = "#1d1d1f";

/* Geometria predominante: decide quais controles fazem sentido. */
export const geometryKind = (layer) => {
    const types = Object.keys(layer.geometryTypes || {}).join(" ");

    if (/Polygon/.test(types)) {
        return "polygon";
    }

    if (/LineString/.test(types)) {
        return "line";
    }

    return /Point/.test(types) ? "point" : "polygon";
};

export function resolveSymbol(layer) {
    const custom = layer.symbol || EMPTY_SYMBOL;
    const kind = geometryKind(layer);
    const outline = layer.style === "outline";
    const fill = custom.fill ?? !outline;

    /* Linha ou polígono sem preenchimento: o traço é a própria cor da camada. */
    const colorOnStroke = kind === "line" || (kind === "polygon" && !fill);

    return {
        kind,
        /* Ponto desenhado com imagem: só a opacidade da camada se aplica. */
        icon: Boolean(layer.icon),
        color: layer.color,
        fill,
        colorOnStroke,
        /* null: o mapa escolhe conforme o estado (tema ligado pede mais). */
        fillOpacity: custom.fillOpacity,
        strokeColor: colorOnStroke
            ? layer.color
            : custom.strokeColor ?? (kind === "point" ? POINT_STROKE : POLYGON_STROKE),
        strokeWidth: custom.strokeWidth ?? (kind === "line" ? 2 : colorOnStroke ? 1.3 : kind === "point" ? 1 : 0.8),
        /* Divisa branca fina e translúcida por padrão; cor escolhida pelo usuário entra cheia. */
        strokeOpacity: colorOnStroke ? 1 : custom.strokeColor !== null ? 1 : kind === "point" ? 0.95 : 0.55,
        pointSize: custom.pointSize ?? 5,
        opacity: custom.opacity ?? 1,
        /* Halo escuro sob o traço claro das camadas de referência, enquanto seguem sem preenchimento. */
        halo: outline && !fill
    };
}

/* Opacidade de preenchimento "normal" (sem busca nem seleção). */
export const baseFillOpacity = (symbol, { isPoint = false, themed = false } = {}) =>
    symbol.fillOpacity ?? (isPoint ? 0.85 : themed ? 0.5 : 0.35);

export const isDefaultSymbol = (layer) =>
    Object.values(layer.symbol || EMPTY_SYMBOL).every((value) => value === null) &&
    layer.color === layer.defaultColor;
