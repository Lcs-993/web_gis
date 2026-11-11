/* ============================================================
   ADAPTADOR LEAFLET

   Único módulo que conhece o Leaflet além dos controles do mapa.
   Recebe camadas do store e as desenha; devolve eventos de
   interação (clique e botão direito em feature ou no vazio) em
   termos de { layerId, uid }, nunca de objetos Leaflet. Os atributos
   da feição clicada aparecem fora do mapa (js/ui/feature-card.js).

   Uma futura troca para MapLibre deve reimplementar esta mesma
   interface.

   Renderização: um único L.canvas compartilhado. Features que não
   passam nos filtros saem do grupo (não são só escondidas), então
   o canvas não as percorre em pan/zoom.
   ============================================================ */

import { labelAnchor } from "./label-anchor.js";
import { baseFillOpacity, resolveSymbol } from "../data/symbol.js";
import { getAttribute, isEmpty, normalizeText } from "../data/values.js";

const STATE_DEFAULT = 0;
const STATE_MATCH = 1;
const STATE_SELECTED = 2;
const STATE_SELECTED_MATCH = 3;
/* Busca ativa e a feição não casa com ela: esmaecida. */
const STATE_DIMMED = 4;
/* Fora do grupo elevado (ex.: talhão de outra fazenda, com um talhão selecionado): recua um pouco. */
const STATE_OUTSIDE = 5;

const isSelectedState = (state) => state === STATE_SELECTED || state === STATE_SELECTED_MATCH;

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

/* Tipo de cada feição no mapa (entry.kinds): decide o que a cor principal pinta. */
const KIND_POLYGON = 0;
const KIND_POINT = 1;
const KIND_LINE = 2;

const POINT_GROW_SELECTED = 3;


/*
   Estilo por estado, a partir da simbologia da camada (symbol:
   js/data/symbol.js) e da cor principal da feição (color: a da
   camada ou a do tema). Dois níveis independentes:
   - busca: os achados ficam mais intensos e o que não casa
     esmaece (STATE_DIMMED);
   - seleção (nível acima): contorno branco forte e preenchimento
     mais intenso, com ou sem busca ativa.
   A opacidade da camada multiplica tudo, menos a seleção: a
   feição selecionada precisa aparecer mesmo numa camada quase
   transparente.
*/
const styleFor = (symbol, color, state, kind, themed = false) => {
    const isPoint = kind === KIND_POINT;
    const layerOpacity = symbol.opacity;
    const filled = isPoint || (kind === KIND_POLYGON && symbol.fill);
    const fill = baseFillOpacity(symbol, { isPoint, themed });
    /* Sem preenchimento (linha ou só contorno), a cor principal (camada ou tema) vai no traço. */
    const strokeColor = !filled && themed ? color : symbol.strokeColor;
    const base = { lineCap: "round", lineJoin: "round", fill: filled, fillColor: color, radius: symbol.pointSize };

    if (isSelectedState(state)) {
        return {
            ...base,
            color: "#ffffff",
            weight: isPoint ? 2.5 : Math.max(3, symbol.strokeWidth + 1.5),
            opacity: 1,
            fillOpacity: isPoint ? 1 : Math.min(1, fill + (themed ? 0.3 : 0.25)),
            radius: symbol.pointSize + POINT_GROW_SELECTED
        };
    }

    if (state === STATE_DIMMED) {
        /* Sombra translúcida: a feição continua lá, mas sai de cena. */
        return {
            ...base,
            color: strokeColor,
            weight: symbol.strokeWidth,
            /* Quase some: fica só um vestígio da forma, para não competir com os achados. */
            opacity: (isPoint ? 0.2 : filled ? 0.07 : 0.3) * layerOpacity,
            fillOpacity: (isPoint ? 0.15 : themed ? 0.05 : 0.03) * layerOpacity
        };
    }

    /* Fora do grupo elevado: mais apagada que o normal, mas ainda legível (não some como na busca). */
    if (state === STATE_OUTSIDE) {
        return {
            ...base,
            color: strokeColor,
            weight: symbol.strokeWidth,
            opacity: symbol.strokeOpacity * 0.45 * layerOpacity,
            fillOpacity: fill * 0.4 * layerOpacity
        };
    }

    /* Achados da busca: mais intensos que o normal (sem contorno grosso), em contraste com os esmaecidos. */
    if (state === STATE_MATCH && !isPoint) {
        return {
            ...base,
            color: strokeColor,
            weight: Math.max(1, symbol.strokeWidth),
            opacity: (filled ? 0.9 : 1) * layerOpacity,
            fillOpacity: Math.min(1, fill + 0.2) * layerOpacity
        };
    }

    return {
        ...base,
        color: strokeColor,
        weight: symbol.strokeWidth,
        opacity: symbol.strokeOpacity * layerOpacity,
        fillOpacity: fill * layerOpacity
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

    /*
       O Leaflet dá focus() no mapa a cada clique, e o navegador trata
       esse foco por script como de teclado: o mapa inteiro ganhava o
       anel azul. O anel fica só para quem chega pelo teclado (Tab).
    */
    element.addEventListener("pointerdown", () => element.classList.add("is-pointer-focus"));
    element.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
            element.classList.remove("is-pointer-focus");
        }
    });
    element.addEventListener("blur", () => element.classList.remove("is-pointer-focus"));

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

    /* Rótulos ficam acima das feições; não recebem clique. */
    const labelPane = map.createPane("labels");

    labelPane.style.zIndex = "450";
    labelPane.style.pointerEvents = "none";

    /*
       Elevação do grupo da seleção (ex.: a fazenda do talhão
       selecionado; config.js: selectionGroup). As feições do grupo
       são redesenhadas, sem contorno e com preenchimento mais firme,
       num canvas próprio logo abaixo das camadas; o painel inteiro
       projeta uma sombra (CSS drop-shadow, .leaflet-elevated-pane).
       A sombra sai da forma unida do grupo, como a "Sombra projetada"
       do QGIS, e cai sobre o terreno e os vizinhos. As feições
       originais seguem por cima: seleção, pontos e cliques não mudam.
    */
    const elevatedPane = map.createPane("elevated");

    elevatedPane.style.zIndex = "390";
    elevatedPane.style.pointerEvents = "none";

    const elevatedRenderer = L.canvas({ pane: "elevated", padding: 0.5 });

    /* layerId → { group, paths, shown, styles, points, color, attribution, onMap, labels… } */
    const entries = new Map();

    const handlers = { featureClick: null, emptyClick: null, featureContextMenu: null, mapContextMenu: null };

    /*
       Avisados depois que o conteúdo desenhado muda (camada ligada,
       desligada, carregada, removida ou filtrada). Quem depende do
       que está no mapa — como o botão de enquadrar — escuta aqui, e
       não no store, para ler o mapa já atualizado.
    */
    const contentListeners = [];
    const notifyContent = () => contentListeners.forEach((listener) => listener());

    let featureClicked = false;
    /* Mesmo papel de featureClicked, para o botão direito. */
    let featureContext = false;


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
        const symbol = resolveSymbol(layer);
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
                    fill: symbol.fill,
                    pointToLayer: (_, latlng) => markerIcon
                        ? L.marker(latlng, { icon: markerIcon, keyboard: false, riseOnHover: true, interactive: layer.interactive, opacity: symbol.opacity })
                        : L.circleMarker(latlng, { renderer, radius: symbol.pointSize, interactive: layer.interactive })
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
            points[uid] = isPointLayer(path)
                ? KIND_POINT
                : path instanceof L.Polyline && !(path instanceof L.Polygon) ? KIND_LINE : KIND_POLYGON;
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

        /* Botão direito sobre a feição: menu de contexto da feição (o mapa vazio não recebe). */
        group.on("contextmenu", (event) => {
            const target = event.propagatedFrom || event.sourceTarget || event.layer;

            if (!target || target._wgUid === undefined) {
                return;
            }

            featureContext = true;
            window.setTimeout(() => {
                featureContext = false;
            }, 0);

            if (handlers.featureContextMenu) {
                handlers.featureContextMenu({
                    layerId: layer.id,
                    uid: target._wgUid,
                    latlng: event.latlng,
                    point: { x: event.originalEvent.clientX, y: event.originalEvent.clientY }
                });
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
            symbol,   // simbologia já resolvida (js/data/symbol.js); muda em setSymbol
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
    /* Tamanho de letra para o qual as medidas acima foram calibradas. */
    const LABEL_BASE_SIZE = 11;

    /* Cor clara pede halo escuro e vice-versa (luminância aproximada do hex). */
    const isLightColor = (hex) => {
        const value = /^#[0-9a-f]{6}$/i.test(hex || "") ? parseInt(hex.slice(1), 16) : 0xffffff;

        return (0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) > 140;
    };

    const labelCss = (labels) => {
        const color = labels.color || "#ffffff";
        const halo = isLightColor(color) ? "0, 0, 0" : "255, 255, 255";

        return {
            color,
            fontSize: `${labels.size || LABEL_BASE_SIZE}px`,
            fontWeight: labels.bold === false ? "400" : "600",
            textShadow: labels.halo === false
                ? "none"
                : `0 0 2px rgba(${halo}, 0.95), 0 0 4px rgba(${halo}, 0.8), 0 1px 2px rgba(${halo}, 0.9)`
        };
    };

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

        /* Texto do rótulo (Propriedades › Rótulos): a caixa de colisão cresce com o tamanho da letra. */
        const labelStyle = labelCss(layer.labels);
        const scale = (layer.labels.size || LABEL_BASE_SIZE) / LABEL_BASE_SIZE;

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
            const halfWidth = (longest * LABEL_CHAR_WIDTH * scale + 10) / 2 + LABEL_GAP;
            const halfHeight = (LABEL_HEIGHT + (lines.length - 1) * LABEL_LINE_HEIGHT) * scale / 2 + LABEL_GAP;
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
            Object.assign(content.style, labelStyle);

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

    /* ---------------- simbologia ---------------- */

    /*
       Reaplica a simbologia da camada (cor, contorno, opacidades,
       tamanho do ponto) a todas as feições visíveis. As ocultas por
       filtro pegam o estilo novo quando voltarem (styles = -1).
    */
    const setSymbol = (layer) => {
        const entry = entries.get(layer.id);

        if (!entry) {
            return;
        }

        entry.symbol = resolveSymbol(layer);
        entry.color = layer.color;
        entry.styles.fill(-1);

        for (let uid = 0; uid < entry.paths.length; uid++) {
            const path = entry.paths[uid];

            if (!path) {
                continue;
            }

            /* Pontos com ícone de imagem: só a opacidade da camada se aplica. */
            if (typeof path.setOpacity === "function") {
                path.setOpacity(entry.symbol.opacity);
            }

            if (entry.shown[uid]) {
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

        listOrder = layers.map((layer) => layer.id);
        restack();
        /* Camada ligada/desligada: a elevação aparece ou some junto. */
        scheduleElevation();
        notifyContent();

        return created;
    };

    /*
       Ordem de desenho (e de clique) no canvas compartilhado. Sem
       isto, valia a ordem em que as camadas terminavam de carregar:
       uma camada leve de pontos, carregada antes, ficava sob os
       talhões e o clique abria o talhão.
       De baixo para cima: polígonos, linhas, pontos e, por último,
       as camadas de contorno (referência, sem clique). No mesmo
       nível, vale a ordem do painel Camadas (a de cima, por cima).
       A de baixo de tudo não é mexida (costuma ser a mais pesada).
       Refeito quando camadas entram, feições reentram após um
       filtro ou uma feição selecionada sobe (bringToFront).
    */
    const KIND_RANK = { polygon: 0, line: 1, point: 2 };
    let listOrder = [];

    const restack = () => {
        const rank = (entry) => entry.outline ? 3 : KIND_RANK[entry.symbol.kind] ?? 0;
        const stack = listOrder
            .map((id, index) => ({ entry: entries.get(id), index }))
            .filter(({ entry }) => entry && entry.onMap)
            .sort((a, b) => rank(a.entry) - rank(b.entry) || b.index - a.index);

        stack.slice(1).forEach(({ entry }) => {
            if (entry.haloGroup) {
                entry.haloGroup.bringToFront();
            }

            entry.group.bringToFront();
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

    /* ---------------- elevação do grupo da seleção ---------------- */

    const ELEVATED_FILL = 0.55;
    let elevation = null;
    let elevationSelection = null;
    let elevationFrame = 0;

    /* Valor do atributo de grupo (comparável), ou null se vazio. */
    const groupKeyOf = (layer, uid) => {
        const value = getAttribute(layer.features[uid], layer.selectionGroup);

        return isEmpty(value) ? null : normalizeText(value);
    };

    const updateElevation = () => {
        if (elevation) {
            elevation.remove();
            elevation = null;
        }

        const selection = elevationSelection;
        const entry = selection ? entries.get(selection.layerId) : null;

        if (!entry || !entry.groupSet || !entry.onMap) {
            return;
        }

        const layer = entry.layer;
        const themed = entry.themeColors !== null;
        const copies = [];

        entry.groupSet.forEach((uid) => {
            if (!entry.paths[uid] || !entry.shown[uid] || entry.styles[uid] === STATE_DIMMED) {
                return;
            }

            try {
                copies.push(L.GeoJSON.geometryToLayer(layer.features[uid], {
                    renderer: elevatedRenderer,
                    interactive: false,
                    stroke: false,
                    fill: true,
                    fillColor: themed ? entry.themeColors[uid] : entry.color,
                    fillOpacity: ELEVATED_FILL * entry.symbol.opacity
                }));
            } catch (error) {
                /* Geometria que o Leaflet não desenha: fica sem elevação. */
            }
        });

        if (copies.length) {
            elevation = L.layerGroup(copies).addTo(map);
        }
    };

    /* Um quadro por atualização: restyle roda por feição, em laço. */
    const scheduleElevation = () => {
        if (!elevationFrame) {
            elevationFrame = requestAnimationFrame(() => {
                elevationFrame = 0;
                updateElevation();
            });
        }
    };

    const restyle = (entry, uid, state) => {
        if (entry.styles[uid] === state) {
            return;
        }

        entry.styles[uid] = state;

        /* Cor, tema, filtro ou busca mudaram na camada elevada: a elevação acompanha. */
        if (entry.groupSet && elevationSelection && elevationSelection.layerId === entry.layer.id) {
            scheduleElevation();
        }

        const themed = entry.themeColors !== null;
        const color = themed ? entry.themeColors[uid] : entry.color;

        if (typeof entry.paths[uid].setStyle === "function") {
            entry.paths[uid].setStyle(styleFor(entry.symbol, color, state, entry.points[uid], themed));
        }

        /* Halo das camadas de contorno: esmaece com a linha e some se a camada ganhar preenchimento. */
        if (entry.halos && entry.halos[uid]) {
            const visible = entry.symbol.halo ? entry.symbol.opacity : 0;

            entry.halos[uid].setStyle({
                opacity: (state === STATE_DIMMED ? OUTLINE_HALO.opacity * 0.35 : OUTLINE_HALO.opacity) * visible,
                /* Halo estreito (1 px além da linha): a linha da fazenda não engrossa à vista. */
                weight: entry.symbol.strokeWidth + 1
            });
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
        if (otherLayerSearching(layer.id)) {
            return STATE_DIMMED;
        }

        /* Um grupo elevado nesta camada: quem está fora dele recua. */
        return entry.groupSet && !entry.groupSet.has(uid) ? STATE_OUTSIDE : STATE_DEFAULT;
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

        restack();
        syncSearchFocus(layer);

        /* Filtro tirou ou devolveu feições do grupo elevado. */
        if (elevationSelection && elevationSelection.layerId === layer.id) {
            scheduleElevation();
        }
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

            /* Grupo elevado (selectionGroup): as feições com o mesmo valor do selecionado. */
            const groupable = mine && layer.selectionGroup && entry.symbol.kind === "polygon" && entry.symbol.fill;
            const keys = groupable
                ? new Set(selection.uids.map((uid) => groupKeyOf(layer, uid)).filter((key) => key !== null))
                : null;
            const groupId = keys && keys.size ? Array.from(keys).sort().join("|") : null;
            const groupChanged = groupId !== (entry.groupId || null);

            if (!groupChanged && entry.selectedUid === nextPrimary && previous.size === next.size &&
                Array.from(next).every((uid) => previous.has(uid))) {
                return;
            }

            entry.selectedUid = nextPrimary;
            entry.selectedSet = next;

            if (groupChanged) {
                entry.groupId = groupId;
                entry.groupSet = groupId
                    ? new Set(layer.features.map((_, uid) => uid).filter((uid) => keys.has(groupKeyOf(layer, uid))))
                    : null;

                /* Entrou, saiu ou trocou de grupo: todas as feições mudam (dentro sobe, fora recua). */
                restyleAll(entry, layer);
            } else {
                /* Repinta só o que mudou de estado (entrou ou saiu da seleção). */
                const changed = new Set([...previous, ...next]);

                changed.forEach((uid) => {
                    if (entry.paths[uid] && entry.shown[uid]) {
                        restyle(entry, uid, stateOf(entry, layer, uid));
                    }
                });
            }

            /* A selecionada ganha prioridade de rótulo. */
            if (entry.labels) {
                drawLabels(entry);
            }
        });

        /* O polígono selecionado subiu (bringToFront): os pontos voltam para cima dele. */
        restack();

        elevationSelection = selection || null;
        scheduleElevation();
    };


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

    /*
       Leva um ponto ao centro da área livre do mapa (descontando os
       painéis e o cartão da feição, em insets). Com zoom, vai também
       para esse zoom; sem ele, mantém o atual.
    */
    const centerOn = ([lng, lat], zoom = null) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return;
        }

        map.invalidateSize({ animate: false });

        const level = Number.isFinite(zoom)
            ? Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), zoom))
            : map.getZoom();
        const offset = L.point(
            (insets.left - insets.right) / 2,
            (insets.top - insets.bottom) / 2
        );
        const target = map.project(L.latLng(lat, lng), level).subtract(offset);

        map.setView(map.unproject(target, level), level, { animate: map.getSize().x > 0 });
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
    /*
       Início (abertura, botão Início e Analytics sem foco): o centro
       da extensão das camadas ligadas, no zoom fixo de options.homeZoom
       (config.js), descontando os painéis abertos. Sem homeZoom, cabe
       a extensão inteira.
    */
    const fitExtent = () => {
        const bounds = extentBounds();

        if (!Number.isFinite(options.homeZoom)) {
            return fitBounds(bounds, options.fitMaxZoom);
        }

        if (!bounds.isValid()) {
            return false;
        }

        map.invalidateSize({ animate: false });

        const zoom = options.homeZoom;
        const offset = L.point((insets.left - insets.right) / 2, (insets.top - insets.bottom) / 2);
        const target = map.project(bounds.getCenter(), zoom).subtract(offset);

        map.setView(map.unproject(target, zoom), zoom, { animate: map.getSize().x > 0 });

        return true;
    };

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

    /* Ter um ouvinte de contextmenu faz o Leaflet suprimir o menu nativo do navegador. */
    map.on("contextmenu", (event) => {
        if (featureContext || !handlers.mapContextMenu) {
            return;
        }

        handlers.mapContextMenu({
            latlng: event.latlng,
            point: { x: event.originalEvent.clientX, y: event.originalEvent.clientY }
        });
    });

    return {
        map,
        setInsets,
        setBasemap,
        syncLayers,
        renderView,
        setSelection,
        setLabels,
        setSymbol,
        setTheme,
        fitFeatures,
        centerOn,
        fitExtent,
        hasExtent,
        onFeatureClick: (handler) => { handlers.featureClick = handler; },
        onEmptyClick: (handler) => { handlers.emptyClick = handler; },
        onFeatureContextMenu: (handler) => { handlers.featureContextMenu = handler; },
        onMapContextMenu: (handler) => { handlers.mapContextMenu = handler; },
        onContentChange: (listener) => { contentListeners.push(listener); }
    };
}
