/* ============================================================
   WEBGIS — inicialização

   Liga store, adaptador de mapa e componentes de interface.
   Nenhum módulo conversa diretamente com outro: todos leem e
   escrevem no store e reagem aos seus eventos.
   ============================================================ */

import { BASEMAPS, LAYERS, LAYER_PALETTE, MAP_OPTIONS, MODULE_MENUS } from "./config.js";
import { createStore } from "./core/store.js";
import { loadFromFile, loadFromUrl } from "./data/geojson-provider.js";
import { createMapView } from "./map/leaflet-view.js";
import { createPanels } from "./ui/panels.js";
import { createLayerPanel } from "./ui/layer-panel.js";
import { createLayerInfo } from "./ui/layer-info.js";
import { createFilterPanel } from "./ui/filter-panel.js";
import { createSearchBox } from "./ui/search-box.js";
import { createDashboard } from "./ui/dashboard.js";
import { createDashboardResize } from "./ui/dashboard-resize.js";
import { createMapControls, disableMapControls } from "./ui/map-controls.js";
import { createStatusBar } from "./ui/status.js";
import { createLoadingOverlay } from "./ui/loading.js";
import { createModuleMenu } from "./ui/module-menu.js";
import { createComingSoon } from "./ui/coming-soon.js";
import { buildPopup } from "./ui/popup.js";
import { createFeatureCard } from "./ui/feature-card.js";
import { formatCount, formatValue } from "./ui/format.js";
import { getAttribute, isEmpty } from "./data/values.js";

const store = createStore();
const status = createStatusBar(store);
const loading = createLoadingOverlay();


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
        openPopup: noop,
        closePopup: noop,
        isPopupOpenFor: () => false,
        fitFeatures: () => false,
        fitExtent: () => false,
        hasExtent: () => false,
        onFeatureClick: noop,
        onEmptyClick: noop,
        onPopupClose: noop,
        onContentChange: noop
    };
};

const leafletAvailable = typeof window.L !== "undefined";

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
    createMapControls(store, mapView, BASEMAPS);
    store.setBasemap(BASEMAPS[0].id);

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
        panels.close("filters");
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

const panels = createPanels([
    { id: "layers", element: "sidebar", useHidden: false, hostClass: "layers-open" },
    { id: "filters", element: "filter-panel", popover: true },
    /* Abrir o dashboard fecha a aba Camadas: os dois disputariam o mapa. */
    { id: "dashboard", element: "dashboard", hostClass: "dashboard-open", exclusiveWith: ["layers"] }
], {
    onChange: (id, open) => {
        if (id === "dashboard") {
            if (open) {
                dashboardResize.refresh();
            } else {
                /* Fechar sempre restaura: ao reabrir, volta à altura normal. */
                dashboardResize.setMaximized(false);
                featureCard.hide();
            }

            moveSearch(open);

            mapView.setInsets({ bottom: footerHeight() + (open ? document.getElementById("dashboard").offsetHeight : 0) });

            if (open && dashboard) {
                dashboard.onOpen();

                /* Seleção já existente passa do popup para a tabela. */
                if (store.state.selection) {
                    presentSelection(store.state.selection);
                }
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

        if (id === "layers") {
            mapView.setInsets({ left: open ? document.getElementById("sidebar").offsetWidth : 0 });
        }
    }
});


/* ---------------- seleção ↔ mapa ---------------- */

let pendingLatLng = null;

const featureCard = createFeatureCard();

/* Trocar a camada analisada: o cartão só vale para a seleção da camada ativa. */
store.on("active", (layer) => {
    const selection = store.state.selection;

    if (!selection || !layer || selection.layerId !== layer.id) {
        featureCard.hide();
    }
});

const openSelectionPopup = (selection) => {
    const layer = store.getLayer(selection.layerId);
    const feature = store.getSelectedFeature();

    if (layer && feature) {
        const { layerId, uid } = selection;

        mapView.openPopup({ ...selection, latlng: pendingLatLng }, buildPopup(layer, feature, {
            onZoom: () => mapView.fitFeatures(layerId, [uid], MAP_OPTIONS.fitMaxZoom + 1),
            /*
               Abre o Analytics na camada da feição: a tabela vai até a
               linha (presentSelection) e o popup dá lugar a ela.
            */
            onShowInTable: dashboard
                ? () => {
                    store.setActiveLayer(layerId);

                    if (panels.isOpen("dashboard")) {
                        presentSelection(store.state.selection);
                    } else {
                        panels.open("dashboard");
                    }
                }
                : null
        }));
    }

    pendingLatLng = null;
};

/* Enquadra antes de selecionar: o popup abre já com o mapa em movimento e se reposiciona no fim. */
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
   Onde mostrar os atributos da feature selecionada.

   Com o dashboard aberto e a feature na camada ativa, a tabela já
   exibe os atributos: o popup só cobriria o mapa. Nesse caso a
   linha é destacada na aba Tabela. Fora disso (dashboard fechado
   ou feature de outra camada), vale o popup.
*/
const presentSelection = (selection, { reveal = false } = {}) => {
    const inTable = Boolean(
        dashboard &&
        panels.isOpen("dashboard") &&
        selection.layerId === store.state.activeLayerId
    );

    if (inTable) {
        pendingLatLng = null;
        mapView.closePopup();
        dashboard.showRow(selection.layerId, selection.uid);

        /* A linha mostra poucas colunas; o cartão mostra a feição inteira (uma só). */
        const layer = store.getLayer(selection.layerId);
        const feature = store.getSelectedFeature();

        if (selection.uids.length === 1 && layer && feature) {
            const { layerId, uid } = selection;

            featureCard.show(`${layerId}:${uid}`, buildPopup(layer, feature, {
                onZoom: () => mapView.fitFeatures(layerId, [uid], MAP_OPTIONS.fitMaxZoom + 1)
            }), { reveal });
        } else {
            featureCard.hide();
        }

        return;
    }

    featureCard.hide();

    /* Várias feições selecionadas: sem popup (seria só de uma delas). */
    if (selection.uids.length > 1) {
        pendingLatLng = null;
        mapView.closePopup();
        return;
    }

    if (!mapView.isPopupOpenFor(selection.layerId, selection.uid)) {
        openSelectionPopup(selection);
    }
};

mapView.onFeatureClick(({ layerId, uid, latlng }) => {
    pendingLatLng = latlng;

    /* Clicar de novo na feature já selecionada a mostra outra vez. */
    const current = store.state.selection;

    if (current && current.layerId === layerId && current.uid === uid && current.uids.length === 1) {
        presentSelection(current, { reveal: true });
        return;
    }

    store.select(layerId, uid);
});

mapView.onEmptyClick(() => store.select(null));
mapView.onPopupClose(() => store.select(null));

store.on("selection", (selection) => {
    mapView.setSelection(store.state.layers, selection);

    if (!selection) {
        mapView.closePopup();
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
        store.setStatus(`${layer.name}: ${formatCount(data.features.length)} feições`);

        return store.getLayer(layer.id);
    } catch (error) {
        const message = error && error.message ? error.message : "Erro desconhecido.";

        store.setLayerError(layer.id, message);
        store.setStatus(`${layer.name}: falha ao carregar`);
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

const layerInfo = createLayerInfo(store);

createLayerPanel(store, { onAddFile: addFile, onIdentify: (layerId) => layerInfo.open(layerId) });
createFilterPanel(store);
createSearchBox(store, mapView);

/*
   Menus de módulos da barra superior. Cada action de MODULE_MENUS
   é tratada aqui; os módulos futuros entram como novas entradas.
*/
const MODULE_ACTIONS = {
    /* Seletor de arquivo oculto (#layer-file-input); a aba Camadas trata o arquivo escolhido. */
    "open-file": () => document.getElementById("layer-file-input").click(),
    /* KML da camada ativa como está no mapa (a lógica fica com a tabela, que sabe a ordem e os filtros). */
    "export-kml": () => dashboard.exportKml()
};

/* Assistente de IA: por enquanto só o botão, com o aviso "Em breve". */
createComingSoon(document.getElementById("ai-button"));

createModuleMenu(document.getElementById("module-menu"), MODULE_MENUS, {
    onAction: (action) => {
        const handler = MODULE_ACTIONS[action];

        if (handler) {
            handler();
        } else {
            console.warn(`[webgis] ação de módulo sem tratamento: "${action}"`);
        }
    }
});

dashboard = createDashboard(store, {
    isOpen: () => panels.isOpen("dashboard"),
    onRowSelect: (layerId, uid) => selectFeature(layerId, uid, { fit: true }),
    /* Ctrl/Shift na tabela: várias linhas; o mapa enquadra todas as selecionadas. */
    onRowsSelect: (layerId, uids, primary) => {
        mapView.fitFeatures(layerId, uids, MAP_OPTIONS.fitMaxZoom + 1);
        store.selectMany(layerId, uids, primary);
    }
});


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
