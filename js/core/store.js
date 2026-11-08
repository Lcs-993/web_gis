/* ============================================================
   STATE MANAGER — fonte única de verdade

   Toda mutação passa por uma ação deste módulo, que recalcula o
   que for derivado e emite um evento. Mapa, painéis, dashboard e
   tabela apenas reagem aos eventos; nenhum deles guarda estado
   próprio sobre os dados.

   Eventos:
     layers     lista, status ou visibilidade de camadas mudou
     active     camada ativa mudou
     view       filtros/busca de uma camada mudaram (payload: layer)
     selection  feature selecionada mudou
     labels     rótulos de uma camada mudaram (payload: layer)
     theme      tema por categoria de uma camada mudou (payload: layer)
     basemap    mapa base mudou
     status     mensagem de status (payload: string)

   Camada (Layer):
     { id, name, color, url, attribution, source, visible,
       status: "loading" | "ready" | "error", error,
       features, schema, geometryTypes, filters, filterMode,
       search: { term },
       view: { filtered, filteredSet, matches, matchSet, considered },
       index }
   ============================================================ */

import { createEmitter } from "./events.js";
import { applyFilters } from "../data/filters.js";
import { inferSchema } from "../data/schema.js";
import { buildCategoryTheme, isThemeable } from "../data/theme.js";
import { buildSearchIndex, search } from "../data/search.js";

const EMPTY_VIEW = Object.freeze({
    filtered: [],
    filteredSet: new Set(),
    matches: null,
    matchSet: null,
    considered: []
});


export function createStore() {
    const emitter = createEmitter();

    const state = {
        layers: [],
        activeLayerId: null,
        selection: null,      // { layerId, uid, uids } | null — uid: a principal (último clique); uids: todas
        basemap: null
    };

    const getLayer = (id) => state.layers.find((layer) => layer.id === id) || null;
    const getActiveLayer = () => getLayer(state.activeLayerId);


    /* Recalcula filtro → busca → conjunto considerado. */
    const recompute = (layer) => {
        if (layer.status !== "ready") {
            layer.view = EMPTY_VIEW;
            return;
        }

        const filtered = applyFilters(layer.features, layer.filters, layer.filterMode);
        const term = layer.search.term;
        const matches = term ? search(layer.index, term, filtered) : null;
        const considered = matches || filtered;

        layer.view = {
            filtered,
            filteredSet: new Set(filtered),
            matches,
            matchSet: matches ? new Set(matches) : null,
            considered
        };

        /* Feições selecionadas que deixaram de passar no filtro saem da seleção. */
        const selection = state.selection;

        if (selection && selection.layerId === layer.id) {
            const kept = selection.uids.filter((uid) => layer.view.filteredSet.has(uid));

            if (kept.length !== selection.uids.length) {
                state.selection = kept.length
                    ? { layerId: layer.id, uid: kept.includes(selection.uid) ? selection.uid : kept[kept.length - 1], uids: kept }
                    : null;
                emitter.emit("selection", state.selection);
            }
        }
    };

    const emitView = (layer) => {
        recompute(layer);
        emitter.emit("view", layer);
    };


    /* ---------------- camadas ---------------- */

    const addLayer = (definition) => {
        if (getLayer(definition.id)) {
            throw new Error(`Camada duplicada: ${definition.id}`);
        }

        const layer = {
            id: definition.id,
            name: definition.name || definition.id,
            color: definition.color,
            url: definition.url || null,
            attribution: definition.attribution || null,
            icon: definition.icon || null,
            /* "outline": só contorno, sem preenchimento (camadas de referência). */
            style: definition.style || "fill",
            /* false: a camada não recebe clique (não rouba cliques das de baixo/cima). */
            interactive: definition.interactive !== false,
            source: definition.source || (definition.url ? "url" : "file"),
            visible: definition.visible !== false,
            status: "loading",
            error: null,
            features: [],
            schema: { attributes: [] },
            geometryTypes: {},
            metadata: { description: "", crs: "", bbox: null },
            filters: [],
            /* Combinação das condições: "all" (E) ou "any" (OU). */
            filterMode: "all",
            /* minZoom: rótulos só a partir desse zoom (null = sempre). */
            /* fields: um atributo por linha do rótulo (aceita "field" único, legado). */
            labels: {
                visible: Boolean(definition.labels && definition.labels.visible),
                fields: definition.labels
                    ? (definition.labels.fields || (definition.labels.field ? [definition.labels.field] : []))
                    : [],
                minZoom: (definition.labels && definition.labels.minZoom) || null
            },
            /* Fixa a camada no fim da lista do painel, mesmo com camadas adicionadas depois. */
            keepLast: Boolean(definition.keepLast),
            theme: { visible: false, field: null, legend: null },
            search: { term: "" },
            view: EMPTY_VIEW,
            index: []
        };

        /* Entra antes das camadas fixadas no fim (keepLast); estas vão para o fim. */
        const lastIndex = state.layers.findIndex((item) => item.keepLast);

        if (layer.keepLast || lastIndex === -1) {
            state.layers.push(layer);
        } else {
            state.layers.splice(lastIndex, 0, layer);
        }

        /* Ativa: a marcada com active no catálogo; sem marcação, a primeira. */
        if (!state.activeLayerId || definition.active) {
            state.activeLayerId = layer.id;
            emitter.emit("active", layer);
        }

        emitter.emit("layers", state.layers);

        return layer;
    };

    const setLayerData = (id, { name, features, geometryTypes, metadata }) => {
        const layer = getLayer(id);

        if (!layer) {
            return;
        }

        if (!layer.name || layer.name === layer.id) {
            layer.name = name || layer.name;
        }

        layer.features = features;
        layer.geometryTypes = geometryTypes;
        /* Do próprio arquivo: descrição, sistema de coordenadas e extensão. */
        layer.metadata = metadata || { description: "", crs: "", bbox: null };
        layer.schema = inferSchema(features);
        layer.index = buildSearchIndex(features, layer.schema);

        /* Campos do catálogo inexistentes no arquivo saem; sem nenhum, cai no primeiro atributo com valores. */
        if (layer.labels.visible) {
            const known = layer.labels.fields.filter((field) =>
                layer.schema.attributes.some((attribute) => attribute.name === field));
            const first = layer.schema.attributes.find((attribute) => attribute.role !== "empty");

            layer.labels = { ...layer.labels, fields: known.length ? known : first ? [first.name] : [] };
        }
        layer.status = "ready";
        layer.error = null;

        emitter.emit("layers", state.layers);
        emitView(layer);

        if (layer.id === state.activeLayerId) {
            emitter.emit("active", layer);
        }
    };

    const setLayerError = (id, message) => {
        const layer = getLayer(id);

        if (!layer) {
            return;
        }

        layer.status = "error";
        layer.error = message;
        layer.view = EMPTY_VIEW;

        emitter.emit("layers", state.layers);
        emitter.emit("view", layer);
    };

    const setLayerVisible = (id, visible) => {
        const layer = getLayer(id);

        if (!layer || layer.visible === visible) {
            return;
        }

        layer.visible = visible;

        if (!visible && state.selection && state.selection.layerId === id) {
            state.selection = null;
            emitter.emit("selection", null);
        }

        emitter.emit("layers", state.layers);
    };

    const removeLayer = (id) => {
        const index = state.layers.findIndex((layer) => layer.id === id);

        if (index === -1) {
            return;
        }

        state.layers.splice(index, 1);

        if (state.selection && state.selection.layerId === id) {
            state.selection = null;
            emitter.emit("selection", null);
        }

        if (state.activeLayerId === id) {
            state.activeLayerId = state.layers.length ? state.layers[0].id : null;
            emitter.emit("active", getActiveLayer());
        }

        emitter.emit("layers", state.layers);
    };

    const setActiveLayer = (id) => {
        if (state.activeLayerId === id || !getLayer(id)) {
            return;
        }

        state.activeLayerId = id;
        emitter.emit("active", getActiveLayer());
    };


    /* ---------------- rótulos ---------------- */

    /*
       Liga/desliga rótulos e escolhe os atributos exibidos (fields:
       um por linha, na ordem). Só uma camada fica rotulada por vez. Sem nenhum, usa o primeiro atributo
       com valores (ordem do arquivo).
    */
    const setLabels = (id, patch) => {
        const layer = getLayer(id);

        if (!layer) {
            return;
        }

        const next = { ...layer.labels, ...patch };

        if (next.visible && !(next.fields && next.fields.length)) {
            const first = layer.schema.attributes.find((attribute) => attribute.role !== "empty");

            next.fields = first ? [first.name] : [];
        }

        layer.labels = next;

        /* Só uma camada rotulada por vez: ligar aqui desliga nas outras. */
        if (next.visible) {
            state.layers.forEach((other) => {
                if (other !== layer && other.labels.visible) {
                    other.labels = { ...other.labels, visible: false };
                    emitter.emit("labels", other);
                }
            });
        }

        emitter.emit("labels", layer);
    };


    /* ---------------- tema por categoria ---------------- */

    /*
       Liga/desliga o tema e escolhe o atributo. Sem campo definido,
       usa o primeiro atributo do tipo categoria. A legenda (classes, cores
       e cor por uid) é calculada aqui, uma vez por mudança.
    */
    const setTheme = (id, patch) => {
        const layer = getLayer(id);

        if (!layer || layer.status !== "ready") {
            return;
        }

        const next = { ...layer.theme, ...patch };
        const categories = layer.schema.attributes.filter(isThemeable);

        if (!categories.some((attribute) => attribute.name === next.field)) {
            next.field = categories.length ? categories[0].name : null;
        }

        const attribute = categories.find((item) => item.name === next.field);

        next.legend = next.visible && attribute
            ? buildCategoryTheme(layer.features, attribute)
            : null;

        if (!next.legend) {
            next.visible = false;
        }

        layer.theme = next;
        emitter.emit("theme", layer);
    };


    /* ---------------- filtros ---------------- */

    const addFilter = (layerId, filter) => {
        const layer = getLayer(layerId);

        if (!layer || !filter) {
            return;
        }

        layer.filters = [...layer.filters, filter];
        emitView(layer);
    };

    const removeFilter = (layerId, index) => {
        const layer = getLayer(layerId);

        if (!layer) {
            return;
        }

        layer.filters = layer.filters.filter((_, position) => position !== index);
        emitView(layer);
    };

    /*
       Filtro de coluna (tabela do dashboard): troca todos os filtros
       do campo pelo novo; null só remove. Os filtros de outros
       campos, inclusive os do painel Filtros, ficam como estão.
    */
    const setFieldFilter = (layerId, field, filter) => {
        const layer = getLayer(layerId);

        if (!layer) {
            return;
        }

        const others = layer.filters.filter((item) => item.field !== field);

        if (!filter && others.length === layer.filters.length) {
            return;
        }

        layer.filters = filter ? [...others, filter] : others;
        emitView(layer);
    };

    const setFilterMode = (layerId, mode) => {
        const layer = getLayer(layerId);
        const next = mode === "any" ? "any" : "all";

        if (!layer || layer.filterMode === next) {
            return;
        }

        layer.filterMode = next;
        emitView(layer);
    };

    /* Troca todos os filtros de uma vez (aplicar um conjunto salvo). */
    const setFilters = (layerId, filters, mode = "all") => {
        const layer = getLayer(layerId);

        if (!layer) {
            return;
        }

        layer.filters = filters.slice();
        layer.filterMode = mode === "any" ? "any" : "all";
        emitView(layer);
    };

    const clearFilters = (layerId) => {
        const layer = getLayer(layerId);

        if (!layer || !layer.filters.length) {
            return;
        }

        layer.filters = [];
        layer.filterMode = "all";
        emitView(layer);
    };


    /* ---------------- busca ---------------- */

    const setSearch = (layerId, term) => {
        const layer = getLayer(layerId);
        const normalized = String(term || "").trim();

        if (!layer || layer.search.term === normalized) {
            return;
        }

        layer.search = { term: normalized };
        emitView(layer);
    };


    /* ---------------- seleção e mapa base ---------------- */

    const sameSelection = (a, b) =>
        (a === null && b === null) ||
        Boolean(a && b && a.layerId === b.layerId && a.uid === b.uid &&
            a.uids.length === b.uids.length && a.uids.every((uid, index) => uid === b.uids[index]));

    const setSelection = (next) => {
        if (sameSelection(state.selection, next)) {
            return;
        }

        state.selection = next;
        emitter.emit("selection", next);
    };

    /* Seleção simples (uma feição) ou limpar (null). */
    const select = (layerId, uid) => {
        setSelection(layerId === null || uid === null || uid === undefined
            ? null
            : { layerId, uid, uids: [uid] });
    };

    /*
       Seleção múltipla (tabela com Ctrl/Shift): várias feições da
       mesma camada; primary é a do último clique (a "principal").
       Lista vazia limpa a seleção.
    */
    const selectMany = (layerId, uids, primary) => {
        const unique = Array.from(new Set(uids));

        if (!unique.length) {
            setSelection(null);
            return;
        }

        setSelection({ layerId, uid: unique.includes(primary) ? primary : unique[unique.length - 1], uids: unique });
    };

    const setBasemap = (id) => {
        if (state.basemap === id) {
            return;
        }

        state.basemap = id;
        emitter.emit("basemap", id);
    };

    const setStatus = (message) => emitter.emit("status", message);


    /* ---------------- leitura ---------------- */

    const getSelectedFeature = () => {
        const selection = state.selection;
        const layer = selection ? getLayer(selection.layerId) : null;

        return layer ? layer.features[selection.uid] || null : null;
    };

    return {
        state,
        on: emitter.on,
        getLayer,
        getActiveLayer,
        getSelectedFeature,
        addLayer,
        setLayerData,
        setLayerError,
        setLayerVisible,
        removeLayer,
        setActiveLayer,
        setLabels,
        selectMany,
        setTheme,
        addFilter,
        setFieldFilter,
        removeFilter,
        setFilterMode,
        setFilters,
        clearFilters,
        setSearch,
        select,
        setBasemap,
        setStatus
    };
}
