/* ============================================================
   MARCADORES ILUSTRADOS DO MAPA

   Ilustrações com volume e cores próprias (não seguem o tema):
   usina, ocorrências (daninhas, pragas, fogo) e clima (chuva,
   vento). Sempre a partir do PNG grande, reduzido por iconSize,
   com a âncora na base da ilustração. Sem filtros, contornos ou
   sombras extras: os arquivos já têm sombra própria.

   Arquivos em assets/png/ (a usina, em assets/sgv/). Ao trocar uma
   imagem, atualize aqui a largura e a altura reais do arquivo.

   Tabela: largura × altura do arquivo (px) e a âncora (x, y) no
   arquivo: o pixel que fica sobre a coordenada.
   ============================================================ */

const MARKERS = {
    usina: { url: "assets/sgv/icone_usina_canavieira.png", width: 443, height: 620, anchor: [215, 583] },
    daninhas: { url: "assets/png/daninhas.png", width: 284, height: 324 },
    pragas: { url: "assets/png/pragas.png", width: 358, height: 274 },
    fogo: { url: "assets/png/fogo.png", width: 292, height: 375 },
    chuva: { url: "assets/png/chuva.png", width: 407, height: 449 },
    vento: { url: "assets/png/vento.png", width: 378, height: 324 }
};

/* Sem âncora na tabela: centro na horizontal, 95% da altura (a base). */
const anchorOf = (marker) => marker.anchor || [marker.width / 2, marker.height * 0.95];

/*
   Medidas do marcador na altura pedida (px na tela), proporcionais
   ao arquivo. Sem Leaflet: serve também para config.js e listas.
*/
export function especificacaoIcone(nome, altura = 56) {
    const marker = MARKERS[nome];

    if (!marker) {
        throw new Error(`Marcador desconhecido: "${nome}"`);
    }

    const scale = altura / marker.height;
    const [ax, ay] = anchorOf(marker);
    const size = [Math.round(marker.width * scale), Math.round(altura)];
    const anchor = [Math.round(ax * scale), Math.round(ay * scale)];

    return {
        url: marker.url,
        size,
        anchor,
        /* Pop-up sai do topo da ilustração, centrado na âncora. */
        popupAnchor: [0, -anchor[1]]
    };
}

/* L.icon pronto para L.marker: criarIconeMapa("fogo"), criarIconeMapa("usina", 64). */
export function criarIconeMapa(nome, altura = 56) {
    const spec = especificacaoIcone(nome, altura);

    return window.L.icon({
        iconUrl: spec.url,
        iconSize: spec.size,
        iconAnchor: spec.anchor,
        popupAnchor: spec.popupAnchor,
        className: "feature-marker"
    });
}

export const MARCADORES_DISPONIVEIS = Object.keys(MARKERS);
