/* ============================================================
   CONFIGURAÇÃO DA APLICAÇÃO

   Único lugar com referências a dados concretos. O código da
   aplicação não conhece nenhum atributo: tudo o que aparece em
   popup, busca, filtros, dashboard e tabela é descoberto no
   schema de cada camada em tempo de execução.
   ============================================================ */

import { especificacaoIcone } from "./map/marker-icons.js";

export const MAP_OPTIONS = {
    center: [-20.0868, -46.0424],
    zoom: 17,
    minZoom: 4,
    maxZoom: 18,
    fitMaxZoom: 16
};

/* Os dois serviços usam Web Mercator e não aceitam subdomínios. */
export const BASEMAPS = [
    {
        id: "satelite",
        name: "Satélite",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution:
            'Imagery &copy; <a href="https://www.esri.com/">Esri</a> &mdash; ' +
            "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    },
    {
        id: "ruas",
        name: "Ruas",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        attribution:
            'Mapa &copy; <a href="https://www.esri.com/">Esri</a> &mdash; ' +
            "Source: Esri, HERE, Garmin, USGS, and the GIS User Community"
    }
];

/*
   Mapa base de cada tema: trocar o tema (claro/escuro) troca o
   fundo junto. Ruas combina com o claro; satélite, com o escuro.
   Depois disso o usuário pode escolher outro em Mapa base.
*/
export const THEME_BASEMAPS = {
    light: "ruas",
    dark: "satelite"
};

/*
   Catálogo de camadas carregadas na abertura.

   - url: GeoJSON FeatureCollection em WGS84 (CRS84 / EPSG:4326).
     Prefira arquivos da pasta geojson/ (servidos pelo próprio site,
     com compressão) ou URLs remotas fixadas em um commit ou tag: uma
     branch muda sem aviso.
   - name: opcional; sem ele vale o "name" do próprio GeoJSON.
   - color: cor base da simbologia.
   - visible: estado inicial.
   - active: opcional; camada ativa na abertura (a que alimenta busca,
     filtros e dashboard). Sem ela, vale a primeira da lista.
   - style: opcional; "outline" desenha só o contorno, sem
     preenchimento (camadas de referência). Padrão: "fill".
   - interactive: opcional; false faz a camada ignorar cliques
     (sem popup nem seleção), para não roubar o clique das outras.
   - labels: opcional; rótulos na abertura:
       { visible: true, fields: ["atributo", "outro"], minZoom: 13 }
     fields: um atributo por linha do rótulo, na ordem.
     minZoom: rótulos só a partir desse zoom. Campo inexistente no
     arquivo cai no primeiro atributo com valores.
   - keepLast: opcional; fixa a camada no fim da lista do painel,
     mesmo com camadas adicionadas depois.
   - partFields: opcional; atributos que identificam uma mesma
     unidade dividida em várias feições (ex.: talhão em várias
     partes). Com busca ativa, clicar numa parte seleciona todas as
     partes com os mesmos valores nesses atributos.
   - icon: opcional, só para pontos. Desenha cada ponto com uma
     imagem em vez de um círculo. Para os marcadores ilustrados
     (usina, daninhas, pragas, fogo, chuva, vento):
       especificacaoIcone("nome", alturaEmPx)
     ou, para outra imagem: { url, size: [largura, altura], anchor: [x, y] }
     anchor é o pixel da imagem (já no tamanho exibido) que fica
     sobre a coordenada — a ponta, num ícone de alfinete.

   A ordem da lista é a ordem no painel Camadas (de cima para baixo).
   O usuário também pode abrir arquivos locais pelo painel
   Camadas, sem alterar esta lista.
*/
export const LAYERS = [
    {
        id: "usina",
        name: "Unidade Industrial",
        /* Ponto único: lat -20,0868, lon -46,0424. */
        url: "geojson/usina.geojson",
        color: "#3cb44b",
        visible: true,
        /* Marcador ilustrado (js/map/marker-icons.js) com 56 px de altura; a ponta do alfinete fica sobre o ponto. */
        icon: especificacaoIcone("usina", 56)
    },
    {
        id: "pol_fazendas",
        name: "Fazendas",
        /*
           Só referência visual dos limites das fazendas: contorno branco
           sobre halo escuro, sem preenchimento, sem clique e sempre por
           cima dos talhões. Versão simplificada (tolerância
           de 1 m, 6 casas decimais) do arquivo de origem em
           dados_origem/: 88,8 MB → 1,0 MB (0,27 MB comprimidos).
        */
        url: "geojson/pol_fazendas.geojson",
        color: "#ffffff",
        visible: true,
        style: "outline",
        interactive: false,
        /* Número da fazenda como rótulo, ligado na abertura, só de perto (zoom ≥ 13). */
        labels: { visible: true, fields: ["Fazenda"], minZoom: 13 }
    },
    {
        id: "pol_talhoes",
        name: "Talhões",
        /*
           Exportação do QGIS (geodatabase local, fora do Git) em
           07/11/2026: 3.388 talhões, coordenadas com 6 casas decimais
           (~10 cm), JSON compacto. 9,5 MB (2,1 MB comprimidos na rede).
        */
        url: "geojson/pol_talhoes.geojson",
        attribution:
            'Dados: <a href="https://github.com/Lcs-993/meus_layers">meus_layers</a>',
        /* Verde-cana (tom das lavouras na imagem de satélite). */
        color: "#4fae3c",
        visible: true,
        /* Camada ativa na abertura (busca, filtros e dashboard). */
        active: true,
        /* Sempre a última da lista, mesmo com arquivos adicionados depois. */
        keepLast: true,
        /* Um talhão pode vir em várias feições: Fazenda + Talhão identificam o talhão inteiro. */
        partFields: ["Fazenda", "Talhão"]
    }
];

/* Paleta usada para camadas sem cor definida (arquivos locais). */
export const LAYER_PALETTE = [
    "#f4c95d", "#4dd0e1", "#ff8a65", "#ba68c8", "#81c784", "#f06292"
];

/*
   Tema do mapa (painel Estilos): valores iniciais de cada tipo.
   As rampas são as de assets/rampas_de_cores/rampas.js (o id é a
   chave do arquivo, ex.: "arcmap-41-raster"); null = paleta padrão
   de alto contraste.
   - category: atributos de categoria (uma cor por valor).
   - numeric: atributos numéricos (faixas de valor). method:
     "jenks" | "quantis" | "intervalos-iguais" | "manual"; classes:
     1 a 32 (o usuário digita no painel). "manual" usa limits,
     pares [mín, máx] digitados no painel (não precisa vir aqui).
     A rampa 41 invertida vai do vermelho (menor) ao verde (maior),
     a leitura usual de produtividade e vigor.
*/
export const THEME_DEFAULTS = {
    category: { ramp: null, invert: false },
    numeric: { ramp: "arcmap-41-raster", invert: true, method: "jenks", classes: 5, limits: null, limitsField: null }
};

export const TABLE_PAGE_SIZE = 50;
export const SEARCH_DEBOUNCE_MS = 160;


/*
   MENUS DA BARRA SUPERIOR (estilo macOS Big Sur, js/ui/menu.js)

   Um item é:
     { id, label, description?, action?, shortcut?, checked?, items? }
   - action: identificador tratado em main.js (MODULE_ACTIONS). Com
     parâmetro: "tema:claro" chama a ação "tema" com "claro". Item
     sem action nem items aparece como "Em breve" (desabilitado).
   - checked: chave de estado resolvida em main.js na hora de abrir
     o menu (ex.: "tema:escuro"); mostra ✓ quando verdadeira.
   - shortcut: atalho exibido em cinza (só atalhos que funcionam).
   - items: submenu em cascata. "basemaps" é preenchido em main.js
     com os mapas de BASEMAPS.
   - { separator: true }: filete entre grupos.
   - description: dica ao passar o mouse.
   Para ligar um módulo novo: implementar em js/modules/, tratar a
   action em main.js e acrescentar a action ao item aqui.
*/
export const MODULE_MENUS = [
    {
        id: "monitoramento",
        label: "Monitoramento",
        items: [
            { id: "queimadas", label: "Queimadas", description: "Focos de calor do INPE próximos aos talhões e à usina" },
            { id: "clima", label: "Clima", description: "Previsão, chuva acumulada e dias sem chuva" },
            { id: "pragas", label: "Pragas", description: "Armadilhas e ocorrências por talhão" },
            { id: "ndvi", label: "Vigor da vegetação", description: "NDVI do Sentinel-2: falhas e estresse no canavial" }
        ]
    },
    {
        id: "operacao",
        label: "Operação",
        items: [
            { id: "safra", label: "Safra e colheita", description: "Estágio de corte, idade do canavial e frentes" },
            { id: "plantio", label: "Plantio e reforma", description: "Áreas previstas e realizadas" },
            { id: "aplicacoes", label: "Aplicações", description: "Vinhaça, defensivos e adubação por talhão" },
            { id: "logistica", label: "Logística", description: "Frota do transporte de cana em tempo real" }
        ]
    },
    {
        id: "analises",
        label: "Análises",
        items: [
            { id: "tabela", label: "Tabela de atributos", description: "Analytics: tabela da camada ativa", action: "analytics:table", checked: "analytics:table" },
            { id: "graficos", label: "Resumo e gráficos", description: "Analytics: agrupamentos e gráfico da camada ativa", action: "analytics:summary", checked: "analytics:summary" },
            { separator: true },
            { id: "produtividade", label: "Produtividade", description: "TCH e ATR por talhão e comparação entre safras" },
            { id: "raio", label: "Raio de abrangência", description: "Feições a até X km de um ponto" },
            { id: "analise", label: "Análise espacial", description: "Sobreposição, área de influência e estatísticas por região" }
        ]
    },
    {
        id: "ferramentas",
        label: "Ferramentas",
        items: [
            { id: "buscar", label: "Buscar", description: "Leva à caixa de busca do mapa", action: "search", shortcut: "Ctrl K" },
            { id: "pesquisa-avancada", label: "Pesquisa avançada…", description: "Campos, correspondência e E/OU da busca", action: "open-search" },
            { id: "medir", label: "Medir", description: "Distância e área no mapa" },
            { id: "desenho", label: "Desenho", description: "Pontos, linhas, polígonos e textos sobre o mapa" },
            { id: "caixa-ferramentas", label: "Outras ferramentas", description: "Recortar, unir, dissolver e converter camadas" },
            { separator: true },
            { id: "mapa-base", label: "Mapa base", items: "basemaps" },
            { id: "favoritos", label: "Favoritos", description: "Enquadramentos, camadas e filtros salvos" },
            {
                id: "aparencia",
                label: "Aparência",
                items: [
                    { id: "tema-escuro", label: "Escuro", action: "tema:dark", checked: "tema:dark" },
                    { id: "tema-claro", label: "Claro", action: "tema:light", checked: "tema:light" },
                    { separator: true },
                    { id: "sem-blur", label: "Reduzir transparência", action: "sem-blur", checked: "sem-blur" }
                ]
            },
            { id: "barra", label: "Barra lateral expandida", action: "toolbar", checked: "toolbar", shortcut: "[" },
            { id: "apresentar", label: "Apresentar", description: "Tela cheia para apresentações", action: "fullscreen", checked: "fullscreen", shortcut: "F" },
            { id: "configuracoes", label: "Configurações…", description: "Tema, transparência e atalhos", action: "open-settings" },
            { separator: true },
            { id: "salvar", label: "Salvar mapa", description: "Camadas, filtros, estilos e enquadramento atuais" },
            { id: "exportar-kml", label: "Exportar KML", description: "Camada ativa como está no mapa (filtros e cores) para o Google Earth", action: "export-kml" },
            { id: "imprimir", label: "Imprimir mapa", description: "PDF ou imagem com legenda" },
            { id: "compartilhar", label: "Compartilhar", description: "Link do mapa como está (camadas, filtros e enquadramento)" },
            { id: "incorporar", label: "Incorporar", description: "Código para colocar o mapa em outro site" },
            { id: "aplicativos", label: "Aplicativos", description: "Painéis e apps feitos a partir deste mapa" }
        ]
    },
    {
        id: "ajuda",
        label: "Ajuda",
        items: [
            { id: "guia", label: "Guia do usuário", description: "Como usar camadas, busca, filtros e Analytics (abre em nova aba)", action: "open-help" },
            { id: "atalhos", label: "Atalhos de teclado", description: "Teclas para barras, painéis e menus", action: "open-shortcuts" },
            { separator: true },
            { id: "sobre", label: "Sobre o WebGIS", description: "Fontes dos dados e créditos", action: "open-about" }
        ]
    }
];
