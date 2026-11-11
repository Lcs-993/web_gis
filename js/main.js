/* ============================================================
   WEBGIS — inicialização

   Liga store, adaptador de mapa e componentes de interface.
   Nenhum módulo conversa diretamente com outro: todos leem e
   escrevem no store e reagem aos seus eventos.
   ============================================================ */

import { BASEMAPS, LAYERS, LAYER_PALETTE, MAP_OPTIONS, MODULE_MENUS, THEME_BASEMAPS } from "./config.js";
import { createStore } from "./core/store.js";
import { loadFromFile, loadFromUrl } from "./data/geojson-provider.js";
import { createMapView } from "./map/leaflet-view.js";
import { createPanels } from "./ui/panels.js";
import { createLayerPanel } from "./ui/layer-panel.js";
import { createLayerProperties } from "./ui/layer-properties.js";
import { createFilterPanel } from "./ui/filter-panel.js";
import { createSearchBox } from "./ui/search-box.js";
import { createDashboard } from "./ui/dashboard.js";
import { createDashboardResize } from "./ui/dashboard-resize.js";
import { createMapControls, disableMapControls } from "./ui/map-controls.js";
import { createStatusBar } from "./ui/status.js";
import { createLoadingOverlay } from "./ui/loading.js";
import { createModuleMenu } from "./ui/module-menu.js";
import { buildPopup } from "./ui/popup.js";
import { buildCollectionPopup } from "./ui/popup-collection.js";
import { createFeatureCard } from "./ui/feature-card.js";
import { createToolbars } from "./ui/toolbar.js";
import { createLayerTools } from "./ui/layer-tools.js";
import { createLegendPanel } from "./ui/legend-panel.js";
import { createNotifications, createSettingsPanel, plainText, renderAboutCredits } from "./ui/app-panels.js";
import { createFilterMenu } from "./ui/filter-menu.js";
import { createChartsPanel } from "./ui/charts-panel.js";
import { createContextMenu } from "./ui/context-menu.js";
import { formatCount, formatValue } from "./ui/format.js";
import { getAttribute, isEmpty, normalizeText } from "./data/values.js";

const store = createStore();
const status = createStatusBar(store);
const loading = createLoadingOverlay();
const notifications = createNotifications();

createSettingsPanel();


/* ---------------- mapa (ou stub, sem Leaflet) ---------------- */

const createNullMapView = () => {
    const noop = () => {};

    return {
        map: null,
        setInsets: noop,
        setBasemap: noop,
        syncLayers: () => [],
        renderView: noop,
        setSelection: noop,
        setLabels: noop,
        setTheme: noop,
        setSymbol: noop,
        fitFeatures: () => false,
        centerOn: noop,
        fitExtent: () => false,
        hasExtent: () => false,
        onFeatureClick: noop,
        onEmptyClick: noop,
        onFeatureContextMenu: noop,
        onMapContextMenu: noop,
        onContentChange: noop
    };
};

const leafletAvailable = typeof window.L !== "undefined";

/* Controles do mapa (zoom, início, apresentar…); null sem Leaflet. */
let mapControls = null;

const mapView = leafletAvailable
    ? createMapView(window.L, document.getElementById("map"), { options: MAP_OPTIONS, basemaps: BASEMAPS })
    : createNullMapView();

/* Rodapé translúcido sobre o mapa: enquadramentos descontam a altura dele. */
const footerHeight = () => {
    const footer = document.getElementById("map-footer");

    return footer ? footer.offsetHeight : 0;
};

mapView.setInsets({ bottom: footerHeight() });

if (leafletAvailable) {
    status.bindMap(mapView.map);
    mapControls = createMapControls(store, mapView, BASEMAPS);

    /*
       Mapa base acompanha o tema: claro → ruas, escuro → satélite
       (THEME_BASEMAPS, config.js). Vale na abertura e a cada troca de
       tema; "Reduzir transparência" também avisa "webgis:theme",
       por isso só reage quando o tema de fato muda.
    */
    const currentTheme = () => (window.webgisTheme ? window.webgisTheme.get() : "dark");
    const basemapFor = (theme) =>
        BASEMAPS.some((item) => item.id === THEME_BASEMAPS[theme]) ? THEME_BASEMAPS[theme] : BASEMAPS[0].id;
    let lastTheme = currentTheme();

    store.setBasemap(basemapFor(lastTheme));

    document.addEventListener("webgis:theme", () => {
        const theme = currentTheme();

        if (theme !== lastTheme) {
            lastTheme = theme;
            store.setBasemap(basemapFor(theme));
        }
    });

    window.addEventListener("resize", () => mapView.map.invalidateSize());
} else {
    /* Sem mapa os dados ainda carregam: dashboard e tabela funcionam. */
    disableMapControls();
    status.setMapNotice("Não foi possível carregar a biblioteca do mapa");
}


/* ---------------- painéis ---------------- */

let dashboard = null;

/*
   Com o dashboard aberto, a barra flutuante (busca + Filtros) some
   do mapa: filtros ficam nas colunas da tabela e o mesmo campo de
   busca (com o termo e os eventos) passa para o cabeçalho do
   dashboard. Ao fechar, volta para o mapa.
*/
const searchForm = document.getElementById("search-form");
const mapTools = searchForm ? searchForm.parentElement : null;
const dashboardSearchSlot = document.getElementById("dashboard-search-slot");

const moveSearch = (intoDashboard) => {
    if (!searchForm || !mapTools || !dashboardSearchSlot) {
        return;
    }

    const hadFocus = searchForm.contains(document.activeElement);

    if (intoDashboard) {
        dashboardSearchSlot.appendChild(searchForm);
    } else {
        mapTools.prepend(searchForm);
    }

    if (hadFocus) {
        document.getElementById("search-input").focus();
    }
};

/* Altura do dashboard ajustável pela alça da borda superior; o mapa desconta a nova altura. */
const dashboardResize = createDashboardResize(document.getElementById("dashboard"), {
    maximizeButton: document.getElementById("dashboard-maximize"),
    onResize: (height) => {
        /* Maximizado, o mapa fica coberto: o recuo só muda ao restaurar. */
        const maximized = document.documentElement.classList.contains("dashboard-maximized");

        if (panels.isOpen("dashboard") && !maximized) {
            mapView.setInsets({ bottom: height + footerHeight() });
        }

        /* Maximizar esconde a barra superior: ao restaurar, o mapa volta a ter outro tamanho. */
        if (!maximized && leafletAvailable) {
            mapView.map.invalidateSize({ animate: false });
        }

        if (dashboard) {
            dashboard.onLayoutChange();
        }
    }
});

/*
   Janelas flutuantes ao lado da barra esquerda: as ferramentas que
   mudam o mapa (o efeito fica à vista). A altura acompanha o
   conteúdo. Abrir uma fecha a outra. O Analytics fica embaixo e
   convive com elas.
*/
const LEFT_PANELS = [
    ["layers", "sidebar"],
    ["legend", "panel-legend"],
    ["charts", "panel-charts"],
    ["filters", "filter-panel"],
    ["search", "panel-search"],
    /* Mapa base: botão no grupo Mapa da barra esquerda. */
    ["basemap", "panel-basemap"]
];

/*
   Janelas centrais (modais): leitura e ajustes que não precisam do
   mapa à vista. Fundo escurecido; o resto da tela fica inerte; o
   clique no fundo, o × ou Esc fecham. A janela da esquerda que
   estava aberta continua lá ao fechar.
*/
const CENTER_PANELS = [
    ["settings", "panel-settings"],
    ["about", "panel-about"]
];

const appChrome = [document.querySelector(".topbar"), document.querySelector(".workspace")].filter(Boolean);

const sidePanel = (group, hostClass) => group.map(([id, element]) => ({
    id,
    element,
    useHidden: false,
    hostClass,
    exclusiveWith: group.map(([other]) => other).filter((other) => other !== id)
}));

let toolbars = null;

/* Botões Estilos, Rótulos e Campos da barra: marcados enquanto a janela mostra a aba deles para a camada ativa. */
const syncPropertiesTriggers = () => {
    const tab = layerProperties && layerProperties.activeLayerId() === store.state.activeLayerId
        ? layerProperties.activeTab()
        : null;

    document.querySelectorAll("[data-properties-tab]").forEach((trigger) => {
        trigger.setAttribute("aria-expanded", String(trigger.dataset.propertiesTab === tab));
    });

    if (toolbars) {
        toolbars.refresh();
    }
};
let layerProperties = null;

/*
   Fecha todo pop-up aberto: o cartão da feição (aqui) e, pelo
   evento "webgis:close-popups", os que vivem em outros módulos
   (foto ampliada, seletor de cor). Menus suspensos e de contexto
   já fecham com o clique que abriu a tabela.
*/
const closePopups = () => {
    featureCard.hide();
    document.dispatchEvent(new CustomEvent("webgis:close-popups"));
};

/* Largura ocupada pelo painel aberto de um lado (o mapa enquadra fora dele). */
const panelInset = (group) => {
    const open = group.find(([id]) => panels.isOpen(id));
    const element = open ? document.getElementById(open[1]) : null;

    return element ? element.offsetWidth + 8 : 0;
};

const panels = createPanels([
    ...sidePanel(LEFT_PANELS, "left-panel-open"),
    /* popover: foco entra na janela ao abrir e o clique fora (no fundo escurecido) fecha. */
    ...sidePanel(CENTER_PANELS, "center-panel-open").map((panel) => ({ ...panel, popover: true })),
    /*
       Propriedades da camada: janela flutuante, não modal (o mapa
       muda à vista) e convive com as da esquerda e com o Analytics.
    */
    { id: "properties", element: "panel-properties", useHidden: false, hostClass: "properties-open" },
    { id: "dashboard", element: "dashboard", hostClass: "dashboard-open" }
], {
    onChange: (id, open) => {
        if (LEFT_PANELS.some(([panel]) => panel === id)) {
            mapView.setInsets({ left: panelInset(LEFT_PANELS) });
        }

        if (CENTER_PANELS.some(([panel]) => panel === id)) {
            const modal = CENTER_PANELS.some(([panel]) => panels.isOpen(panel));

            appChrome.forEach((node) => {
                node.inert = modal;
            });
        }

        /* Fechada (OK, × ou Esc): os botões da barra deixam de marcar a aba. */
        if (id === "properties") {
            syncPropertiesTriggers();
        }

        if (toolbars) {
            toolbars.refresh();
        }

        if (id === "dashboard") {
            if (open) {
                dashboardResize.refresh();
            } else {
                /* Fechar sempre restaura: ao reabrir, volta à altura normal. */
                dashboardResize.setMaximized(false);
            }

            moveSearch(open);

            mapView.setInsets({ bottom: footerHeight() + (open ? document.getElementById("dashboard").offsetHeight : 0) });

            if (open && dashboard) {
                dashboard.onOpen();
            }

            /*
               Abrir a tabela fecha os pop-ups, sejam quais forem (cartão da
               feição, foto ampliada, seletor de cor, menus), e a janela da
               lateral esquerda (Camadas, Legenda, Gráficos, Filtro,
               Pesquisa, Mapa base): a tabela ganha a largura toda.
            */
            if (open) {
                closePopups();
                LEFT_PANELS.forEach(([panel]) => {
                    if (panels.isOpen(panel)) {
                        panels.close(panel);
                    }
                });
            }

            /*
               Seleção já existente: com o Analytics aberto, vai só para a
               linha da tabela (sem cartão); ao fechar, o cartão volta, com
               "Ver na tabela".
            */
            if (store.state.selection) {
                presentSelection(store.state.selection, { card: !open });
            }

            /*
               Abrir ou fechar o dashboard muda a área útil do mapa:
               reenquadra no que está em foco (seleção ou resultados da
               busca); sem foco, volta à extensão total, como o botão Home.
            */
            if (!fitToFocus()) {
                mapView.fitExtent();
            }
        }

    }
});


/* ---------------- seleção ↔ mapa ---------------- */

/*
   Cartão da feição (o "pop-up"), à direita do mapa. Sem o Analytics,
   fechar o cartão desfaz a seleção; com ele, a linha continua na
   tabela. Enquanto está à vista, o mapa enquadra fora dele.
*/
const featureCard = createFeatureCard({
    onDismiss: () => {
        if (!panels.isOpen("dashboard")) {
            store.select(null);
        }
    },
    onVisibilityChange: (visible, card) => {
        mapView.setInsets({ right: visible ? card.offsetWidth + 16 : 0 });
    }
});

/* Trocar a camada analisada com o Analytics aberto: o cartão segue a seleção conforme a nova camada. */
store.on("active", () => {
    if (store.state.selection) {
        presentSelection(store.state.selection);
    }
});

/* Enquadra antes de selecionar: o cartão abre já com o mapa em movimento. */
const selectFeature = (layerId, uid, { fit = false } = {}) => {
    if (fit) {
        mapView.fitFeatures(layerId, [uid], MAP_OPTIONS.fitMaxZoom + 1);
    }

    store.select(layerId, uid);
};

/*
   Reenquadra no que está em foco, descontando os painéis abertos:
   a feature selecionada; sem seleção, os resultados da busca na
   camada ativa. Sem nenhum dos dois, o mapa fica como está.
*/
const fitToFocus = () => {
    const selection = store.state.selection;

    if (selection) {
        return mapView.fitFeatures(selection.layerId, selection.uids, MAP_OPTIONS.fitMaxZoom + 1);
    }

    const layer = store.getActiveLayer();
    const matches = layer && layer.visible ? layer.view.matches : null;

    return matches && matches.length ? mapView.fitFeatures(layer.id, matches) : false;
};

/*
   Onde mostrar os atributos da feature selecionada: sempre no
   cartão à direita do mapa. Com o Analytics aberto e a feature na
   camada ativa, a linha também é destacada na aba Tabela (a linha
   mostra poucas colunas; o cartão, a feição inteira). Várias
   feições selecionadas: sem cartão (seria só de uma delas), salvo
   partes da mesma unidade.
*/
const presentSelection = (selection, { reveal = false, card = true } = {}) => {
    const inTable = Boolean(
        dashboard &&
        panels.isOpen("dashboard") &&
        selection.layerId === store.state.activeLayerId
    );

    if (inTable) {
        dashboard.showRow(selection.layerId, selection.uid);
    }

    const layer = store.getLayer(selection.layerId);
    const feature = store.getSelectedFeature();

    /* card: false — só a linha da tabela (ao abrir o Analytics, os pop-ups fecham). */
    if (!card || !(selection.uids.length === 1 || selection.parts) || !layer || !feature) {
        featureCard.hide();
        return;
    }

    const { layerId, uid } = selection;

    /* A chave inclui o modo: ao abrir ou fechar o Analytics, o conteúdo troca ("Mostrar na tabela" só faz sentido fora dela). */
    const actions = {
        onZoom: () => mapView.fitFeatures(layerId, [uid], MAP_OPTIONS.fitMaxZoom + 1),
        /* Abre o Analytics na camada da feição: a tabela vai até a linha. */
        onShowInTable: dashboard && !inTable
            ? () => {
                store.setActiveLayer(layerId);

                if (panels.isOpen("dashboard")) {
                    /* Ir para a tabela fecha os pop-ups, como ao abri-la. */
                    closePopups();
                    presentSelection(store.state.selection, { card: false });
                } else {
                    panels.open("dashboard");
                }
            }
            : null
    };
    const isCollection = Boolean(layer.popup && layer.popup.template === "coleta");

    featureCard.show(
        `${inTable ? "tabela" : "mapa"}:${layerId}:${uid}`,
        isCollection
            ? buildCollectionPopup(layer, feature, { ...actions, related: relatedFeatures(layer, feature) })
            : buildPopup(layer, feature, actions),
        { reveal, wide: isCollection }
    );
};

/*
   Polígono relacionado a um ponto (config.js: popup.related): as
   feições da outra camada com os mesmos valores nos atributos
   indicados (ex.: Fazenda + Talhão). "Ver no mapa" enquadra todas.
*/
const relatedFeatures = (layer, feature) => {
    const rule = layer.popup && layer.popup.related;
    const target = rule ? store.getLayer(rule.layer) : null;

    if (!target || target.status !== "ready" || !Array.isArray(rule.fields) || !rule.fields.length) {
        return null;
    }

    const wanted = rule.fields.map((field) => getAttribute(feature, field));

    if (wanted.some(isEmpty)) {
        return null;
    }

    const key = wanted.map((value) => normalizeText(value)).join("\u0000");
    const uids = [];

    target.features.forEach((candidate, index) => {
        if (rule.fields.map((field) => normalizeText(getAttribute(candidate, field) ?? "")).join("\u0000") === key) {
            uids.push(index);
        }
    });

    return {
        count: uids.length,
        onLocate: () => {
            if (!target.visible) {
                store.setLayerVisible(target.id, true);
            }

            mapView.fitFeatures(target.id, uids, MAP_OPTIONS.fitMaxZoom);
        }
    };
};

/*
   Ponto de coleta (popup.template "coleta") clicado: depois que o
   cartão abre (e o mapa sabe a largura dele), o ponto vai para o
   centro da área livre, no zoom MAP_OPTIONS.pointZoom (17).
*/
const centerCollectionPoint = (layerId, uid) => {
    const layer = store.getLayer(layerId);
    const feature = layer ? layer.features[uid] : null;

    if (layer && layer.popup && layer.popup.template === "coleta" &&
        feature && feature.geometry && feature.geometry.type === "Point") {
        mapView.centerOn(feature.geometry.coordinates, MAP_OPTIONS.pointZoom);
    }
};

mapView.onFeatureClick(({ layerId, uid }) => {
    /* Clicar de novo na feature já selecionada a mostra outra vez. */
    const current = store.state.selection;

    if (current && current.layerId === layerId && current.uid === uid && (current.uids.length === 1 || current.parts)) {
        presentSelection(current, { reveal: true });
    } else {
        store.select(layerId, uid);
    }

    centerCollectionPoint(layerId, uid);
});

mapView.onEmptyClick(() => store.select(null));

store.on("selection", (selection) => {
    mapView.setSelection(store.state.layers, selection);

    if (!selection) {
        featureCard.hide();
        return;
    }

    presentSelection(selection);
});

/*
   Rótulos: o mapa recebe só uma função uid → texto, já formatado
   pelo papel de cada atributo. Vários atributos = várias linhas
   ("\n"); linhas vazias são omitidas.
*/
const applyLabels = (layer) => {
    const { visible, fields } = layer.labels;
    const attributes = visible && layer.status === "ready"
        ? fields
            .map((field) => layer.schema.attributes.find((item) => item.name === field))
            .filter(Boolean)
        : [];

    mapView.setLabels(layer, attributes.length
        ? (uid) => {
            const lines = attributes
                .map((attribute) => {
                    const value = getAttribute(layer.features[uid], attribute.name);

                    return isEmpty(value) ? null : formatValue(value, attribute);
                })
                .filter(Boolean);

            return lines.length ? lines.join("\n") : null;
        }
        : null);
};

store.on("labels", applyLabels);

/* Tema por categoria: o mapa recebe só as cores por uid já calculadas no store. */
const applyTheme = (layer) => {
    mapView.setTheme(layer, layer.theme.visible && layer.theme.legend ? layer.theme.legend.colors : null);
};

store.on("theme", applyTheme);

/* Simbologia (cor, contorno, opacidades): o mapa relê a camada e repinta. */
store.on("symbol", (layer) => mapView.setSymbol(layer));

store.on("layers", (layers) => {
    mapView.syncLayers(layers).forEach((layer) => {
        mapView.renderView(layer);
        applyLabels(layer);
        applyTheme(layer);
    });
});

store.on("view", (layer) => mapView.renderView(layer));


/* ---------------- componentes ---------------- */

/*
   loader recebe onProgress e o repassa ao provider; o cartão de
   carregamento acompanha download e processamento até o fim.
*/
const loadLayer = async (definition, loader) => {
    const layer = store.addLayer(definition);

    store.setStatus(`Carregando ${layer.name}…`);
    loading.start(layer.id, layer.name);

    try {
        const data = await loader((progress) => loading.update(layer.id, progress));

        /* Schema, índice de busca e desenho rodam aqui, ainda com "Preparando" na tela. */
        store.setLayerData(layer.id, data);

        /* Tema pedido no catálogo (config.js: theme.field), ligado na abertura. */
        if (definition.theme && definition.theme.field) {
            store.setTheme(layer.id, { visible: true, field: definition.theme.field });
        }

        store.setStatus(`${layer.name}: ${formatCount(data.features.length)} feições`);
        notifications.notify(`${layer.name}: ${formatCount(data.features.length)} feições carregadas`, "success");

        return store.getLayer(layer.id);
    } catch (error) {
        const message = error && error.message ? error.message : "Erro desconhecido.";

        store.setLayerError(layer.id, message);
        store.setStatus(`${layer.name}: falha ao carregar`);
        notifications.notify(`${layer.name}: não foi possível carregar`, "error");

        status.showLoadError({
            key: layer.id,
            title: `Não foi possível carregar ${layer.name}`,
            detail: message,
            /* Arquivo local: o usuário abre de novo; camada da configuração: recarrega daqui. */
            onRetry: definition.source === "file" ? null : () => {
                store.removeLayer(layer.id);
                loadLayer(definition, loader);
            }
        });
        console.error(`[webgis] falha ao carregar "${layer.id}"`, error);

        return null;
    } finally {
        loading.finish(layer.id);
    }
};

let fileCounter = 0;

const addFile = async (file) => {
    fileCounter += 1;

    const layer = await loadLayer({
        id: `arquivo-${Date.now()}-${fileCounter}`,
        name: file.name.replace(/\.(geojson|json|kml|kmz)$/i, ""),
        color: LAYER_PALETTE[(LAYERS.length + fileCounter) % LAYER_PALETTE.length],
        source: "file",
        visible: true
    }, (onProgress) => loadFromFile(file, { onProgress }));

    if (layer) {
        store.setActiveLayer(layer.id);
        mapView.fitFeatures(layer.id, layer.view.filtered, MAP_OPTIONS.fitMaxZoom);
    }
};

/*
   Propriedades da camada: uma janela para informação, simbologia,
   rótulos e campos de qualquer camada. Abre pelo botão da linha da
   camada (ou duplo clique no nome) e pelos botões Estilos, Rótulos
   e Campos da barra (estes, para a camada ativa).
*/
layerProperties = createLayerProperties(store, {
    panels,
    getZoom: () => (mapView.map ? mapView.map.getZoom() : null),
    zoomRange: { minMapZoom: MAP_OPTIONS.minZoom, maxZoom: MAP_OPTIONS.maxZoom },
    onChange: () => syncPropertiesTriggers()
});

if (mapView.map) {
    mapView.map.on("zoomend", () => layerProperties.onZoom());
}

store.on("active", () => syncPropertiesTriggers());

createLayerPanel(store, {
    onAddFile: addFile,
    onProperties: (layerId) => layerProperties.open({ layer: layerId })
});
createLayerTools(store);
createLegendPanel(store);
createFilterPanel(store);
const searchBox = createSearchBox(store, mapView);

createFilterMenu(store, { openPanel: () => panels.open("filters") });

/*
   Ações dos menus e das barras. "nome:parâmetro" chama a ação
   "nome" com o parâmetro (ex.: "tema:light", "basemap:ruas").
   Os módulos futuros entram como novas entradas.
*/
const MODULE_ACTIONS = {
    /* Seletor de arquivo oculto (#layer-file-input); a aba Camadas trata o arquivo escolhido. */
    "open-file": () => document.getElementById("layer-file-input").click(),
    /* KML da camada ativa como está no mapa (a lógica fica com a tabela, que sabe a ordem e os filtros). */
    "export-kml": () => dashboard.exportKml(),
    "open-help": () => window.open("ajuda.html", "_blank", "noopener"),
    "open-shortcuts": () => {
        panels.open("settings");
        document.getElementById("settings-keys").scrollIntoView({ block: "start" });
    },
    "open-about": () => panels.open("about"),
    "open-settings": () => panels.open("settings"),
    search: () => searchBox.focus(),
    "open-search": () => panels.open("search"),
    tema: (theme) => window.webgisTheme && window.webgisTheme.set(theme),
    "sem-blur": () => window.webgisTheme && window.webgisTheme.setSemBlur(!window.webgisTheme.isSemBlur()),
    toolbar: () => toolbars && toolbars.toggle(),
    fullscreen: () => mapControls && mapControls.toggleFullscreen(),
    analytics: (tab) => dashboardTabs.toggle(tab),
    /* Janela Propriedades da camada ativa, na aba pedida (info, symbology, labels, fields). */
    propriedades: (tab) => layerProperties && layerProperties.open({ layer: store.state.activeLayerId, tab: tab || "info" }),
    basemap: (id) => store.setBasemap(id)
};

const runAction = (action) => {
    const [name, arg] = String(action).split(/:(.*)/s);
    const handler = MODULE_ACTIONS[name];

    if (handler) {
        handler(arg);
    } else {
        console.warn(`[webgis] ação sem tratamento: "${action}"`);
    }
};

/* Marcações (✓) dos menus, resolvidas na hora de abrir. */
const isChecked = (key) => {
    const [name, arg] = String(key).split(/:(.*)/s);
    const theme = window.webgisTheme;

    switch (name) {
        case "tema":
            return Boolean(theme && theme.get() === arg);
        case "sem-blur":
            return Boolean(theme && theme.isSemBlur());
        case "toolbar":
            return Boolean(toolbars && toolbars.isExpanded());
        case "fullscreen":
            return Boolean(mapControls && mapControls.isFullscreen());
        case "analytics":
            return Boolean(dashboard && dashboardTabs.isActive(arg));
        default:
            return false;
    }
};

/* Itens prontos para o menu: ✓ resolvido e "basemaps" preenchido com BASEMAPS. */
const resolveItems = (items) => {
    if (items === "basemaps") {
        return BASEMAPS.map((basemap) => ({
            label: basemap.name,
            action: `basemap:${basemap.id}`,
            checked: store.state.basemap === basemap.id
        }));
    }

    return items.map((item) => {
        if (item.separator || item.heading) {
            return item;
        }

        const resolved = { ...item };

        if (item.items) {
            resolved.items = resolveItems(item.items);
        }

        if ("checked" in item) {
            resolved.checked = isChecked(item.checked);
        }

        return resolved;
    });
};


createModuleMenu(document.getElementById("module-menu"), {
    getMenus: () => MODULE_MENUS.map((menu) => ({ ...menu, items: resolveItems(menu.items) })),
    onAction: runAction
});

dashboard = createDashboard(store, {
    isOpen: () => panels.isOpen("dashboard"),
    onRowSelect: (layerId, uid) => selectFeature(layerId, uid, { fit: true }),
    /* Ctrl/Shift na tabela: várias linhas; o mapa enquadra todas as selecionadas. */
    onRowsSelect: (layerId, uids, primary) => {
        mapView.fitFeatures(layerId, uids, MAP_OPTIONS.fitMaxZoom + 1);
        store.selectMany(layerId, uids, primary);
    },
    onTabChange: () => {
        if (toolbars) {
            toolbars.refresh();
        }
    }
});


/* ---------------- barras de ferramentas ---------------- */

/*
   Tabela de atributos (barra esquerda) e Análises (menu) abrem o
   Analytics na aba certa; clicar de novo no item ativo fecha.
*/
const dashboardTabs = {
    isActive: (tab) => panels.isOpen("dashboard") && dashboard.getTab() === tab,
    toggle: (tab) => {
        if (panels.isOpen("dashboard") && dashboard.getTab() === tab) {
            panels.close("dashboard");
            return;
        }

        dashboard.selectTab(tab);
        panels.open("dashboard");

        if (toolbars) {
            toolbars.refresh();
        }
    }
};

toolbars = createToolbars(store, {
    onAction: runAction,
    dashboardTabs,
    /* A barra esquerda mudou de largura: o mapa ocupa o novo espaço. */
    onLayoutChange: () => {
        if (leafletAvailable) {
            mapView.map.invalidateSize({ animate: false });
        }
    }
});


/* Painel Gráficos: o tipo escolhido abre no Resumo do Analytics. */
const chartsPanel = createChartsPanel({
    onPick: (type) => {
        if (type) {
            dashboard.setChartType(type);
        }

        dashboard.selectTab("summary");
        panels.open("dashboard");
        toolbars.refresh();
    },
    getCurrent: () => dashboard.getChartType()
});

chartsPanel.sync();


/* ---------------- menu de contexto (botão direito no mapa) ---------------- */

if (leafletAvailable) {
    createContextMenu(store, mapView, {
        /* Informações: seleciona e mostra no cartão da feição (e na tabela, com o Analytics aberto). */
        onInfo: (layerId, uid) => {
            const current = store.state.selection;

            if (current && current.layerId === layerId && current.uid === uid && (current.uids.length === 1 || current.parts)) {
                presentSelection(current, { reveal: true });
            } else {
                store.select(layerId, uid);
            }
        },
        onZoom: (layerId, uid) => mapView.fitFeatures(layerId, [uid], MAP_OPTIONS.fitMaxZoom + 1),
        onExportKml: (layerId, uid, title) => dashboard.exportKml({ layerId, uids: [uid], fileLabel: title })
    });
}


/* ---------------- créditos das fontes ---------------- */

/* Fontes dos dados (só no Sobre): todos os mapas base e camadas, sem repetir. */
const renderCredits = () => {
    renderAboutCredits(Array.from(new Set([
        ...BASEMAPS.map((item) => `${item.name}: ${plainText(item.attribution)}`),
        ...store.state.layers.filter((layer) => layer.attribution).map((layer) => `${layer.name}: ${plainText(layer.attribution)}`)
    ])));
};

store.on("layers", renderCredits);
renderCredits();


/* ---------------- carga inicial ---------------- */

status.setStatus("Carregando camadas…");

/*
   Ponto de extensão para scripts externos e depuração.
   Somente leitura do estado; mudanças passam pelas ações do store.
*/
window.WebGIS = Object.freeze({
    store,
    map: mapView.map,
    addLayer: (definition) => loadLayer(definition, (onProgress) => loadFromUrl(definition.url, { onProgress }))
});

Promise.all(LAYERS.map((definition, index) =>
    loadLayer(
        { ...definition, color: definition.color || LAYER_PALETTE[index % LAYER_PALETTE.length] },
        (onProgress) => loadFromUrl(definition.url, { onProgress })
    )
)).then((loaded) => {
    const ready = loaded.filter(Boolean);
    const failed = loaded.length - ready.length;

    if (ready.length) {
        mapView.fitExtent();
    }

    store.setStatus(failed
        ? `${failed} camada${failed === 1 ? "" : "s"} indisponíve${failed === 1 ? "l" : "is"}`
        : "Pronto");
});
