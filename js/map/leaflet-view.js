/* ============================================================
   ADAPTADOR LEAFLET

   Único módulo que conhece o Leaflet além dos controles do mapa.
   Recebe camadas do store e as desenha; devolve eventos de
   interação (clique em feature, clique no vazio, popup fechado)
   em termos de { layerId, uid }, nunca de objetos Leaflet.

   Uma futura troca para MapLibre deve reimplementar esta mesma
   interface.

   Renderização: um único L.canvas compartilhado. Features que não
   passam nos filtros saem do grupo (não são só escondidas), então
   o canvas não as percorre em pan/zoom.
   ============================================================ */

import { labelAnchor } from "./label-anchor.js";

const STATE_DEFAULT = 0;
const STATE_MATCH = 1;
const STATE_SELECTED = 2;
const STATE_SELECTED_MATCH = 3;
/* Busca ativa e a feição não casa com ela: esmaecida. */
const STATE_DIMMED = 4;

const isSelectedState = (state) => state === STATE_SELECTED || state === STATE_SELECTED_MATCH;

/* Espessura da linha das camadas "outline" (ex.: Fazendas). */
const OUTLINE_WEIGHT = 1.3;

/*
   Halo escuro sob o contorno das camadas "outline": a linha clara
   fica legível tanto sobre o satélite claro quanto sobre o escuro.
*/

const OUTLINE_HALO = {
    color: "#000000",
    weight: 3,
    opacity: 0.45,
    fill: false,
    lineCap: "round",
    lineJoin: "round",
    interactive: false
};

/*
   Contorno dos polígonos (camadas com preenchimento): branco fino
   e translúcido, discreto, para marcar as divisas em qualquer tema.
*/
const POLYGON_STROKE = "#ffffff";
const POLYGON_STROKE_WEIGHT = 0.8;
const POLYGON_STROKE_OPACITY = 0.55;

const POINT_RADIUS = 5;
const POINT_RADIUS_SELECTED = 8;


/*
   Estilo por estado, em dois níveis independentes:
   - busca: os achados ficam com o estilo normal (cor da camada ou
     do tema) e o que não casa esmaece (STATE_DIMMED);
   - seleção (nível acima): as selecionadas ganham contorno branco
     forte e preenchimento mais intenso, com ou sem busca ativa.
*/
const styleFor = (color, state, isPoint, themed = false, outline = false) => {
    const base = { lineCap: "round", lineJoin: "round", opacity: 1, fillColor: color };

    /* Opacidade de preenchimento "normal": tema precisa de mais para a cor ser lida sobre o satélite. */
    const fill = isPoint ? 0.85 : themed ? 0.5 : 0.35;

    if (outline && !isPoint) {
        /* Camada de referência (style: "outline"): só a borda, sobre um halo escuro (OUTLINE_HALO). */
        return { ...base, color, weight: OUTLINE_WEIGHT, opacity: state === STATE_DIMMED ? 0.3 : 1, fill: false };
    }

    /*
       Seleção (clique no mapa ou na tabela): nível acima da busca.
       Contorno branco forte e preenchimento mais intenso, na própria
       cor (camada ou tema); nada mais é esmaecido por ela.
    */
    if (isSelectedState(state)) {
        return {
            ...base,
            color: "#ffffff",
            weight: isPoint ? 2.5 : 3,
            opacity: 1,
            fillOpacity: isPoint ? 1 : themed ? 0.8 : 0.6,
            radius: POINT_RADIUS_SELECTED
        };
    }

    if (state === STATE_DIMMED) {
        /* Sombra translúcida: a feição continua lá, mas sai de cena. */
        return {
            ...base,
            color: isPoint ? "#1d1d1f" : POLYGON_STROKE,
            weight: isPoint ? 1 : POLYGON_STROKE_WEIGHT,
            /* Quase some: fica só um vestígio da forma, para não competir com os achados. */
            opacity: isPoint ? 0.2 : 0.07,
            fillOpacity: isPoint ? 0.15 : themed ? 0.05 : 0.03,
            radius: POINT_RADIUS
        };
    }

    /* Achados da busca: mais intensos que o normal (sem contorno grosso), em contraste com os esmaecidos. */
    if (state === STATE_MATCH && !isPoint) {
        return {
            ...base,
            color: POLYGON_STROKE,
            weight: 1,
            opacity: 0.9,
            fillOpacity: themed ? 0.72 : 0.55,
            radius: POINT_RADIUS
        };
    }

    /* Divisas: linha fina e clara, igual com ou sem tema; o preenchimento leva a cor. */
    return {
        ...base,
        color: isPoint ? "#1d1d1f" : POLYGON_STROKE,
        weight: isPoint ? 1 : POLYGON_STROKE_WEIGHT,
        opacity: isPoint ? 0.95 : POLYGON_STROKE_OPACITY,
        fillOpacity: fill,
        radius: POINT_RADIUS
    };
};

const applyMarkerState = (layer, state) => {
    if (typeof layer.getElement === "function" && typeof layer.setIcon === "function") {
        const element = layer.getElement();

        if (element) {
            element.classList.toggle("is-dimmed", state === STATE_DIMMED);
            element.classList.toggle("is-selected", isSelectedState(state));
        }

        if (typeof layer.setZIndexOffset === "function") {
            layer.setZIndexOffset(isSelectedState(state) ? 1000 : 0);
        }

        return;
    }

    if (typeof layer.eachLayer === "function") {
        layer.eachLayer((child) => applyMarkerState(child, state));
    }
};

const isMarker = (layer) => typeof layer.setIcon === "function";

const tagUid = (layer, uid) => {
    layer._wgUid = uid;

    if (typeof layer.eachLayer === "function") {
        layer.eachLayer((child) => tagUid(child, uid));
    }
};

const isPointLayer = (layer) =>
    typeof layer.setRadius === "function" ||
    (typeof layer.eachLayer === "function" &&
        layer.getLayers().length > 0 &&
        layer.getLayers().every(isPointLayer));

const boundsOf = (L, layer) => {
    if (typeof layer.getBounds === "function") {
        return layer.getBounds();
    }

    return L.latLngBounds([layer.getLatLng()]);
};

const anchorOf = (L, layer) =>
    typeof layer.getLatLng === "function"
        ? layer.getLatLng()
        : boundsOf(L, layer).getCenter();


export function createMapView(L, element, { options, basemaps }) {
    const map = L.map(element, {
        center: options.center,
        zoom: options.zoom,
        minZoom: options.minZoom,
        maxZoom: options.maxZoom,
        zoomControl: false,
        /* Sem créditos na tela, por decisão do produto (os textos seguem em config.js). */
        attributionControl: false,
        worldCopyJump: true
    });

    const renderer = L.canvas({ padding: 0.5 });


    const basemapLayers = new Map(basemaps.map((basemap) => [
        basemap.id,
        L.tileLayer(basemap.url, {
            minZoom: options.minZoom,
            maxZoom: options.maxZoom,
            attribution: basemap.attribution
        })
    ]));

    let currentBasemap = null;

    /* Rótulos ficam acima das feições e abaixo dos popups; não recebem clique. */
    const labelPane = map.createPane("labels");

    labelPane.style.zIndex = "450";
    labelPane.style.pointerEvents = "none";

    /* layerId → { group, paths, shown, styles, points, color, attribution, onMap, labels… } */
    const entries = new Map();

    const handlers = { featureClick: null, emptyClick: null, popupClose: null };

    /*
       Avisados depois que o conteúdo desenhado muda (camada ligada,
       desligada, carregada, removida ou filtrada). Quem depende do
       que está no mapa — como o botão de enquadrar — escuta aqui, e
       não no store, para ler o mapa já atualizado.
    */
    const contentListeners = [];
    const notifyContent = () => contentListeners.forEach((listener) => listener());

    let featureClicked = false;
    let moving = false;

    map.on("movestart", () => { moving = true; });
    map.on("moveend", () => { moving = false; });
    let popup = null;
    let popupKey = null;
    let closingPopupProgrammatically = false;


    /* ---------------- mapa base ---------------- */

    const setBasemap = (id) => {
        const next = basemapLayers.get(id);

        if (!next || id === currentBasemap) {
            return;
        }

        if (currentBasemap) {
            map.removeLayer(basemapLayers.get(currentBasemap));
        }

        next.addTo(map);
        currentBasemap = id;
    };


    /* ---------------- camadas ---------------- */

    const buildEntry = (layer) => {
        const group = L.featureGroup();
        const paths = new Array(layer.features.length).fill(null);
        const points = new Uint8Array(layer.features.length);
        const outline = layer.style === "outline";
        const halos = outline ? new Array(layer.features.length).fill(null) : null;
        let invalid = 0;

        /* Ícone de imagem para pontos, se a camada definir (config.js). */
        const markerIcon = layer.icon
            ? L.icon({
                iconUrl: layer.icon.url,
                iconSize: layer.icon.size,
                iconAnchor: layer.icon.anchor,
                className: "feature-marker"
            })
            : null;

        layer.features.forEach((feature, uid) => {
            if (!feature.geometry) {
                return;
            }

            let path;

            try {
                path = L.GeoJSON.geometryToLayer(feature, {
                    renderer,
                    /* Sem clique: no canvas, até um polígono sem preenchimento capturaria o clique. */
                    interactive: layer.interactive,
                    fill: layer.style !== "outline",
                    pointToLayer: (_, latlng) => markerIcon
                        ? L.marker(latlng, { icon: markerIcon, keyboard: false, riseOnHover: true, interactive: layer.interactive })
                        : L.circleMarker(latlng, { renderer, radius: POINT_RADIUS, interactive: layer.interactive })
                });
            } catch (error) {
                invalid++;
                return;
            }

            if (!path) {
                return;
            }

            path.feature = feature;
            tagUid(path, uid);

            if (halos && !isPointLayer(path)) {
                halos[uid] = L.GeoJSON.geometryToLayer(feature, { renderer, ...OUTLINE_HALO });
            }

            if (markerIcon) {
                path.on("add", () => applyMarkerState(path, entry.styles[uid]));
            }
            points[uid] = isPointLayer(path) ? 1 : 0;
            paths[uid] = path;
        });

        if (invalid) {
            console.warn(`[webgis] ${invalid} geometrias inválidas ignoradas em "${layer.id}"`);
        }

        group.on("click", (event) => {
            const target = event.propagatedFrom || event.sourceTarget || event.layer;

            if (!target || target._wgUid === undefined) {
                return;
            }

            featureClicked = true;
            window.setTimeout(() => {
                featureClicked = false;
            }, 0);

            if (handlers.featureClick) {
                handlers.featureClick({ layerId: layer.id, uid: target._wgUid, latlng: event.latlng });
            }
        });

        const entry = {
            layer,   // camada do store (mesmo objeto; view muda a cada filtro/busca)
            group,
            paths,
            points,
            shown: new Uint8Array(layer.features.length),
            styles: new Int8Array(layer.features.length).fill(-1),
            color: layer.color,
            outline,
            halos,
            haloGroup: halos ? L.featureGroup() : null,
            attribution: layer.attribution,
            onMap: false,
            selectedUid: null,       // principal (prioridade de rótulo)
            selectedSet: new Set(),  // todas as selecionadas desta camada
            features: layer.features,
            anchors: new Array(layer.features.length),
            labelGroup: L.layerGroup().addTo(map),
            labels: null,       // { layer, textOf } quando ligados
            themeColors: null   // cor por uid quando há tema por categoria
        };

        entries.set(layer.id, entry);

        return entry;
    };

    const setEntryOnMap = (entry, onMap) => {
        if (entry.onMap === onMap) {
            return;
        }

        entry.onMap = onMap;

        if (onMap) {
            /* Halo primeiro: no canvas, o que entra depois é desenhado por cima. */
            if (entry.haloGroup) {
                entry.haloGroup.addTo(map);
            }

            entry.group.addTo(map);

            if (entry.attribution) {
                map.attributionControl?.addAttribution(entry.attribution);
            }
        } else {
            map.removeLayer(entry.group);

            if (entry.haloGroup) {
                map.removeLayer(entry.haloGroup);
            }

            if (entry.attribution) {
                map.attributionControl?.removeAttribution(entry.attribution);
            }
        }

        drawLabels(entry);
        /* Camada com busca ocultada ou reexibida: as outras param ou voltam a esmaecer. */
        syncSearchFocus(entry.layer);
    };


    /* ---------------- rótulos ---------------- */

    /*
       Desenhados só para feições visíveis na tela, com prevenção
       de sobreposição: um rótulo que colidiria com outro já
       posicionado é omitido (aparece ao aproximar o zoom). Ordem
       de prioridade: selecionada, achadas na busca, demais.
       Refeito a cada fim de movimento do mapa.
    */
    const LABEL_LIMIT = 400;
    const LABEL_CHAR_WIDTH = 6.6;
    const LABEL_HEIGHT = 18;
    const LABEL_LINE_HEIGHT = 13;
    const LABEL_GAP = 4;

    const anchorFor = (entry, uid) => {
        if (entry.anchors[uid] === undefined) {
            const point = labelAnchor(entry.features[uid].geometry);

            entry.anchors[uid] = point ? L.latLng(point[0], point[1]) : null;
        }

        return entry.anchors[uid];
    };

    const labelOrder = (entry, layer) => {
        const { filtered, matchSet } = layer.view;
        const first = [];
        const rest = [];

        filtered.forEach((uid) => {
            if (entry.selectedSet.has(uid) || (matchSet && matchSet.has(uid))) {
                first.push(uid);
            } else if (!matchSet && !otherLayerSearching(layer.id)) {
                /* Esmaecidas (fora da busca, ou de outra camada durante uma busca) ficam sem rótulo. */
                rest.push(uid);
            }
        });

        first.sort((a, b) => (a === entry.selectedUid ? -1 : b === entry.selectedUid ? 1 : 0));

        return first.concat(rest);
    };

    function drawLabels(entry) {
        entry.labelGroup.clearLayers();

        if (!entry.labels || !entry.onMap) {
            return;
        }

        const { layer, textOf } = entry.labels;

        /* Zoom mínimo dos rótulos (catálogo): abaixo dele, nada é desenhado. */
        if (layer.labels && layer.labels.minZoom && map.getZoom() < layer.labels.minZoom) {
            return;
        }

        const bounds = map.getBounds();
        const size = map.getSize();
        const placed = [];

        const order = labelOrder(entry, layer);

        for (let i = 0; i < order.length && placed.length < LABEL_LIMIT; i++) {
            const uid = order[i];
            const anchor = anchorFor(entry, uid);

            if (!anchor || !bounds.contains(anchor)) {
                continue;
            }

            const text = textOf(uid);

            if (!text) {
                continue;
            }

            /* Uma linha por atributo: largura da maior linha, altura pela quantidade de linhas. */
            const lines = text.split("\n");
            const longest = lines.reduce((size, line) => Math.max(size, line.length), 0);
            const point = map.latLngToContainerPoint(anchor);
            const halfWidth = (longest * LABEL_CHAR_WIDTH + 10) / 2 + LABEL_GAP;
            const halfHeight = (LABEL_HEIGHT + (lines.length - 1) * LABEL_LINE_HEIGHT) / 2 + LABEL_GAP;
            const box = {
                left: point.x - halfWidth,
                right: point.x + halfWidth,
                top: point.y - halfHeight,
                bottom: point.y + halfHeight
            };

            if (box.left < 0 || box.right > size.x || box.top < 0 || box.bottom > size.y) {
                continue;
            }

            const collides = placed.some((other) =>
                box.left < other.right && box.right > other.left &&
                box.top < other.bottom && box.bottom > other.top
            );

            if (collides) {
                continue;
            }

            placed.push(box);

            const content = document.createElement("span");

            content.className = "feature-label-text";
            content.textContent = text;

            L.marker(anchor, {
                pane: "labels",
                interactive: false,
                keyboard: false,
                icon: L.divIcon({ className: "feature-label", html: content, iconSize: null })
            }).addTo(entry.labelGroup);
        }
    }

    /* Liga (com função de texto por uid) ou desliga (null) os rótulos de uma camada. */
    const setLabels = (layer, textOf) => {
        const entry = entries.get(layer.id);

        if (!entry) {
            return;
        }

        entry.labels = textOf ? { layer, textOf } : null;
        drawLabels(entry);
    };

    /* ---------------- tema por categoria ---------------- */

    /*
       Aplica (array de cores por uid) ou remove (null) o tema. Todas
       as feições visíveis são repintadas com a nova cor.
    */
    const setTheme = (layer, colors) => {
        const entry = entries.get(layer.id);

        if (!entry) {
            return;
        }

        entry.themeColors = colors || null;
        entry.styles.fill(-1);

        for (let uid = 0; uid < entry.paths.length; uid++) {
            if (entry.paths[uid] && entry.shown[uid]) {
                restyle(entry, uid, stateOf(entry, layer, uid));
            }
        }
    };

    map.on("moveend", () => {
        entries.forEach((entry) => {
            if (entry.labels) {
                drawLabels(entry);
            }
        });
    });

    /*
       Cria, remove e liga/desliga grupos conforme a lista do store.
       Retorna as camadas recém-construídas, que ainda precisam de
       renderView para receber filtro e estilo.
    */
    const syncLayers = (layers) => {
        const ids = new Set(layers.map((layer) => layer.id));
        const created = [];

        entries.forEach((entry, id) => {
            if (!ids.has(id)) {
                setEntryOnMap(entry, false);
                map.removeLayer(entry.labelGroup);
                entries.delete(id);
            }
        });

        layers.forEach((layer) => {
            if (layer.status !== "ready") {
                return;
            }

            let entry = entries.get(layer.id);

            if (!entry) {
                entry = buildEntry(layer);
                created.push(layer);
            }

            setEntryOnMap(entry, layer.visible);
        });

        raiseOutlines();
        notifyContent();

        return created;
    };

    /*
       Camadas de contorno (referência) ficam sempre por cima das de
       preenchimento: são só linhas e não recebem clique, então não
       escondem nem bloqueiam nada. Refeito quando uma camada volta
       ao mapa ou feições reentram após um filtro.
    */
    const raiseOutlines = () => {
        entries.forEach((entry) => {
            if (entry.outline && entry.onMap) {
                entry.haloGroup.bringToFront();
                entry.group.bringToFront();
            }
        });
    };

    /* Reaplica o estado de todas as feições visíveis de uma camada. */
    const restyleAll = (entry, layer) => {
        for (let uid = 0; uid < entry.paths.length; uid++) {
            if (entry.paths[uid] && entry.shown[uid]) {
                restyle(entry, uid, stateOf(entry, layer, uid));
            }
        }
    };

    const restyle = (entry, uid, state) => {
        if (entry.styles[uid] === state) {
            return;
        }

        entry.styles[uid] = state;
        const themed = entry.themeColors !== null;
        const color = themed ? entry.themeColors[uid] : entry.color;

        if (typeof entry.paths[uid].setStyle === "function") {
            entry.paths[uid].setStyle(styleFor(color, state, entry.points[uid] === 1, themed, entry.outline));
        }

        /* Halo das camadas de contorno esmaece junto com a linha. */
        if (entry.halos && entry.halos[uid]) {
            entry.halos[uid].setStyle({ opacity: state === STATE_DIMMED ? OUTLINE_HALO.opacity * 0.35 : OUTLINE_HALO.opacity });
        }

        applyMarkerState(entry.paths[uid], state);

        if (isSelectedState(state) && typeof entry.paths[uid].bringToFront === "function") {
            entry.paths[uid].bringToFront();
        }
    };

    /*
       Camadas com busca ativa (normalmente só a ativa). Enquanto houver
       uma, as demais camadas inteiras também esmaecem: o foco do mapa
       fica nos achados.
    */
    const searchingLayers = new Set();

    const otherLayerSearching = (layerId) =>
        Array.from(searchingLayers).some((id) => id !== layerId);

    const stateOf = (entry, layer, uid) => {
        const selected = entry.selectedSet.has(uid);
        const matched = layer.view.matchSet ? layer.view.matchSet.has(uid) : false;

        if (selected) {
            return matched ? STATE_SELECTED_MATCH : STATE_SELECTED;
        }

        if (matched) {
            return STATE_MATCH;
        }

        /* Com busca ativa, o que não casa esmaece: os achados se destacam em qualquer tema. */
        if (layer.view.matchSet) {
            return STATE_DIMMED;
        }

        /* Busca ativa em outra camada: esta inteira esmaece (Fazendas, Unidade Industrial…). */
        return otherLayerSearching(layer.id) ? STATE_DIMMED : STATE_DEFAULT;
    };

    /* Liga/desliga o esmaecimento das outras camadas quando a busca de uma começa ou termina. */
    const syncSearchFocus = (layer) => {
        const entry = entries.get(layer.id);
        const searching = Boolean(layer.view.matchSet && entry && entry.onMap);

        if (searching === searchingLayers.has(layer.id)) {
            return;
        }

        if (searching) {
            searchingLayers.add(layer.id);
        } else {
            searchingLayers.delete(layer.id);
        }

        entries.forEach((other, id) => {
            if (id !== layer.id) {
                restyleAll(other, other.layer);

                if (other.labels) {
                    drawLabels(other);
                }
            }
        });
    };

    /* Aplica filtro (presença no grupo) e realces (estilo). */
    const renderView = (layer) => {
        const entry = entries.get(layer.id);

        if (!entry) {
            return;
        }

        const { filteredSet } = layer.view;

        for (let uid = 0; uid < entry.paths.length; uid++) {
            const path = entry.paths[uid];

            if (!path) {
                continue;
            }

            const want = filteredSet.has(uid) ? 1 : 0;

            if (want !== entry.shown[uid]) {
                entry.shown[uid] = want;

                if (want) {
                    if (entry.halos && entry.halos[uid]) {
                        entry.haloGroup.addLayer(entry.halos[uid]);
                    }

                    entry.group.addLayer(path);
                } else {
                    entry.group.removeLayer(path);

                    if (entry.halos && entry.halos[uid]) {
                        entry.haloGroup.removeLayer(entry.halos[uid]);
                    }
                }
            }

            if (want) {
                restyle(entry, uid, stateOf(entry, layer, uid));
            }
        }

        if (entry.labels) {
            drawLabels(entry);
        }

        raiseOutlines();
        syncSearchFocus(layer);
        notifyContent();
    };

    const setSelection = (layers, selection) => {
        layers.forEach((layer) => {
            const entry = entries.get(layer.id);

            if (!entry) {
                return;
            }

            const mine = selection && selection.layerId === layer.id;
            const previous = entry.selectedSet;
            const next = new Set(mine ? selection.uids : []);
            const nextPrimary = mine ? selection.uid : null;

            if (entry.selectedUid === nextPrimary && previous.size === next.size &&
                Array.from(next).every((uid) => previous.has(uid))) {
                return;
            }

            entry.selectedUid = nextPrimary;
            entry.selectedSet = next;

            /* Repinta só o que mudou de estado (entrou ou saiu da seleção). */
            const changed = new Set([...previous, ...next]);

            changed.forEach((uid) => {
                if (entry.paths[uid] && entry.shown[uid]) {
                    restyle(entry, uid, stateOf(entry, layer, uid));
                }
            });

            /* A selecionada ganha prioridade de rótulo. */
            if (entry.labels) {
                drawLabels(entry);
            }
        });
    };


    /* ---------------- popup ---------------- */

    const closePopup = () => {
        if (!popup) {
            return;
        }

        closingPopupProgrammatically = true;
        map.closePopup(popup);
        closingPopupProgrammatically = false;
        popup = null;
        popupKey = null;
    };

    const openPopup = ({ layerId, uid, latlng }, content) => {
        const entry = entries.get(layerId);
        const path = entry ? entry.paths[uid] : null;

        if (!path) {
            return;
        }

        closePopup();

        /*
           Ponto com ícone: o popup sai do topo da imagem, ancorado na
           coordenada do ponto (não no pixel clicado), para não cobrir o ícone.
        */
        const iconAnchor = isMarker(path) ? path.options.icon.options.iconAnchor : null;

        popup = L.popup({
            className: "feature-popup",
            maxWidth: 320,
            offset: iconAnchor ? [0, 4 - iconAnchor[1]] : [0, 7],
            autoPanPaddingTopLeft: [24 + insets.left, 64 + insets.top],
            autoPanPaddingBottomRight: [72 + insets.right, 24 + insets.bottom]
        })
            .setLatLng(iconAnchor ? path.getLatLng() : latlng || anchorOf(L, path))
            .setContent(content);

        popupKey = `${layerId}:${uid}`;

        const current = popup;

        current.on("remove", () => {
            if (closingPopupProgrammatically || popup !== current) {
                return;
            }

            popup = null;
            popupKey = null;

            if (handlers.popupClose) {
                handlers.popupClose();
            }
        });

        current.openOn(map);

        /* Aberto durante um enquadramento animado: reposiciona ao final. */
        if (moving) {
            map.once("moveend", () => {
                if (popup === current) {
                    current.update();
                }
            });
        }
    };

    const isPopupOpenFor = (layerId, uid) => popupKey === `${layerId}:${uid}`;


    /* ---------------- enquadramento ---------------- */

    /* Área coberta por painéis (sidebar, dashboard), descontada no enquadramento. */
    const insets = { top: 0, right: 0, bottom: 0, left: 0 };

    const setInsets = (next) => Object.assign(insets, next);

    const fitBounds = (bounds, maxZoom) => {
        if (!bounds || !bounds.isValid()) {
            return false;
        }

        map.invalidateSize({ animate: false });
        map.fitBounds(bounds, {
            paddingTopLeft: [32 + insets.left, 64 + insets.top],
            paddingBottomRight: [72 + insets.right, 32 + insets.bottom],
            maxZoom
        });

        return true;
    };

    const fitFeatures = (layerId, uids, maxZoom = options.fitMaxZoom + 1) => {
        const entry = entries.get(layerId);

        if (!entry || !uids.length) {
            return false;
        }

        const bounds = L.latLngBounds([]);

        uids.forEach((uid) => {
            const path = entry.paths[uid];

            if (path) {
                bounds.extend(boundsOf(L, path));
            }
        });

        return fitBounds(bounds, maxZoom);
    };

    /*
       Extensão total de uma camada: todas as feições, independente
       de filtros e busca. Calculada uma vez e guardada no entry.
    */
    const fullExtentOf = (entry) => {
        if (!entry.fullBounds) {
            const bounds = L.latLngBounds([]);

            entry.paths.forEach((path) => {
                if (path) {
                    bounds.extend(boundsOf(L, path));
                }
            });

            entry.fullBounds = bounds;
        }

        return entry.fullBounds;
    };

    /* Extensão total somada das camadas ligadas. */
    const extentBounds = () => {
        const bounds = L.latLngBounds([]);

        entries.forEach((entry) => {
            const extent = entry.onMap ? fullExtentOf(entry) : null;

            if (extent && extent.isValid()) {
                bounds.extend(extent);
            }
        });

        return bounds;
    };

    /* Repõe o enquadramento total das camadas ligadas (botão Home e carga inicial). */
    const fitExtent = () => fitBounds(extentBounds(), options.fitMaxZoom);

    const hasExtent = () => extentBounds().isValid();


    /* ---------------- eventos ---------------- */

    map.on("click", () => {
        if (featureClicked) {
            return;
        }

        if (handlers.emptyClick) {
            handlers.emptyClick();
        }
    });

    return {
        map,
        setInsets,
        setBasemap,
        syncLayers,
        renderView,
        setSelection,
        setLabels,
        setTheme,
        openPopup,
        closePopup,
        isPopupOpenFor,
        fitFeatures,
        fitExtent,
        hasExtent,
        onFeatureClick: (handler) => { handlers.featureClick = handler; },
        onEmptyClick: (handler) => { handlers.emptyClick = handler; },
        onPopupClose: (handler) => { handlers.popupClose = handler; },
        onContentChange: (listener) => { contentListeners.push(listener); }
    };
}
