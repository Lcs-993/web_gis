/* ============================================================
   WEBGIS CAMPO — navegador de campo para celular

   Mapa com as camadas do WebGIS, GPS com bússola, navegação até
   um destino, medição (toque, mira, GPS ou caminhando), pontos
   e trilhas salvos no aparelho, busca por atributos, por
   proximidade e por coordenadas. Funciona offline depois da
   primeira abertura conectada (sw.js).
   ============================================================ */

import { inferSchema } from "../js/data/schema.js";
import { buildTheme, isThemeable, themeKind } from "../js/data/theme.js";
import { labelAnchor } from "../js/map/label-anchor.js";
import { camadasDoCampo, servidorCampo } from "../js/data/campo-api.js";
import { especificacaoIcone } from "../js/map/marker-icons.js";
import * as geo from "./geo.js";
import { loadFieldData, newId, saveFieldData } from "./field-store.js";
import { renderStyleControls } from "./symbology.js";

/* ---------- Configuração ---------- */

const DEFAULT_VIEW = { lat: -20.0868, lng: -46.0424, zoom: 11 };
const SEARCH_DEBOUNCE_MS = 160;
const SEARCH_LIMIT = 30;
const NEARBY_LIMIT = 12;
const TRACK_MIN_STEP_M = 4;
const TRACK_MAX_ACCURACY_M = 35;
const WALK_MIN_STEP_M = 5;
const WALK_MAX_ACCURACY_M = 25;
const ARRIVAL_RADIUS_M = 10;
const STORAGE = {
    styles: "webgis-mobile-layer-styles-v2",
    view: "webgis-mobile-view",
    basemap: "webgis-mobile-basemap",
    theme: "webgis-mobile-theme",
    keepAwake: "webgis-mobile-keep-awake"
};

const BASEMAPS = {
    satelite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, Maxar, Earthstar Geographics and the GIS User Community'
    },
    ruas: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Mapa &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, HERE, Garmin, USGS and the GIS User Community'
    }
};

/*
   Simbologia padrão igual à da abertura do desktop (js/data/symbol.js
   e js/map/leaflet-view.js): divisa preta translúcida nos talhões,
   contorno branco com halo escuro nas fazendas, pontos com borda
   escura. Mudou lá? Ajuste aqui também.
*/
const POLYGON_STROKE_WIDTH = 0.8;
const OUTLINE_STROKE_WIDTH = POLYGON_STROKE_WIDTH * 4 / 3;
const OUTLINE_HALO = { color: "#000000", opacity: 0.45, fill: false, lineCap: "round", lineJoin: "round", interactive: false };
const LABEL_LIMIT = 400;
const LABEL_CHAR_WIDTH = 6.6;
const LABEL_HEIGHT = 18;
const LABEL_GAP = 4;

const baseStyle = (overrides) => ({
    mode: "single", field: "", fill: true, fillOpacity: 0.35, strokeColor: "#000000",
    strokeWidth: POLYGON_STROKE_WIDTH, pointSize: 5, opacity: 1, ...overrides
});
const pointStyle = (overrides) => baseStyle({ fillOpacity: 0.85, strokeColor: "#1d1d1f", strokeWidth: 1, ...overrides });

/* Ícone ilustrado do desktop (js/map/marker-icons.js), com caminho relativo a mobile/. */
const markerIcon = (name, height) => {
    const spec = especificacaoIcone(name, height);
    return { ...spec, url: `../${spec.url}` };
};

const LOCAL_LAYERS = [
    {
        id: "usina",
        name: "Unidade Industrial",
        url: "../geojson/usina.geojson",
        visible: true,
        icon: markerIcon("usina", 56),
        style: pointStyle({ color: "#3cb44b" })
    },
    {
        id: "pol_fazendas",
        name: "Fazendas",
        url: "../geojson/pol_fazendas.geojson",
        visible: true,
        interactive: false,
        outline: true,
        labels: { fields: ["Fazenda"], minZoom: 13 },
        style: baseStyle({ color: "#ffffff", fill: false, fillOpacity: 0, strokeColor: "#ffffff", strokeWidth: OUTLINE_STROKE_WIDTH })
    },
    {
        id: "coletas_demo",
        name: "Coletas de campo (demonstração)",
        url: "../geojson/coletas_demo.geojson",
        visible: true,
        style: pointStyle({ color: "#f2c14e", mode: "category", field: "Tipo" })
    },
    {
        id: "pol_talhoes",
        name: "Talhões",
        url: "../geojson/pol_talhoes.geojson",
        visible: true,
        style: baseStyle({ color: "#d9b56b" })
    }
];

/* Com servidor do app de campo configurado, as coletas reais substituem a demonstração. */
function layerCatalog() {
    let server = null;
    try {
        server = servidorCampo();
    } catch (error) {
        console.warn("Não foi possível ler o servidor do app de campo:", error);
    }
    if (!server) return { server: null, layers: LOCAL_LAYERS };
    const campo = camadasDoCampo(server).map((definition) => ({
        id: definition.id,
        name: definition.name,
        url: definition.url,
        remote: true,
        visible: Boolean(definition.visible),
        kindDefaults: true,
        style: baseStyle({
            color: definition.color || "#f2c14e",
            mode: definition.theme?.field ? "category" : "single",
            field: definition.theme?.field || ""
        })
    }));
    return { server, layers: LOCAL_LAYERS.flatMap((layer) => (layer.id === "coletas_demo" ? campo : [layer])) };
}

/* ---------- DOM ---------- */

const $ = (selector) => document.querySelector(selector);
const mapElement = $("#map");
const ui = {
    network: $("#network-status"),
    loading: $("#loading-state"),
    toast: $("#toast"),
    install: $("#install-app"),
    crosshair: $("#crosshair"),
    hud: $("#gps-hud"),
    hudAccuracy: $("#hud-accuracy"),
    hudSpeed: $("#hud-speed"),
    hudHeading: $("#hud-heading"),
    hudAltitude: $("#hud-altitude"),
    hudPlace: $("#hud-place"),
    navBanner: $("#nav-banner"),
    navBannerArrow: $("#nav-banner-arrow"),
    navBannerDistance: $("#nav-banner-distance"),
    navBannerName: $("#nav-banner-name"),
    recordingChip: $("#recording-chip"),
    recordingChipText: $("#recording-chip-text"),
    locate: $("#locate-button"),
    searchInput: $("#search-input"),
    searchResults: $("#search-results"),
    searchCaption: $("#search-caption"),
    layerList: $("#layer-list"),
    campoStatus: $("#campo-status"),
    styleControls: $("#style-controls"),
    featureMetrics: $("#feature-metrics"),
    featureProperties: $("#feature-properties"),
    measureResult: $("#measure-result"),
    measureDetails: $("#measure-details"),
    measureWalk: $("#measure-walk"),
    navigateActive: $("#navigate-active"),
    navigateActions: $("#navigate-active-actions"),
    navigateTitle: $("#navigate-title"),
    navigateKicker: $("#navigate-kicker"),
    navigateDistance: $("#navigate-distance"),
    navigateBearing: $("#navigate-bearing"),
    navigateEta: $("#navigate-eta"),
    navigateHeadingSource: $("#navigate-heading-source"),
    compassRose: $("#compass-rose"),
    compassArrow: $("#compass-arrow"),
    trackDistance: $("#track-distance"),
    trackDetails: $("#track-details"),
    trackToggle: $("#track-toggle"),
    trackFinish: $("#track-finish"),
    keepAwake: $("#keep-awake"),
    waypointList: $("#waypoint-list"),
    trackList: $("#track-list"),
    pointTitle: $("#point-title"),
    pointDecimal: $("#point-decimal"),
    pointDms: $("#point-dms"),
    pointUtm: $("#point-utm"),
    pointPlace: $("#point-place"),
    pointFromMe: $("#point-from-me"),
    pointName: $("#point-name"),
    pointNote: $("#point-note"),
    pointDelete: $("#point-delete"),
    pointShare: $("#point-share")
};
const sheets = {
    search: $("#search-panel"),
    layers: $("#layers-sheet"),
    feature: $("#feature-sheet"),
    style: $("#style-sheet"),
    measure: $("#measure-sheet"),
    navigate: $("#navigate-sheet"),
    points: $("#points-sheet"),
    point: $("#point-sheet")
};
const navButtons = {
    layers: $("#layers-toggle"),
    search: $("#search-toggle"),
    measure: $("#measure-toggle"),
    navigate: $("#navigate-toggle"),
    points: $("#points-toggle")
};

/* ---------- Utilidades ---------- */

const readStorage = (key, fallback = null) => {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
};
const writeStorage = (key, value) => {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

const formatNumber = (value, maximumFractionDigits = 2) =>
    Number(value).toLocaleString("pt-BR", { maximumFractionDigits });

function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "—";
    if (meters < 1000) return `${formatNumber(meters, meters < 100 ? 1 : 0)} m`;
    return `${formatNumber(meters / 1000, meters < 10000 ? 2 : 1)} km`;
}

function formatArea(squareMeters) {
    if (squareMeters < 10000) return `${formatNumber(squareMeters, 1)} m²`;
    if (squareMeters < 1e8) return `${formatNumber(squareMeters / 10000, 2)} ha`;
    return `${formatNumber(squareMeters / 1e6, 2)} km²`;
}

const formatBearing = (degrees) => `${Math.round(geo.normalizeDegrees(degrees))}° ${geo.cardinal(degrees)}`;

function formatDuration(milliseconds) {
    const minutes = Math.max(0, Math.round(milliseconds / 60000));
    if (minutes < 1) return "menos de 1 min";
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

const formatDate = (time) => new Date(time).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
});

const decimalText = ({ lat, lng }) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

let toastTimer = 0;
function showToast(message, duration = 3800) {
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, duration);
}

function vibrate(pattern) {
    try {
        navigator.vibrate?.(pattern);
    } catch {
        /* Vibração indisponível. */
    }
}

async function copyText(text, success) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(success);
    } catch {
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.cssText = "position:fixed;opacity:0";
        document.body.append(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        showToast(copied ? success : "Não foi possível copiar neste navegador.");
    }
}

/* ---------- Tema ---------- */

function currentTheme() {
    const stored = readStorage(STORAGE.theme) || readStorage("webgis-theme");
    return stored === "light" ? "light" : "dark";
}

function applyTheme(theme = currentTheme()) {
    document.documentElement.dataset.theme = theme;
    $("#meta-theme-color").content = theme === "light" ? "#f7f4ee" : "#1c1c1e";
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
        button.setAttribute("aria-checked", String(button.dataset.themeOption === theme));
    });
}

applyTheme();

/* ---------- Mapa ---------- */

const savedView = (() => {
    try {
        const view = JSON.parse(readStorage(STORAGE.view, "null"));
        return view && [view.lat, view.lng, view.zoom].every(Number.isFinite) ? view : null;
    } catch {
        return null;
    }
})();

const map = L.map(mapElement, {
    center: savedView ? [savedView.lat, savedView.lng] : [DEFAULT_VIEW.lat, DEFAULT_VIEW.lng],
    zoom: savedView?.zoom ?? DEFAULT_VIEW.zoom,
    minZoom: 4,
    maxZoom: 20,
    zoomControl: false,
    preferCanvas: true,
    tapTolerance: 20
});

for (const [name, zIndex] of [["labels", 450], ["toolsPane", 640], ["waypointPane", 655], ["gpsPane", 670]]) {
    map.createPane(name).style.zIndex = String(zIndex);
}
map.getPane("labels").style.pointerEvents = "none";
map.getPane("gpsPane").style.pointerEvents = "none";

/* Canvas com tolerância maior: tocar em pontos e linhas finas fica mais fácil com o dedo. */
const dataRenderer = L.canvas({ padding: 0.3, tolerance: 7 });
const toolsRenderer = L.svg({ pane: "toolsPane", padding: 0.3 });

L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
map.attributionControl.setPrefix(false);

const measurementLayer = L.layerGroup().addTo(map);
const navigationLayer = L.layerGroup().addTo(map);
const tracksLayer = L.layerGroup().addTo(map);
const waypointsLayer = L.layerGroup().addTo(map);
const inspectLayer = L.layerGroup().addTo(map);

let viewSaveTimer = 0;
map.on("moveend", () => {
    window.clearTimeout(viewSaveTimer);
    viewSaveTimer = window.setTimeout(() => {
        const center = map.getCenter();
        writeStorage(STORAGE.view, JSON.stringify({ lat: center.lat, lng: center.lng, zoom: map.getZoom() }));
    }, 600);
});

/* ---------- Mapa-base e conexão ---------- */

let basemapChoice = readStorage(STORAGE.basemap, "satelite");
if (!BASEMAPS[basemapChoice] && basemapChoice !== "nenhum") basemapChoice = "satelite";
let basemap = null;
let basemapTimer = 0;

function removeBasemap(message = "") {
    if (basemap) map.removeLayer(basemap);
    basemap = null;
    window.clearTimeout(basemapTimer);
    if (message) showToast(message);
}

function applyBasemap() {
    removeBasemap();
    document.querySelectorAll("[data-basemap]").forEach((button) => {
        button.setAttribute("aria-checked", String(button.dataset.basemap === basemapChoice));
    });
    const definition = BASEMAPS[basemapChoice];
    if (!definition || !navigator.onLine) return;

    let loaded = 0;
    let failed = 0;
    const layer = L.tileLayer(definition.url, {
        maxZoom: 20,
        maxNativeZoom: 19,
        keepBuffer: 3,
        attribution: definition.attribution
    });
    const fail = () => {
        if (basemap === layer && loaded === 0) {
            removeBasemap("Mapa-base indisponível. As camadas locais continuam disponíveis.");
        }
    };
    layer.on("tileload", () => { loaded += 1; });
    layer.on("tileerror", () => { failed += 1; if (failed >= 4) fail(); });
    basemap = layer.addTo(map);
    basemapTimer = window.setTimeout(() => { if (failed > 0) fail(); }, 6000);
}

function updateConnectivity(announce = false) {
    const offline = !navigator.onLine;
    ui.network.textContent = offline ? "Offline · dados locais" : "Online";
    ui.network.classList.toggle("is-offline", offline);
    if (offline) {
        removeBasemap(announce ? "Sem conexão. Camadas, busca, GPS e medição continuam funcionando." : "");
    } else {
        applyBasemap();
        if (announce) showToast("Conexão restabelecida.");
    }
}

/* ---------- Camadas ---------- */

const catalog = layerCatalog();
const layerStates = new Map(catalog.layers.map((layer) => [layer.id, {
    ...layer,
    style: { ...layer.style },
    defaultStyle: { ...layer.style },
    haloLayer: null,
    labelGroup: null,
    styleStored: false,
    status: "idle",
    collection: null,
    schema: null,
    mapLayer: null,
    records: [],
    featureIndexes: null,
    theme: null,
    geometryKind: "polygon",
    error: null
}]));
const featureRecords = [];
let selectedRecord = null;

function readStoredStyles() {
    let stored;
    try {
        stored = JSON.parse(readStorage(STORAGE.styles, "{}"));
    } catch {
        return;
    }
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
    for (const [id, values] of Object.entries(stored)) {
        const layer = layerStates.get(id);
        if (!layer || !values || typeof values !== "object") continue;
        layer.styleStored = true;
        if (["single", "category", "numeric"].includes(values.mode)) layer.style.mode = values.mode;
        if (typeof values.field === "string") layer.style.field = values.field;
        if (typeof values.fill === "boolean") layer.style.fill = values.fill;
        for (const key of ["color", "strokeColor"]) {
            if (typeof values[key] === "string" && /^#[\da-f]{6}$/i.test(values[key])) layer.style[key] = values[key];
        }
        for (const [key, min, max] of [["fillOpacity", 0, 1], ["opacity", 0, 1], ["strokeWidth", 0, 8], ["pointSize", 2, 20]]) {
            if (Number.isFinite(values[key]) && values[key] >= min && values[key] <= max) layer.style[key] = values[key];
        }
    }
}

let styleSaveTimer = 0;
function saveStoredStyles() {
    window.clearTimeout(styleSaveTimer);
    styleSaveTimer = window.setTimeout(() => {
        const saved = Object.fromEntries([...layerStates].map(([id, layer]) => [id, layer.style]));
        if (!writeStorage(STORAGE.styles, JSON.stringify(saved))) {
            showToast("Estilo aplicado, mas não foi possível salvá-lo neste aparelho.");
        }
    }, 160);
}

readStoredStyles();

const modeAttributes = (layer, mode) => {
    const kind = mode === "category" ? "category" : "numeric";
    return (layer.schema?.attributes || []).filter((attribute) => isThemeable(attribute) && themeKind(attribute) === kind);
};

function buildLayerTheme(layer) {
    layer.theme = null;
    if (layer.style.mode === "single" || !layer.collection) return;
    const attribute = modeAttributes(layer, layer.style.mode).find((item) => item.name === layer.style.field);
    if (!attribute) {
        layer.style.mode = "single";
        layer.style.field = "";
        return;
    }
    layer.theme = buildTheme(layer.collection.features, attribute,
        themeKind(attribute) === "numeric" ? { method: "intervalos-iguais", classes: 5 } : {});
}

/* Mesmas regras do desktop (styleFor em js/map/leaflet-view.js, estado normal). */
function styleForFeature(layer, feature) {
    const { style } = layer;
    const isPoint = layer.geometryKind === "point";
    const filled = isPoint || (layer.geometryKind === "polygon" && style.fill);
    const color = layer.theme?.colors[layer.featureIndexes?.get(feature)] || style.color;
    /* Divisa padrão fina e translúcida; contorno sem preenchimento ou cor escolhida pelo usuário, cheios. */
    const strokeOpacity = !filled ? 1
        : style.strokeColor !== layer.defaultStyle.strokeColor ? 1
            : isPoint ? 0.95 : 0.55;
    const result = {
        lineCap: "round",
        lineJoin: "round",
        fill: filled,
        color: filled ? style.strokeColor : color,
        weight: style.strokeWidth,
        opacity: strokeOpacity * style.opacity,
        fillColor: color,
        fillOpacity: filled ? style.fillOpacity * style.opacity : 0
    };
    if (isPoint) result.radius = style.pointSize;
    return result;
}

/* Seleção do desktop: contorno branco forte e preenchimento mais firme. */
function selectedStyle(record) {
    const { style, geometryKind } = record.layer;
    const isPoint = geometryKind === "point";
    const themed = Boolean(record.layer.theme);
    return {
        lineCap: "round",
        lineJoin: "round",
        color: "#ffffff",
        weight: isPoint ? 2.5 : Math.max(3, style.strokeWidth + 1.5),
        opacity: 1,
        fillOpacity: isPoint ? 1 : style.fill ? Math.min(1, style.fillOpacity + (themed ? 0.3 : 0.25)) : 0,
        ...(isPoint ? { radius: style.pointSize + 3 } : {})
    };
}

/* Marcadores com ícone não têm setStyle: a seleção vira uma classe CSS. */
function applyRecordStyle(record, selected = false) {
    const target = record.leafletLayer;
    if (target.setStyle) {
        target.setStyle(selected ? selectedStyle(record) : styleForFeature(record.layer, record.feature));
    } else {
        target.getElement?.()?.classList.toggle("is-selected", selected);
        target.setOpacity?.(record.layer.style.opacity);
    }
}

function haloStyle(layer) {
    const visible = layer.outline && !layer.style.fill ? layer.style.opacity : 0;
    return { ...OUTLINE_HALO, opacity: OUTLINE_HALO.opacity * visible, weight: layer.style.strokeWidth + 1 };
}

const pendingRefresh = new Set();
let refreshFrame = 0;
function requestStyleRefresh(layer) {
    pendingRefresh.add(layer);
    if (refreshFrame) return;
    refreshFrame = window.requestAnimationFrame(() => {
        refreshFrame = 0;
        for (const pending of pendingRefresh) {
            pending.records.forEach((record) => applyRecordStyle(record));
            pending.haloLayer?.setStyle(haloStyle(pending));
            drawLabels(pending);
        }
        pendingRefresh.clear();
        if (selectedRecord) applyRecordStyle(selectedRecord, true);
    });
}

function geometryKindOf(collection) {
    const type = collection.features.find((feature) => feature.geometry)?.geometry.type || "";
    if (type.includes("Point")) return "point";
    if (type.includes("LineString")) return "line";
    return "polygon";
}

const LABEL_FIELDS = {
    point: ["Tipo", "Alvo", "Código", "Nome", "nome", "name"],
    polygon: ["Talhão", "Fazenda", "Nome", "nome", "name", "Código"],
    line: ["Nome", "nome", "name", "Código", "Tipo"]
};

function featureLabel(layer, feature) {
    const properties = feature.properties || {};
    const values = LABEL_FIELDS[layer.geometryKind]
        .map((key) => properties[key])
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
        .slice(0, 2)
        .map(String);
    return values.length ? values.join(" · ") : layer.name;
}

const normalize = (value) => String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function recordAnchor(record) {
    if (record.anchor === undefined) {
        const anchor = labelAnchor(record.feature.geometry);
        record.anchor = anchor ? L.latLng(anchor[0], anchor[1]) : null;
    }
    return record.anchor;
}

function recordMetrics(record) {
    record.metrics ??= geo.geometryMetrics(record.feature.geometry);
    return record.metrics;
}

function addLayerToMap(layer) {
    layer.featureIndexes = new WeakMap(layer.collection.features.map((feature, index) => [feature, index]));
    layer.records = [];
    const interactive = layer.interactive !== false;
    layer.mapLayer = L.geoJSON(layer.collection, {
        renderer: dataRenderer,
        interactive,
        smoothFactor: 1.2,
        style: (feature) => styleForFeature(layer, feature),
        pointToLayer: (feature, latlng) => (layer.icon
            ? L.marker(latlng, {
                interactive,
                keyboard: false,
                icon: L.icon({
                    iconUrl: layer.icon.url,
                    iconSize: layer.icon.size,
                    iconAnchor: layer.icon.anchor,
                    className: "feature-marker"
                })
            })
            : L.circleMarker(latlng, { renderer: dataRenderer, interactive, ...styleForFeature(layer, feature) })),
        onEachFeature: (feature, leafletLayer) => {
            const record = {
                feature,
                layer,
                leafletLayer,
                label: featureLabel(layer, feature),
                text: normalize(Object.values(feature.properties || {}).filter((value) => value != null).join(" ")),
                bbox: Array.isArray(feature.bbox) && feature.bbox.length === 4 ? feature.bbox : geo.geometryBbox(feature.geometry)
            };
            featureRecords.push(record);
            layer.records.push(record);
            if (interactive) {
                leafletLayer.on("click", (event) => {
                    if (isMeasuring()) return;
                    L.DomEvent.stop(event);
                    openFeature(record);
                });
            }
        }
    });
    if (layer.outline) {
        /* Halo escuro sob o contorno claro: legível sobre satélite claro ou escuro. */
        layer.haloLayer = L.geoJSON(layer.collection, {
            renderer: dataRenderer,
            interactive: false,
            smoothFactor: 1.2,
            style: () => haloStyle(layer)
        });
    }
    if (layer.labels) layer.labelGroup = L.layerGroup();
    if (layer.visible) showLayer(layer);
}

function showLayer(layer) {
    layer.haloLayer?.addTo(map);
    layer.mapLayer.addTo(map);
    layer.labelGroup?.addTo(map);
    drawLabels(layer);
    restack();
}

function hideLayer(layer) {
    for (const item of [layer.haloLayer, layer.mapLayer, layer.labelGroup]) {
        if (item && map.hasLayer(item)) map.removeLayer(item);
    }
}

/*
   Ordem de desenho no canvas, como no desktop: polígonos embaixo,
   linhas, pontos e, por cima de tudo, as camadas de contorno
   (fazendas). No mesmo nível, a de cima na lista fica por cima.
   Sem isto valeria a ordem de carga, e os talhões (arquivo mais
   pesado, o último a chegar) cobririam os limites das fazendas.
*/
const KIND_RANK = { polygon: 0, line: 1, point: 2 };
const layerOrder = [...layerStates.keys()];

function restack() {
    const rank = (layer) => (layer.outline ? 3 : KIND_RANK[layer.geometryKind] ?? 0);
    const stack = [...layerStates.values()]
        .filter((layer) => layer.status === "ready" && layer.mapLayer && map.hasLayer(layer.mapLayer))
        .sort((a, b) => rank(a) - rank(b) || layerOrder.indexOf(b.id) - layerOrder.indexOf(a.id));
    stack.slice(1).forEach((layer) => {
        layer.haloLayer?.bringToFront();
        layer.mapLayer.bringToFront();
    });
}

/* Rótulos com detecção de colisão, como no desktop (drawLabels em js/map/leaflet-view.js). */
function drawLabels(layer) {
    const group = layer.labelGroup;
    if (!group) return;
    group.clearLayers();
    if (!layer.visible || layer.status !== "ready" || !map.hasLayer(group)) return;
    if (layer.labels.minZoom && map.getZoom() < layer.labels.minZoom) return;

    const bounds = map.getBounds();
    const size = map.getSize();
    const placed = [];
    for (const record of layer.records) {
        if (placed.length >= LABEL_LIMIT) break;
        if (record.bbox && !bounds.intersects([[record.bbox[1], record.bbox[0]], [record.bbox[3], record.bbox[2]]])) continue;
        const anchor = recordAnchor(record);
        if (!anchor || !bounds.contains(anchor)) continue;
        const text = layer.labels.fields
            .map((field) => record.feature.properties?.[field])
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
            .join("\n");
        if (!text) continue;

        const lines = text.split("\n");
        const longest = Math.max(...lines.map((line) => line.length));
        const point = map.latLngToContainerPoint(anchor);
        const halfWidth = (longest * LABEL_CHAR_WIDTH + 10) / 2 + LABEL_GAP;
        const halfHeight = (LABEL_HEIGHT + (lines.length - 1) * 13) / 2 + LABEL_GAP;
        const box = { left: point.x - halfWidth, right: point.x + halfWidth, top: point.y - halfHeight, bottom: point.y + halfHeight };
        if (box.left < 0 || box.right > size.x || box.top < 0 || box.bottom > size.y) continue;
        if (placed.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
        placed.push(box);

        const content = document.createElement("span");
        content.className = "feature-label-text";
        content.textContent = text;
        L.marker(anchor, {
            pane: "labels",
            interactive: false,
            keyboard: false,
            icon: L.divIcon({ className: "feature-label", html: content, iconSize: null })
        }).addTo(group);
    }
}

let labelFrame = 0;
map.on("moveend zoomend", () => {
    window.cancelAnimationFrame(labelFrame);
    labelFrame = window.requestAnimationFrame(() => {
        for (const layer of layerStates.values()) drawLabels(layer);
    });
});

/* Camadas do servidor de campo: padrão do desktop conforme a geometria, se o usuário não mudou o estilo. */
function applyKindDefaults(layer) {
    if (!layer.kindDefaults || layer.styleStored) return;
    if (layer.geometryKind === "point") {
        Object.assign(layer.style, { fillOpacity: 0.85, strokeColor: "#1d1d1f", strokeWidth: 1 });
    } else if (layer.geometryKind === "polygon") {
        Object.assign(layer.style, { fillOpacity: layer.style.mode === "single" ? 0.35 : 0.5 });
    } else {
        Object.assign(layer.style, { fill: false, strokeWidth: 2 });
    }
    layer.defaultStyle = { ...layer.style };
}

async function loadLayer(layer) {
    if (layer.status === "loading" || layer.status === "ready") return;
    layer.status = "loading";
    layer.error = null;
    renderLayerList();
    try {
        const response = await fetch(layer.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const collection = await response.json();
        if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
            throw new Error("O arquivo não contém um FeatureCollection GeoJSON válido.");
        }
        layer.collection = collection;
        layer.geometryKind = geometryKindOf(collection);
        applyKindDefaults(layer);
        layer.schema = inferSchema(collection.features);
        buildLayerTheme(layer);
        /* Pronta antes de entrar no mapa: rótulos e ordem de desenho só consideram camadas prontas. */
        layer.status = "ready";
        addLayerToMap(layer);
        placeCache.key = "";
        if (gps.fix) updatePlace(true);
    } catch (error) {
        layer.status = "error";
        layer.error = error;
        console.error(`Não foi possível carregar a camada ${layer.name}:`, error);
    }
    renderLayerList();
}

function setLayerVisible(layer, visible) {
    layer.visible = visible;
    if (visible) {
        if (layer.status === "ready") showLayer(layer);
        else loadLayer(layer);
    } else if (layer.mapLayer) {
        if (selectedRecord?.layer === layer) clearSelection();
        hideLayer(layer);
    }
}

function renderLayerList() {
    ui.layerList.replaceChildren();
    for (const layer of layerStates.values()) {
        const entry = document.createElement("div");
        entry.className = `layer-entry${layer.status === "error" ? " is-unavailable" : ""}`;
        const label = document.createElement("label");
        label.className = "layer-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = layer.visible && layer.status !== "error";
        checkbox.setAttribute("aria-label", `Mostrar camada ${layer.name}`);
        checkbox.addEventListener("change", () => setLayerVisible(layer, checkbox.checked));

        const swatch = document.createElement("span");
        swatch.className = "layer-swatch";
        swatch.style.setProperty("--layer-color", layer.style.color);
        const text = document.createElement("span");
        text.className = "layer-option-text";
        const name = document.createElement("span");
        name.className = "layer-option-name";
        name.textContent = layer.name;
        const meta = document.createElement("small");
        meta.textContent = {
            idle: layer.remote ? "Servidor de campo · carrega ao ativar" : "Carrega ao ativar",
            loading: "Carregando…",
            ready: `${formatNumber(layer.records.length, 0)} ${layer.records.length === 1 ? "feição" : "feições"}`,
            error: navigator.onLine ? "Indisponível · toque para tentar de novo" : "Indisponível offline"
        }[layer.status];
        text.append(name, meta);
        label.append(checkbox, swatch, text);

        const styleButton = document.createElement("button");
        styleButton.className = "layer-style-button";
        styleButton.type = "button";
        styleButton.disabled = layer.status !== "ready";
        styleButton.setAttribute("aria-label", `Estilo da camada ${layer.name}`);
        styleButton.innerHTML = '<svg class="icon" aria-hidden="true"><use href="../assets/icons/ui/sprite.svg#ic-estilos-ui"></use></svg><span>Estilo</span>';
        styleButton.addEventListener("click", () => openStyleSheet(layer));
        layer.swatchElement = swatch;
        entry.append(label, styleButton);
        ui.layerList.append(entry);
    }
}

function openStyleSheet(layer) {
    $("#style-title").textContent = layer.name;
    renderStyleControls(ui.styleControls, layer, {
        modeAttributes,
        rebuildTheme: buildLayerTheme,
        refresh: requestStyleRefresh,
        save: saveStoredStyles,
        setSwatch: (target, color) => target.swatchElement?.style.setProperty("--layer-color", color),
        formatNumber
    });
    openSheet("style");
}

function fitLayers() {
    let bounds = null;
    for (const layer of layerStates.values()) {
        if (layer.visible && layer.mapLayer && map.hasLayer(layer.mapLayer)) {
            const layerBounds = layer.mapLayer.getBounds();
            if (layerBounds.isValid()) bounds = bounds ? bounds.extend(layerBounds) : L.latLngBounds(layerBounds.getSouthWest(), layerBounds.getNorthEast());
        }
    }
    setFollow(false);
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    else map.setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom);
}

/* ---------- Folhas (painéis inferiores) ---------- */

let sheetHistoryEntry = false;
let openSheetName = null;

function hideSheets() {
    Object.values(sheets).forEach((sheet) => { sheet.hidden = true; });
    Object.values(navButtons).forEach((button) => button.setAttribute("aria-expanded", "false"));
    openSheetName = null;
    inspectLayer.clearLayers();
    clearSelection();
    updateMapModes();
}

function openSheet(name) {
    hideSheets();
    const sheet = sheets[name];
    sheet.hidden = false;
    sheet.classList.remove("is-collapsed");
    sheet.scrollTop = 0;
    openSheetName = name;
    navButtons[name]?.setAttribute("aria-expanded", "true");
    /* O botão Voltar do Android fecha a folha em vez de sair do app. */
    if (!sheetHistoryEntry) {
        history.pushState({ webgisSheet: true }, "");
        sheetHistoryEntry = true;
    }
    updateMapModes();
}

function closeSheets() {
    hideSheets();
    if (sheetHistoryEntry) {
        sheetHistoryEntry = false;
        history.back();
    }
}

function toggleSheet(name) {
    if (openSheetName === name) closeSheets();
    else openSheet(name);
}

window.addEventListener("popstate", () => {
    if (sheetHistoryEntry) {
        sheetHistoryEntry = false;
        hideSheets();
    }
});

const isMeasuring = () => openSheetName === "measure";

/* Parte do mapa não coberta pela folha aberta, em coordenadas do contêiner do mapa. */
function visibleMapArea() {
    const mapRect = mapElement.getBoundingClientRect();
    const sheet = openSheetName ? sheets[openSheetName] : null;
    let bottom = mapRect.height;
    if (sheet?.classList.contains("bottom-sheet")) {
        bottom = Math.min(bottom, sheet.getBoundingClientRect().top - mapRect.top);
    }
    return { top: 0, bottom: Math.max(80, bottom), width: mapRect.width, mapRect };
}

function visibleCenterPoint() {
    const area = visibleMapArea();
    return L.point(area.width / 2, (area.top + area.bottom) / 2);
}

const visibleCenter = () => map.containerPointToLatLng(visibleCenterPoint());

/* Leva o ponto para a área visível se ele estiver sob a folha ou fora da tela. */
function ensureVisible(latlng) {
    const area = visibleMapArea();
    const point = map.latLngToContainerPoint(latlng);
    const margin = 48;
    if (point.x < margin || point.x > area.width - margin || point.y < margin + 70 || point.y > area.bottom - margin) {
        map.panBy(point.subtract(visibleCenterPoint()), { animate: true });
    }
}

function positionCrosshair() {
    if (ui.crosshair.hidden) return;
    const { mapRect } = visibleMapArea();
    const center = visibleCenterPoint();
    ui.crosshair.style.top = `${mapRect.top + center.y}px`;
    ui.crosshair.style.left = `${mapRect.left + center.x}px`;
}

function updateMapModes() {
    const measuring = isMeasuring();
    mapElement.classList.toggle("is-capturing", measuring);
    ui.crosshair.hidden = !(measuring || openSheetName === "points");
    positionCrosshair();
    ui.navBanner.hidden = !nav.target || openSheetName === "navigate";
    if (openSheetName === "measure") renderMeasurement();
    if (openSheetName === "navigate") renderNavigation();
    if (openSheetName === "points") renderPointsList();
}

/* ---------- Feição selecionada ---------- */

function clearSelection() {
    if (!selectedRecord) return;
    applyRecordStyle(selectedRecord);
    selectedRecord = null;
    restack();
}

function chip(text, strong = "") {
    const element = document.createElement("span");
    element.className = "metric-chip";
    if (strong) {
        const value = document.createElement("strong");
        value.textContent = strong;
        element.append(value, ` ${text}`);
    } else {
        element.textContent = text;
    }
    return element;
}

function renderFeatureMetrics(record) {
    ui.featureMetrics.replaceChildren();
    const metrics = recordMetrics(record);
    if (metrics.isPolygon) {
        ui.featureMetrics.append(chip("área", formatArea(metrics.area)), chip("perímetro", formatDistance(metrics.perimeter)));
    }
    const anchor = recordAnchor(record);
    if (gps.fix && anchor) {
        const inside = metrics.isPolygon && geo.geometryContains(record.feature.geometry, gps.fix.lng, gps.fix.lat);
        ui.featureMetrics.append(inside
            ? chip("Você está aqui")
            : chip(`de você · ${formatBearing(geo.bearing(gps.fix, anchor))}`, formatDistance(geo.distance(gps.fix, anchor))));
    } else if (anchor && record.layer.geometryKind === "point") {
        ui.featureMetrics.append(chip(decimalText(anchor)));
    }
}

function openFeature(record, { fit = true } = {}) {
    if (!record.layer.visible) {
        setLayerVisible(record.layer, true);
        renderLayerList();
    }
    openSheet("feature");
    selectedRecord = record;
    applyRecordStyle(record, true);
    record.leafletLayer.bringToFront?.();
    restack();

    $("#feature-title").textContent = record.label;
    $("#feature-layer-name").textContent = record.layer.name.toLocaleUpperCase("pt-BR");
    renderFeatureMetrics(record);

    ui.featureProperties.replaceChildren();
    for (const [key, rawValue] of Object.entries(record.feature.properties || {})) {
        if (rawValue === null || rawValue === undefined || rawValue === "") continue;
        const row = document.createElement("div");
        row.className = "property-row";
        const name = document.createElement("dt");
        name.textContent = key;
        const value = document.createElement("dd");
        value.textContent = typeof rawValue === "object" ? JSON.stringify(rawValue) : String(rawValue);
        row.append(name, value);
        ui.featureProperties.append(row);
    }

    if (!fit) return;
    setFollow(false);
    const bounds = record.leafletLayer.getBounds?.();
    if (bounds?.isValid()) {
        map.fitBounds(bounds, { paddingTopLeft: [24, 90], paddingBottomRight: [24, Math.round(window.innerHeight * 0.45)], maxZoom: 17 });
    } else if (record.leafletLayer.getLatLng) {
        map.setView(record.leafletLayer.getLatLng(), Math.max(map.getZoom(), 17));
    }
}

/* ---------- Onde estou ---------- */

const placeCache = { key: "", text: "" };

/* Feições de polígono que contêm o ponto, da menor (mais específica) para a maior. */
function polygonsAt(latlng) {
    const hits = [];
    for (const layer of layerStates.values()) {
        if (layer.status !== "ready" || layer.geometryKind !== "polygon") continue;
        for (const record of layer.records) {
            if (geo.bboxContains(record.bbox, latlng.lng, latlng.lat)
                && geo.geometryContains(record.feature.geometry, latlng.lng, latlng.lat)) {
                hits.push(record);
            }
        }
    }
    return hits.sort((a, b) => recordMetrics(a).area - recordMetrics(b).area);
}

function placeText(latlng) {
    const [first] = polygonsAt(latlng);
    if (!first) return "Fora das áreas mapeadas";
    return first.layer.id === "pol_talhoes" ? `Talhão ${first.label}` : `${first.layer.name}: ${first.label}`;
}

function updatePlace(force = false) {
    if (!gps.fix) return;
    const key = `${gps.fix.lat.toFixed(5)},${gps.fix.lng.toFixed(5)}`;
    if (!force && key === placeCache.key) return;
    placeCache.key = key;
    placeCache.text = placeText(gps.fix);
    ui.hudPlace.textContent = placeCache.text;
}

/* ---------- GPS, bússola e tela ligada ---------- */

const gps = {
    watchId: null,
    fix: null,
    reasons: new Set(),
    follow: false,
    hadFix: false,
    pendingMark: false,
    marker: null,
    accuracyCircle: null
};
const compass = { active: false, heading: null, updatedAt: 0 };
let headingFrame = 0;

function currentHeading() {
    if (compass.heading !== null && performance.now() - compass.updatedAt < 3000) {
        return { value: compass.heading, source: "bússola" };
    }
    if (gps.fix && Number.isFinite(gps.fix.course) && gps.fix.speed > 0.7) {
        return { value: gps.fix.course, source: "direção do movimento" };
    }
    return null;
}

function setFollow(follow) {
    gps.follow = follow && gps.watchId !== null;
    updateLocateButton();
}

function updateLocateButton() {
    const state = gps.watchId === null ? "off" : gps.follow ? "follow" : "on";
    ui.locate.dataset.state = state;
    ui.locate.setAttribute("aria-pressed", String(state === "follow"));
    ui.locate.setAttribute("aria-label", {
        off: "Ligar o GPS e seguir minha posição",
        on: "Voltar a seguir minha posição",
        follow: "Parar de seguir (desliga o GPS se nada mais o usar)"
    }[state]);
}

function requireGps(reason) {
    gps.reasons.add(reason);
    if (gps.watchId === null) startWatch();
    updateLocateButton();
    updateWakeLock();
}

function releaseGps(reason) {
    gps.reasons.delete(reason);
    if (!gps.reasons.size) stopWatch();
    updateLocateButton();
    updateWakeLock();
}

function startWatch() {
    if (!("geolocation" in navigator)) {
        showToast("Este navegador não disponibiliza a localização do aparelho.");
        gps.reasons.clear();
        return;
    }
    ui.hud.hidden = false;
    ui.hudPlace.textContent = "Procurando sinal do GPS…";
    try {
        gps.watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 25000
        });
    } catch (error) {
        console.error("Não foi possível iniciar o GPS:", error);
        showToast("Não foi possível iniciar o GPS neste navegador.");
        gps.watchId = null;
        gps.reasons.clear();
    }
}

function stopWatch() {
    if (gps.watchId !== null) navigator.geolocation.clearWatch(gps.watchId);
    gps.watchId = null;
    gps.fix = null;
    gps.follow = false;
    gps.hadFix = false;
    gps.marker?.remove();
    gps.accuracyCircle?.remove();
    gps.marker = null;
    gps.accuracyCircle = null;
    ui.hud.hidden = true;
    placeCache.key = "";
}

function onPositionError(error) {
    if (error.code === 1) {
        showToast("Localização negada. Permita o acesso à localização nas configurações do navegador.", 6000);
        gps.reasons.clear();
        stopWatch();
        if (track.recording) pauseTrack();
        setWalk(false);
        updateLocateButton();
        updateWakeLock();
        return;
    }
    ui.hudPlace.textContent = error.code === 3 ? "Sinal fraco — aguardando o GPS…" : "Localização indisponível";
}

function gpsMarkerIcon() {
    return L.divIcon({
        className: "gps-marker-icon",
        html: '<span class="gps-cone"></span><span class="gps-dot"></span>',
        iconSize: [56, 56],
        iconAnchor: [28, 28]
    });
}

function onPosition(position) {
    const { coords, timestamp } = position;
    const previous = gps.fix;
    const fix = {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
        alt: Number.isFinite(coords.altitude) ? coords.altitude : null,
        speed: Number.isFinite(coords.speed) ? coords.speed : null,
        course: Number.isFinite(coords.heading) ? coords.heading : null,
        time: timestamp || Date.now()
    };
    if (previous) {
        const moved = geo.distance(previous, fix);
        const seconds = (fix.time - previous.time) / 1000;
        if (fix.speed === null && seconds > 0) fix.speed = moved / seconds;
        if (fix.course === null) fix.course = moved > 3 ? geo.bearing(previous, fix) : previous.course;
    }
    gps.fix = fix;

    const latlng = L.latLng(fix.lat, fix.lng);
    if (!gps.marker) {
        gps.accuracyCircle = L.circle(latlng, {
            renderer: toolsRenderer, pane: "toolsPane", radius: fix.accuracy, className: "gps-accuracy", interactive: false
        }).addTo(map);
        gps.marker = L.marker(latlng, { icon: gpsMarkerIcon(), pane: "gpsPane", interactive: false, keyboard: false }).addTo(map);
    } else {
        gps.accuracyCircle.setLatLng(latlng).setRadius(fix.accuracy);
        gps.marker.setLatLng(latlng);
    }

    if (gps.follow) {
        if (!gps.hadFix) map.setView(latlng, Math.max(map.getZoom(), 16));
        else map.panTo(latlng, { animate: true, duration: 0.5 });
    }
    gps.hadFix = true;

    renderHud();
    updatePlace();
    addTrackFix(fix);
    addWalkFix(fix);
    if (gps.pendingMark && fix.accuracy <= 50) {
        gps.pendingMark = false;
        markCurrentPosition();
    }
    renderNavigation();
    scheduleHeadingRender();
}

function renderHud() {
    const fix = gps.fix;
    if (!fix) return;
    ui.hudAccuracy.textContent = `±${formatNumber(fix.accuracy, 0)} m`;
    ui.hudAccuracy.dataset.quality = fix.accuracy <= 10 ? "good" : fix.accuracy <= 30 ? "fair" : "poor";
    ui.hudSpeed.textContent = Number.isFinite(fix.speed) ? `${formatNumber(fix.speed * 3.6, 0)} km/h` : "— km/h";
    ui.hudAltitude.textContent = fix.alt !== null ? `${formatNumber(fix.alt, 0)} m alt.` : "alt. —";
}

function scheduleHeadingRender() {
    if (headingFrame) return;
    headingFrame = window.requestAnimationFrame(() => {
        headingFrame = 0;
        const heading = currentHeading();
        const cone = gps.marker?.getElement()?.querySelector(".gps-cone");
        if (cone) {
            cone.hidden = !heading;
            if (heading) cone.style.transform = `rotate(${heading.value}deg)`;
        }
        ui.hudHeading.textContent = heading ? formatBearing(heading.value) : "rumo —";
        renderNavigationHeading(heading);
    });
}

function onOrientation(event) {
    let heading = null;
    if (Number.isFinite(event.webkitCompassHeading)) heading = event.webkitCompassHeading;
    else if ((event.absolute || event.type === "deviceorientationabsolute") && Number.isFinite(event.alpha)) heading = 360 - event.alpha;
    if (heading === null) return;
    const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
    heading = geo.normalizeDegrees(heading + screenAngle);
    if (compass.heading === null) {
        compass.heading = heading;
    } else {
        const delta = ((heading - compass.heading + 540) % 360) - 180;
        compass.heading = geo.normalizeDegrees(compass.heading + delta * 0.3);
    }
    compass.updatedAt = performance.now();
    scheduleHeadingRender();
}

/* Precisa ser chamada dentro de um toque do usuário (permissão do iOS). */
function startCompass() {
    if (compass.active || !window.DeviceOrientationEvent) return;
    const listen = () => {
        compass.active = true;
        const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
        window.addEventListener(type, onOrientation);
    };
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
            .then((answer) => { if (answer === "granted") listen(); })
            .catch(() => { /* Sem bússola: usa a direção do movimento. */ });
    } else {
        listen();
    }
}

let wakeLock = null;
let wakeLockPending = false;
async function updateWakeLock() {
    const wanted = ui.keepAwake.checked && gps.watchId !== null && document.visibilityState === "visible";
    if (!("wakeLock" in navigator)) return;
    if (wanted && !wakeLock && !wakeLockPending) {
        wakeLockPending = true;
        try {
            wakeLock = await navigator.wakeLock.request("screen");
            wakeLock.addEventListener("release", () => { wakeLock = null; });
        } catch {
            wakeLock = null;
        } finally {
            wakeLockPending = false;
        }
    } else if (!wanted && wakeLock) {
        const lock = wakeLock;
        wakeLock = null;
        lock.release().catch(() => {});
    }
}

function onLocateClick() {
    startCompass();
    if (gps.watchId === null) {
        requireGps("user");
        setFollow(true);
        showToast("Procurando sua posição…", 2500);
    } else if (!gps.follow) {
        gps.reasons.add("user");
        setFollow(true);
        if (gps.fix) map.setView([gps.fix.lat, gps.fix.lng], Math.max(map.getZoom(), 16));
    } else {
        setFollow(false);
        releaseGps("user");
        if (gps.watchId !== null) showToast("O GPS continua ligado para a navegação, a trilha ou a medição.");
    }
}

/* Liga o GPS sem mover o mapa (para medir, marcar ou navegar). */
function ensureGps() {
    startCompass();
    if (gps.watchId === null) requireGps("user");
    else gps.reasons.add("user");
    updateLocateButton();
}

/* ---------- Navegação até um destino ---------- */

const nav = { target: null, arrived: false };

function startNavigation(target) {
    nav.target = { lat: target.lat, lng: target.lng, name: target.name || "Destino", record: target.record || null };
    nav.arrived = false;
    startCompass();
    requireGps("navigate");
    navigationLayer.clearLayers();
    L.circleMarker([target.lat, target.lng], {
        renderer: toolsRenderer, pane: "toolsPane", radius: 11, className: "nav-target", interactive: false
    }).addTo(navigationLayer);
    nav.line = L.polyline([], {
        renderer: toolsRenderer, pane: "toolsPane", className: "nav-line", interactive: false
    }).addTo(navigationLayer);
    openSheet("navigate");
    /* Recolhida: bússola e distância ficam visíveis, e o mapa aparece acima. */
    sheets.navigate.classList.add("is-collapsed");
    positionCrosshair();
    if (gps.fix) {
        map.fitBounds(L.latLngBounds([gps.fix, target]), { paddingTopLeft: [40, 110], paddingBottomRight: [40, Math.round(window.innerHeight * 0.38)], maxZoom: 17 });
    } else {
        map.setView([target.lat, target.lng], Math.max(map.getZoom(), 15));
        showToast("Procurando sua posição para calcular o caminho…");
    }
    renderNavigation();
}

function stopNavigation() {
    nav.target = null;
    nav.line = null;
    navigationLayer.clearLayers();
    releaseGps("navigate");
    renderNavigation();
    updateMapModes();
}

function renderNavigation() {
    const target = nav.target;
    ui.navigateActive.hidden = !target;
    ui.navigateActions.hidden = !target;
    ui.navBanner.hidden = !target || openSheetName === "navigate";
    ui.navigateTitle.textContent = target ? target.name : "Navegar";
    ui.navigateKicker.textContent = target ? "DESTINO" : "NAVEGAÇÃO";
    if (!target) return;

    if (!gps.fix) {
        ui.navigateDistance.textContent = "—";
        ui.navigateBearing.textContent = "Aguardando o GPS…";
        ui.navigateEta.textContent = "";
        ui.navBannerDistance.textContent = "GPS…";
        ui.navBannerName.textContent = target.name;
        return;
    }

    const meters = geo.distance(gps.fix, target);
    const azimuth = geo.bearing(gps.fix, target);
    const inside = target.record && recordMetrics(target.record).isPolygon
        && geo.geometryContains(target.record.feature.geometry, gps.fix.lng, gps.fix.lat);
    nav.line?.setLatLngs([[gps.fix.lat, gps.fix.lng], [target.lat, target.lng]]);

    ui.navigateDistance.textContent = inside ? "Você está dentro" : formatDistance(meters);
    ui.navigateBearing.textContent = `Azimute ${formatBearing(azimuth)} · precisão ±${formatNumber(gps.fix.accuracy, 0)} m`;
    ui.navigateEta.textContent = gps.fix.speed > 0.5 && !inside
        ? `≈ ${formatDuration(meters / gps.fix.speed * 1000)} a ${formatNumber(gps.fix.speed * 3.6, 0)} km/h`
        : "";
    ui.navBannerDistance.textContent = inside ? "Dentro" : formatDistance(meters);
    ui.navBannerName.textContent = target.name;

    const arrivalRadius = Math.max(ARRIVAL_RADIUS_M, Math.min(gps.fix.accuracy, 30));
    if (!nav.arrived && (inside || meters <= arrivalRadius)) {
        nav.arrived = true;
        vibrate([200, 100, 200]);
        showToast(`Você chegou: ${target.name}.`, 5000);
    } else if (nav.arrived && !inside && meters > arrivalRadius * 3) {
        nav.arrived = false;
    }
    scheduleHeadingRender();
}

function renderNavigationHeading(heading) {
    if (!nav.target || !gps.fix) {
        ui.navigateHeadingSource.textContent = "";
        return;
    }
    const azimuth = geo.bearing(gps.fix, nav.target);
    const relative = heading ? azimuth - heading.value : azimuth;
    ui.compassArrow.style.transform = `rotate(${relative}deg)`;
    ui.compassRose.style.transform = `rotate(${heading ? -heading.value : 0}deg)`;
    ui.navBannerArrow.style.transform = `rotate(${relative}deg)`;
    ui.navigateHeadingSource.textContent = heading
        ? `Seta relativa à sua frente (${heading.source}).`
        : "Sem bússola: a seta aponta em relação ao norte do mapa. Ande alguns metros para usar a direção do movimento.";
}

function openExternalRoute() {
    if (!nav.target) return;
    const { lat, lng } = nav.target;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=driving`, "_blank", "noopener");
}

/* ---------- Pontos e trilhas salvos ---------- */

const field = loadFieldData();

function persistField(message = "") {
    const ok = saveFieldData({ waypoints: field.waypoints, tracks: field.tracks, recording: track.current });
    if (!ok) showToast("Armazenamento cheio ou bloqueado: exporte e apague trilhas antigas.", 6000);
    else if (message) showToast(message);
    return ok;
}

function waypointIcon() {
    return L.divIcon({
        className: "waypoint-icon",
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#m-ponto"></use></svg>',
        iconSize: [30, 30],
        iconAnchor: [15, 28]
    });
}

function renderWaypointsOnMap() {
    waypointsLayer.clearLayers();
    for (const waypoint of field.waypoints) {
        L.marker([waypoint.lat, waypoint.lng], { icon: waypointIcon(), pane: "waypointPane", title: waypoint.name })
            .on("click", (event) => {
                L.DomEvent.stop(event);
                if (!isMeasuring()) openPoint(waypoint, { waypoint });
            })
            .addTo(waypointsLayer);
    }
}

function renderTracksOnMap() {
    tracksLayer.clearLayers();
    for (const saved of field.tracks) {
        L.polyline(saved.points.map(([lat, lng]) => [lat, lng]), {
            renderer: toolsRenderer, pane: "toolsPane", className: "track-line", interactive: false
        }).addTo(tracksLayer);
    }
    track.line = L.polyline((track.current?.points || []).map(([lat, lng]) => [lat, lng]), {
        renderer: toolsRenderer, pane: "toolsPane", className: "track-line is-recording", interactive: false
    }).addTo(tracksLayer);
}

function nextWaypointName() {
    return `Ponto ${field.waypoints.length + 1}`;
}

function markCurrentPosition() {
    if (!gps.fix) {
        gps.pendingMark = true;
        ensureGps();
        showToast("Aguardando o GPS para marcar sua posição…");
        return;
    }
    const waypoint = {
        id: newId(),
        name: nextWaypointName(),
        note: "",
        lat: gps.fix.lat,
        lng: gps.fix.lng,
        alt: gps.fix.alt,
        accuracy: gps.fix.accuracy,
        createdAt: Date.now()
    };
    field.waypoints.push(waypoint);
    persistField(`${waypoint.name} salvo (±${formatNumber(waypoint.accuracy, 0)} m).`);
    renderWaypointsOnMap();
    vibrate(60);
    openPoint(waypoint, { waypoint });
}

let pointContext = null;

function openPoint(latlng, { title = "", waypoint = null, alt = null, accuracy = null } = {}) {
    const point = { lat: latlng.lat, lng: latlng.lng };
    pointContext = { ...point, waypoint, alt: waypoint?.alt ?? alt, accuracy: waypoint?.accuracy ?? accuracy };
    openSheet("point");

    ui.pointTitle.textContent = waypoint ? waypoint.name : title || "Ponto no mapa";
    ui.pointDecimal.textContent = decimalText(point);
    ui.pointDms.textContent = `${geo.formatDms(point.lat, true)} ${geo.formatDms(point.lng, false)}`;
    ui.pointUtm.textContent = geo.formatUtm(point.lat, point.lng);
    ui.pointPlace.textContent = placeText(point);
    const fromMe = gps.fix ? geo.distance(gps.fix, point) : NaN;
    ui.pointFromMe.textContent = !gps.fix
        ? "GPS desligado"
        : fromMe <= Math.max(3, gps.fix.accuracy)
            ? `Na sua posição (±${formatNumber(gps.fix.accuracy, 0)} m)`
            : `${formatDistance(fromMe)} · ${formatBearing(geo.bearing(gps.fix, point))}`;
    ui.pointName.value = waypoint ? waypoint.name : (title || nextWaypointName());
    ui.pointNote.value = waypoint?.note || "";
    ui.pointDelete.hidden = !waypoint;
    $("#point-save").querySelector("span").textContent = waypoint ? "Salvar alterações" : "Salvar ponto";
    ui.pointShare.hidden = typeof navigator.share !== "function";

    inspectLayer.clearLayers();
    if (!waypoint) {
        L.circleMarker([point.lat, point.lng], {
            renderer: toolsRenderer, pane: "toolsPane", radius: 9, className: "inspect-point", interactive: false
        }).addTo(inspectLayer);
    }
    ensureVisible(point);
}

function savePoint(event) {
    event.preventDefault();
    if (!pointContext) return;
    const name = ui.pointName.value.trim() || nextWaypointName();
    const note = ui.pointNote.value.trim();
    if (pointContext.waypoint) {
        Object.assign(pointContext.waypoint, { name, note });
        persistField("Ponto atualizado.");
    } else {
        const waypoint = {
            id: newId(), name, note,
            lat: pointContext.lat, lng: pointContext.lng,
            alt: pointContext.alt, accuracy: pointContext.accuracy,
            createdAt: Date.now()
        };
        field.waypoints.push(waypoint);
        persistField(`${name} salvo.`);
        pointContext.waypoint = waypoint;
    }
    renderWaypointsOnMap();
    openPoint(pointContext.waypoint, { waypoint: pointContext.waypoint });
}

function deletePoint() {
    const waypoint = pointContext?.waypoint;
    if (!waypoint || !window.confirm(`Excluir o ponto “${waypoint.name}”?`)) return;
    field.waypoints = field.waypoints.filter((item) => item.id !== waypoint.id);
    persistField("Ponto excluído.");
    renderWaypointsOnMap();
    closeSheets();
}

function pointShareText() {
    const { lat, lng } = pointContext;
    return [
        ui.pointName.value.trim() || ui.pointTitle.textContent,
        decimalText(pointContext),
        `UTM ${geo.formatUtm(lat, lng)}`,
        `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
    ].join("\n");
}

async function sharePoint() {
    try {
        await navigator.share({ title: ui.pointTitle.textContent, text: pointShareText() });
    } catch (error) {
        if (error.name !== "AbortError") copyText(pointShareText(), "Ponto copiado.");
    }
}

function listItem({ title, meta, onOpen, actionLabel, onAction }) {
    const item = document.createElement("div");
    item.className = "list-item";
    const main = document.createElement("button");
    main.type = "button";
    main.className = "list-item-main";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = meta;
    main.append(strong, small);
    main.addEventListener("click", onOpen);
    item.append(main);
    if (actionLabel) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "secondary-button";
        action.textContent = actionLabel;
        action.addEventListener("click", onAction);
        item.append(action);
    }
    return item;
}

function emptyMessage(text) {
    const element = document.createElement("p");
    element.className = "empty-results";
    element.textContent = text;
    return element;
}

function renderPointsList() {
    ui.waypointList.replaceChildren();
    const waypoints = [...field.waypoints].sort((a, b) => b.createdAt - a.createdAt);
    if (!waypoints.length) {
        ui.waypointList.append(emptyMessage("Nenhum ponto salvo. Marque sua posição, o centro da mira, ou toque e segure no mapa."));
    }
    for (const waypoint of waypoints) {
        const meters = gps.fix ? geo.distance(gps.fix, waypoint) : NaN;
        const fromMe = !gps.fix ? ""
            : meters <= Math.max(3, gps.fix.accuracy) ? " · aqui"
                : ` · ${formatDistance(meters)} ${geo.cardinal(geo.bearing(gps.fix, waypoint))}`;
        ui.waypointList.append(listItem({
            title: waypoint.name,
            meta: `${formatDate(waypoint.createdAt)}${fromMe}${waypoint.note ? ` · ${waypoint.note}` : ""}`,
            onOpen: () => openPoint(waypoint, { waypoint }),
            actionLabel: "Ir",
            onAction: () => startNavigation(waypoint)
        }));
    }

    ui.trackList.replaceChildren();
    if (!field.tracks.length) ui.trackList.append(emptyMessage("Nenhuma trilha salva. Grave uma em Navegar → Trilha GPS."));
    for (const saved of [...field.tracks].sort((a, b) => b.createdAt - a.createdAt)) {
        ui.trackList.append(listItem({
            title: saved.name,
            meta: `${formatDate(saved.createdAt)} · ${formatDistance(saved.distance)} · ${saved.points.length} pontos`,
            onOpen: () => {
                setFollow(false);
                map.fitBounds(L.latLngBounds(saved.points.map(([lat, lng]) => [lat, lng])), { padding: [30, 30], maxZoom: 18 });
                ui.waypointList.closest(".bottom-sheet").classList.add("is-collapsed");
            },
            actionLabel: "Excluir",
            onAction: () => {
                if (!window.confirm(`Excluir a trilha “${saved.name}”?`)) return;
                field.tracks = field.tracks.filter((item) => item.id !== saved.id);
                persistField("Trilha excluída.");
                renderTracksOnMap();
                renderPointsList();
            }
        }));
    }
}

async function exportFile(extension, type, content) {
    const name = `webgis-campo-${new Date().toISOString().slice(0, 10)}.${extension}`;
    const file = new File([content], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: name });
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
        }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast(`Arquivo ${name} gerado.`);
}

function exportData(format) {
    const data = { waypoints: field.waypoints, tracks: field.tracks };
    if (!data.waypoints.length && !data.tracks.length) {
        showToast("Não há pontos nem trilhas para exportar.");
        return;
    }
    if (format === "gpx") exportFile("gpx", "application/gpx+xml", geo.buildGpx(data));
    else exportFile("geojson", "application/geo+json", geo.buildGeoJson(data));
}

/* ---------- Gravação de trilha ---------- */

const track = { current: field.recording, recording: false, line: null, lastSave: 0 };

function startTrack() {
    startCompass();
    if (!track.current) {
        const now = Date.now();
        track.current = { id: newId(), name: `Trilha ${formatDate(now)}`, createdAt: now, distance: 0, points: [] };
    }
    track.recording = true;
    requireGps("track");
    persistField();
    renderTrackPanel();
    showToast("Gravando trilha. Mantenha o app aberto.");
}

function pauseTrack() {
    track.recording = false;
    releaseGps("track");
    persistField();
    renderTrackPanel();
}

function finishTrack() {
    if (!track.current) return;
    const finished = track.current;
    track.current = null;
    if (track.recording) {
        track.recording = false;
        releaseGps("track");
    }
    if (finished.points.length >= 2) {
        field.tracks.push(finished);
        persistField(`Trilha salva: ${formatDistance(finished.distance)}.`);
    } else {
        persistField();
        showToast("Trilha descartada: poucos pontos registrados.");
    }
    renderTracksOnMap();
    renderTrackPanel();
}

function addTrackFix(fix) {
    if (!track.recording || !track.current || fix.accuracy > TRACK_MAX_ACCURACY_M) return;
    const points = track.current.points;
    const last = points[points.length - 1];
    const step = last ? geo.distance({ lat: last[0], lng: last[1] }, fix) : Infinity;
    if (last && step < Math.max(TRACK_MIN_STEP_M, fix.accuracy * 0.5)) return;
    points.push([fix.lat, fix.lng, fix.alt, fix.time]);
    if (Number.isFinite(step)) track.current.distance += step;
    track.line?.addLatLng([fix.lat, fix.lng]);
    if (Date.now() - track.lastSave > 15000) {
        track.lastSave = Date.now();
        persistField();
    }
    renderTrackPanel();
}

function renderTrackPanel() {
    const current = track.current;
    ui.trackDistance.textContent = formatDistance(current?.distance || 0);
    if (!current) {
        ui.trackDetails.textContent = "Grave o caminho percorrido para salvar ou exportar.";
    } else {
        const first = current.points[0]?.[3];
        const last = current.points[current.points.length - 1]?.[3];
        ui.trackDetails.textContent = `${current.points.length} pontos${first && last ? ` · ${formatDuration(last - first)}` : ""}${track.recording ? "" : " · pausada"}`;
    }
    ui.trackToggle.querySelector("span").textContent = track.recording ? "Pausar" : current ? "Continuar" : "Gravar";
    ui.trackToggle.classList.toggle("is-recording", track.recording);
    ui.trackFinish.disabled = !current;
    ui.recordingChip.hidden = !track.recording;
    ui.recordingChipText.textContent = `Gravando · ${formatDistance(current?.distance || 0)}`;
}

/* ---------- Medição ---------- */

const measure = { mode: "distance", points: [], walking: false };

function setMeasureMode(mode) {
    measure.mode = mode;
    $("#measure-distance").setAttribute("aria-checked", String(mode === "distance"));
    $("#measure-area").setAttribute("aria-checked", String(mode === "area"));
    renderMeasurement();
}

function addMeasurePoint(latlng) {
    measure.points.push(L.latLng(latlng.lat, latlng.lng));
    renderMeasurement();
}

function setWalk(active) {
    measure.walking = active;
    ui.measureWalk.setAttribute("aria-pressed", String(active));
    if (active) {
        startCompass();
        requireGps("walk");
        showToast("Caminhe pelo trajeto ou contorno: os pontos entram a cada 5 m.");
    } else if (gps.reasons.has("walk")) {
        releaseGps("walk");
    }
}

function addWalkFix(fix) {
    if (!measure.walking || fix.accuracy > WALK_MAX_ACCURACY_M) return;
    const last = measure.points[measure.points.length - 1];
    if (last && geo.distance(last, fix) < Math.max(WALK_MIN_STEP_M, fix.accuracy)) return;
    addMeasurePoint(fix);
}

function measureSummary() {
    const points = measure.points;
    if (measure.mode === "area") {
        if (points.length < 3) return null;
        const area = geo.ringArea(points);
        return {
            result: formatArea(area),
            details: `${formatNumber(area, 0)} m² · perímetro ${formatDistance(geo.ringPerimeter(points))} · ${points.length} vértices`,
            copy: `Área: ${formatArea(area)} (${formatNumber(area, 0)} m²) · Perímetro: ${formatDistance(geo.ringPerimeter(points))}`
        };
    }
    if (points.length < 2) return null;
    const total = geo.pathLength(points);
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    return {
        result: formatDistance(total),
        details: `${points.length} pontos · último trecho ${formatDistance(geo.distance(a, b))} a ${formatBearing(geo.bearing(a, b))}`,
        copy: `Distância: ${formatDistance(total)} (${points.length} pontos)`
    };
}

function renderMeasurement() {
    measurementLayer.clearLayers();
    const points = measure.points;
    const isArea = measure.mode === "area";
    const shape = { renderer: toolsRenderer, pane: "toolsPane", interactive: false };

    if (isArea && points.length >= 3) {
        L.polygon(points, { ...shape, className: "measure-shape area" }).addTo(measurementLayer);
    } else if (points.length >= 2) {
        L.polyline(points, { ...shape, className: "measure-shape" }).addTo(measurementLayer);
    }
    const segments = isArea && points.length >= 3 ? points.length : points.length - 1;
    if (segments <= 24) {
        for (let index = 0; index < segments; index += 1) {
            const a = points[index];
            const b = points[(index + 1) % points.length];
            L.tooltip({ permanent: true, direction: "center", className: "measure-label", interactive: false })
                .setLatLng([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2])
                .setContent(formatDistance(geo.distance(a, b)))
                .addTo(measurementLayer);
        }
    }
    points.forEach((point, index) => {
        L.circleMarker(point, {
            ...shape, radius: index === points.length - 1 ? 6 : 4.5, className: "measure-vertex"
        }).addTo(measurementLayer);
    });

    const summary = measureSummary();
    ui.measureResult.textContent = summary?.result || (isArea ? "Marque 3 pontos" : "Marque 2 pontos");
    ui.measureDetails.textContent = summary?.details || `${points.length} ${points.length === 1 ? "ponto" : "pontos"}`;
    $("#undo-measure-point").disabled = points.length === 0;
    $("#clear-measure").disabled = points.length === 0;
    $("#copy-measure").disabled = !summary;
    $("#save-measure").disabled = !summary;
}

function saveMeasureAsTrack() {
    const summary = measureSummary();
    if (!summary) return;
    const points = measure.mode === "area" ? [...measure.points, measure.points[0]] : measure.points;
    const now = Date.now();
    field.tracks.push({
        id: newId(),
        name: `${measure.mode === "area" ? "Área" : "Distância"} ${summary.result} · ${formatDate(now)}`,
        createdAt: now,
        distance: geo.pathLength(points),
        points: points.map((point) => [point.lat, point.lng, null, null])
    });
    persistField("Medição salva em Pontos → Trilhas.");
    renderTracksOnMap();
}

/* ---------- Busca ---------- */

let searchTimer = 0;

function searchResultButton({ title, subtitle, badge, onClick }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    const text = document.createElement("span");
    text.className = "search-result-text";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = subtitle;
    text.append(strong, small);
    button.append(text);
    if (badge) {
        const tag = document.createElement("span");
        tag.className = "search-badge";
        tag.textContent = badge;
        button.append(tag);
    }
    button.addEventListener("click", onClick);
    return button;
}

function recordResult(record, distanceFromMe) {
    return searchResultButton({
        title: record.label,
        subtitle: record.layer.name,
        badge: Number.isFinite(distanceFromMe) ? formatDistance(distanceFromMe) : "",
        onClick: () => {
            ui.searchInput.blur();
            openFeature(record);
        }
    });
}

function withDistance(records) {
    if (!gps.fix) return records.map((record) => ({ record, meters: NaN }));
    return records
        .map((record) => {
            const anchor = recordAnchor(record);
            return { record, meters: anchor ? geo.distance(gps.fix, anchor) : Infinity };
        })
        .sort((a, b) => a.meters - b.meters);
}

function showSearchResults(query) {
    ui.searchResults.replaceChildren();
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const coordinate = geo.parseCoordinate(query);

    if (!terms.length) {
        if (!gps.fix) {
            ui.searchCaption.textContent = "Busque por talhão, fazenda, variedade, coleta… ou digite uma coordenada (decimal, GMS ou UTM). Com o GPS ligado, aparecem as feições mais próximas.";
            ui.searchResults.hidden = true;
            return;
        }
        ui.searchCaption.textContent = "Perto de você";
        const candidates = featureRecords.filter((record) => record.layer.visible && record.layer.interactive !== false);
        withDistance(candidates).slice(0, NEARBY_LIMIT)
            .forEach(({ record, meters }) => ui.searchResults.append(recordResult(record, meters)));
        ui.searchResults.hidden = !ui.searchResults.childElementCount;
        return;
    }

    if (coordinate) {
        ui.searchResults.append(searchResultButton({
            title: decimalText(coordinate),
            subtitle: `Coordenada · UTM ${geo.formatUtm(coordinate.lat, coordinate.lng)}`,
            badge: gps.fix ? formatDistance(geo.distance(gps.fix, coordinate)) : "",
            onClick: () => {
                ui.searchInput.blur();
                setFollow(false);
                map.setView(coordinate, Math.max(map.getZoom(), 16));
                openPoint(coordinate, { title: "Coordenada digitada" });
            }
        }));
    }

    const matches = featureRecords.filter((record) => terms.every((term) => record.text.includes(term)));
    const ranked = withDistance(matches).slice(0, SEARCH_LIMIT);
    ui.searchCaption.textContent = matches.length
        ? `${formatNumber(matches.length, 0)} ${matches.length === 1 ? "resultado" : "resultados"}${matches.length > SEARCH_LIMIT ? ` · mostrando ${SEARCH_LIMIT}` : ""}${gps.fix ? " · mais próximos primeiro" : ""}`
        : coordinate ? "" : "Nenhum resultado nos dados carregados.";
    ranked.forEach(({ record, meters }) => ui.searchResults.append(recordResult(record, meters)));
    ui.searchResults.hidden = !ui.searchResults.childElementCount;
}

/* ---------- Eventos ---------- */

navButtons.layers.addEventListener("click", () => toggleSheet("layers"));
navButtons.search.addEventListener("click", () => {
    toggleSheet("search");
    if (openSheetName === "search") {
        showSearchResults(ui.searchInput.value);
        ui.searchInput.focus();
    }
});
navButtons.measure.addEventListener("click", () => toggleSheet("measure"));
navButtons.navigate.addEventListener("click", () => toggleSheet("navigate"));
navButtons.points.addEventListener("click", () => toggleSheet("points"));

document.querySelectorAll(".close-sheet").forEach((button) => button.addEventListener("click", closeSheets));
document.querySelectorAll(".sheet-handle").forEach((handle) => {
    handle.addEventListener("click", () => {
        handle.closest(".bottom-sheet").classList.toggle("is-collapsed");
        positionCrosshair();
    });
});
window.addEventListener("resize", positionCrosshair);

ui.locate.addEventListener("click", onLocateClick);
$("#home-button").addEventListener("click", fitLayers);
ui.hud.addEventListener("click", () => {
    if (gps.fix) openPoint(gps.fix, { title: "Minha posição", alt: gps.fix.alt, accuracy: gps.fix.accuracy });
});
ui.navBanner.addEventListener("click", () => openSheet("navigate"));

document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.addEventListener("click", () => {
        basemapChoice = button.dataset.basemap;
        writeStorage(STORAGE.basemap, basemapChoice);
        applyBasemap();
        if (!navigator.onLine && basemapChoice !== "nenhum") showToast("O mapa-base aparece quando houver conexão.");
    });
});
document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
        writeStorage(STORAGE.theme, button.dataset.themeOption);
        applyTheme(button.dataset.themeOption);
    });
});

$("#feature-navigate").addEventListener("click", () => {
    const record = selectedRecord;
    const anchor = record && recordAnchor(record);
    if (anchor) startNavigation({ lat: anchor.lat, lng: anchor.lng, name: record.label, record });
});
$("#feature-point").addEventListener("click", () => {
    const record = selectedRecord;
    const anchor = record && recordAnchor(record);
    if (anchor) openPoint(anchor, { title: record.label });
});

$("#measure-distance").addEventListener("click", () => setMeasureMode("distance"));
$("#measure-area").addEventListener("click", () => setMeasureMode("area"));
$("#measure-add-center").addEventListener("click", () => addMeasurePoint(visibleCenter()));
$("#measure-add-gps").addEventListener("click", () => {
    if (gps.fix) {
        addMeasurePoint(gps.fix);
        if (gps.fix.accuracy > 15) showToast(`Ponto adicionado com precisão de ±${formatNumber(gps.fix.accuracy, 0)} m.`);
    } else {
        ensureGps();
        showToast("Aguardando o GPS. Toque de novo quando a posição aparecer.");
    }
});
ui.measureWalk.addEventListener("click", () => setWalk(!measure.walking));
$("#undo-measure-point").addEventListener("click", () => {
    measure.points.pop();
    renderMeasurement();
});
$("#clear-measure").addEventListener("click", () => {
    measure.points = [];
    setWalk(false);
    renderMeasurement();
});
$("#copy-measure").addEventListener("click", () => {
    const summary = measureSummary();
    if (summary) copyText(summary.copy, "Medição copiada.");
});
$("#save-measure").addEventListener("click", saveMeasureAsTrack);

$("#goto-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#goto-input");
    const coordinate = geo.parseCoordinate(input.value);
    if (!coordinate) {
        showToast("Coordenada não reconhecida. Ex.: -20.0868, -46.0424 ou 23K 391015 7778573.", 5000);
        return;
    }
    input.blur();
    startNavigation({ ...coordinate, name: decimalText(coordinate) });
});
$("#navigate-stop").addEventListener("click", stopNavigation);
$("#navigate-external").addEventListener("click", openExternalRoute);
$("#navigate-save").addEventListener("click", () => {
    if (nav.target) openPoint(nav.target, { title: nav.target.name });
});
ui.trackToggle.addEventListener("click", () => (track.recording ? pauseTrack() : startTrack()));
ui.trackFinish.addEventListener("click", finishTrack);
ui.keepAwake.checked = readStorage(STORAGE.keepAwake, "1") === "1";
ui.keepAwake.addEventListener("change", () => {
    writeStorage(STORAGE.keepAwake, ui.keepAwake.checked ? "1" : "0");
    updateWakeLock();
});

$("#mark-gps").addEventListener("click", markCurrentPosition);
$("#mark-center").addEventListener("click", () => openPoint(visibleCenter(), { title: "Centro da mira" }));
$("#export-gpx").addEventListener("click", () => exportData("gpx"));
$("#export-geojson").addEventListener("click", () => exportData("geojson"));

$("#point-form").addEventListener("submit", savePoint);
$("#point-delete").addEventListener("click", deletePoint);
$("#point-copy").addEventListener("click", () => pointContext && copyText(pointShareText(), "Coordenadas copiadas."));
$("#point-share").addEventListener("click", sharePoint);
$("#point-navigate").addEventListener("click", () => {
    if (!pointContext) return;
    startNavigation({ lat: pointContext.lat, lng: pointContext.lng, name: ui.pointName.value.trim() || ui.pointTitle.textContent });
});

map.on("click", ({ latlng }) => {
    if (isMeasuring()) addMeasurePoint(latlng);
});
/* Toque longo (ou clique direito): coordenadas do ponto. */
map.on("contextmenu", ({ latlng }) => {
    vibrate(30);
    openPoint(latlng);
});
map.on("dragstart", () => {
    if (gps.follow) setFollow(false);
});

$("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    showSearchResults(ui.searchInput.value);
});
ui.searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => showSearchResults(ui.searchInput.value), SEARCH_DEBOUNCE_MS);
});
$("#clear-search").addEventListener("click", () => {
    ui.searchInput.value = "";
    showSearchResults("");
    ui.searchInput.focus();
});

window.addEventListener("offline", () => updateConnectivity(true));
window.addEventListener("online", () => {
    updateConnectivity(true);
    for (const layer of layerStates.values()) {
        if (layer.visible && layer.status === "error") {
            layer.status = "idle";
            loadLayer(layer);
        }
    }
});
window.addEventListener("storage", (event) => {
    if (event.key === STORAGE.theme || event.key === "webgis-theme") applyTheme();
});
document.addEventListener("visibilitychange", () => {
    updateWakeLock();
    if (document.visibilityState === "hidden" && track.current) persistField();
});
window.addEventListener("pagehide", () => {
    if (track.current) persistField();
});

let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    ui.install.hidden = false;
});
ui.install.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    ui.install.hidden = true;
});
window.addEventListener("appinstalled", () => {
    installPrompt = null;
    ui.install.hidden = true;
});

/* ---------- Início ---------- */

updateConnectivity();
applyBasemap();
renderLayerList();
renderWaypointsOnMap();
renderTracksOnMap();
renderTrackPanel();
setMeasureMode("distance");
updateLocateButton();

if (catalog.server) {
    let host = catalog.server.url;
    try {
        host = new URL(catalog.server.url).host;
    } catch {
        /* Mantém o endereço como foi configurado. */
    }
    ui.campoStatus.textContent = `Coletas reais do servidor de campo (${host}). Camadas desligadas carregam ao ativar.`;
}
/* Atalhos do app instalado (manifest): #navegar e #pontos. */
const shortcut = { "#navegar": "navigate", "#pontos": "points" }[location.hash];
if (shortcut) {
    history.replaceState(null, "", location.pathname + location.search);
    openSheet(shortcut);
}
if (track.current) showToast("Há uma trilha em andamento (pausada). Continue em Navegar → Trilha GPS.", 6000);

const initialLayers = [...layerStates.values()].filter((layer) => layer.visible);
let loadedCount = 0;
ui.loading.textContent = `Carregando camadas (0/${initialLayers.length})…`;
Promise.all(initialLayers.map((layer) => loadLayer(layer).then(() => {
    loadedCount += 1;
    ui.loading.textContent = `Carregando camadas (${loadedCount}/${initialLayers.length})…`;
}))).then(() => {
    ui.loading.hidden = true;
    if (!savedView && !gps.follow) fitLayers();
    if (!featureRecords.length) {
        ui.loading.textContent = "Nenhum dado pôde ser carregado. Conecte-se à internet e tente novamente.";
        ui.loading.hidden = false;
    } else if (initialLayers.some((layer) => layer.status === "error")) {
        showToast("Algumas camadas não foram carregadas. Confira o painel Camadas.");
    }
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.error("Não foi possível preparar o uso offline:", error);
        showToast("Não foi possível preparar o uso offline neste navegador.");
    });
}
