/* ============================================================
   CONFIGURAÇÃO DA APLICAÇÃO

   Único lugar com referências a dados concretos. O código da
   aplicação não conhece nenhum atributo: tudo o que aparece em
   popup, busca, filtros, dashboard e tabela é descoberto no
   schema de cada camada em tempo de execução.
   ============================================================ */

export const MAP_OPTIONS = {
    center: [-14.235, -51.925],
    zoom: 4,
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
   - icon: opcional, só para pontos. Desenha cada ponto com uma
     imagem em vez de um círculo:
       { url, size: [largura, altura], anchor: [x, y] }
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
        /* Imagem 443 × 620 exibida a 40 × 56; a ponta do alfinete fica em (20, 52). */
        icon: {
            url: "assets/icone_usina_canavieira.png",
            size: [40, 56],
            anchor: [20, 52]
        }
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
           Versão otimizada (coordenadas com 6 casas decimais, ~10 cm;
           JSON compacto) gerada a partir do commit 225cf99 de
           Lcs-993/meus_layers. Atributos idênticos ao original.
           15,7 MB → 9,3 MB (2,3 MB comprimidos na rede).
        */
        url: "geojson/pol_talhoes.geojson",
        attribution:
            'Dados: <a href="https://github.com/Lcs-993/meus_layers">meus_layers</a>',
        color: "#f4c95d",
        visible: true,
        /* Camada ativa na abertura (busca, filtros e dashboard). */
        active: true,
        /* Sempre a última da lista, mesmo com arquivos adicionados depois. */
        keepLast: true
    }
];

/* Paleta usada para camadas sem cor definida (arquivos locais). */
export const LAYER_PALETTE = [
    "#f4c95d", "#4dd0e1", "#ff8a65", "#ba68c8", "#81c784", "#f06292"
];

export const TABLE_PAGE_SIZE = 50;
export const SEARCH_DEBOUNCE_MS = 160;


/*
   MENUS DE MÓDULOS (centro da barra superior)

   Cada menu agrupa módulos e tem uma cor (tone) para os ícones
   dos itens: orange, green, blue ou gray. Um item é:
     { id, icon, label, description, action? }
   - icon: nome de um ícone de js/ui/module-menu.js (ICONS).
   - action: identificador tratado em main.js. Item sem action
     aparece como "Em breve" (desabilitado) até o módulo existir.
   Para ligar um módulo novo: implementar em js/modules/, tratar a
   action em main.js e acrescentar a action ao item aqui.
*/
export const MODULE_MENUS = [
    {
        id: "monitoramento",
        tone: "orange",
        label: "Monitoramento",
        items: [
            { id: "queimadas", icon: "flame", label: "Queimadas", description: "Focos de calor do INPE próximos aos talhões e à usina" },
            { id: "clima", icon: "cloud", label: "Clima", description: "Previsão, chuva acumulada e dias sem chuva" },
            { id: "pragas", icon: "bug", label: "Pragas", description: "Armadilhas e ocorrências por talhão" },
            { id: "ndvi", icon: "leaf", label: "Vigor da vegetação", description: "NDVI do Sentinel-2: falhas e estresse no canavial" }
        ]
    },
    {
        id: "operacao",
        tone: "green",
        label: "Operação",
        items: [
            { id: "safra", icon: "calendar", label: "Safra e colheita", description: "Estágio de corte, idade do canavial e frentes" },
            { id: "plantio", icon: "sprout", label: "Plantio e reforma", description: "Áreas previstas e realizadas" },
            { id: "aplicacoes", icon: "droplet", label: "Aplicações", description: "Vinhaça, defensivos e adubação por talhão" },
            { id: "logistica", icon: "truck", label: "Logística", description: "Frota do transporte de cana em tempo real" }
        ]
    },
    {
        id: "analises",
        tone: "blue",
        label: "Análises",
        items: [
            { id: "produtividade", icon: "trend", label: "Produtividade", description: "TCH e ATR por talhão e comparação entre safras" },
            { id: "raio", icon: "radius", label: "Raio de abrangência", description: "Feições a até X km de um ponto" }
        ]
    },
    {
        id: "ferramentas",
        tone: "gray",
        label: "Ferramentas",
        items: [
            { id: "medir", icon: "ruler", label: "Medir", description: "Distância e área no mapa" },
            { id: "imprimir", icon: "printer", label: "Imprimir mapa", description: "PDF ou imagem com legenda" },
            { id: "adicionar-dados", icon: "file-plus", label: "Adicionar dados", description: "GeoJSON, KML ou KMZ (lido só no navegador)", action: "open-file" }
        ]
    }
];
