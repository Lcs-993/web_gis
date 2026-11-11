/* ============================================================
   JANELA "PROPRIEDADES DA CAMADA"

   Um lugar só para tudo o que é de uma camada, como a janela de
   propriedades do QGIS: abas à esquerda (Informação, Simbologia,
   Rótulos, Campos) e o conteúdo da aba à direita.

   - Vale para qualquer camada, não só a ativa: o seletor do
     cabeçalho troca de camada sem fechar a janela.
   - Não é modal: o mapa fica à vista e muda na hora, a cada ajuste.
   - Cancelar desfaz tudo o que foi mudado desde que a janela abriu
     (em todas as camadas mexidas); OK, × e Esc mantêm.
   - Restaurar padrão volta a aba atual ao padrão da camada.
   - Arrasta pelo cabeçalho (em telas largas).

   O conteúdo das abas vem de js/ui/layer-info.js (Informação,
   Campos) e js/ui/layer-style.js (Simbologia, Rótulos).
   ============================================================ */

import { el, byId } from "./dom.js";
import { createLayerInfo } from "./layer-info.js";
import { createAppearanceEditor, fill } from "./layer-style.js";
import { layerPendingState } from "./skeleton.js";
import { isDefaultSymbol } from "../data/symbol.js";
import { LABEL_STYLE_DEFAULTS } from "../core/store.js";

const TABS = ["info", "symbology", "labels", "fields"];

/* Abaixo disso a janela ocupa a tela toda (CSS) e não arrasta. */
const DRAG_MIN_WIDTH = 721;

export function createLayerProperties(store, { panels, getZoom = () => null, zoomRange = {}, onChange = () => {} }) {
    const windowNode = byId("panel-properties");
    const handle = byId("layer-window-handle");
    const layerSelect = byId("layer-window-layer");
    const tabList = byId("layer-window-tabs");
    const tabs = Array.from(tabList.querySelectorAll("[role='tab']"));
    const body = byId("layer-window-body");
    const resetButton = byId("layer-window-reset");
    const cancelButton = byId("layer-window-cancel");
    const okButton = byId("layer-window-ok");

    let layerId = null;
    let tab = "info";
    /* Mudança vinda de um controle contínuo da própria janela: o mapa muda, a aba não redesenha. */
    let muted = false;
    /* layerId → aparência de quando a janela abriu (ou de quando a camada entrou nela). */
    const snapshots = new Map();

    const isOpen = () => panels.isOpen("properties");
    const currentLayer = () => store.getLayer(layerId);

    const quiet = (action) => {
        muted = true;

        try {
            action();
        } finally {
            muted = false;
        }
    };

    const info = createLayerInfo();
    const editor = createAppearanceEditor(store, { rerender: () => render(), quiet });


    /* ---------------- desenho ---------------- */

    const remember = (id) => {
        if (id && !snapshots.has(id)) {
            const snapshot = store.snapshotAppearance(id);

            if (snapshot) {
                snapshots.set(id, snapshot);
            }
        }
    };

    const renderLayerSelect = () => {
        layerSelect.replaceChildren(...store.state.layers.map((layer) => el("option", {
            value: layer.id,
            text: layer.name,
            selected: layer.id === layerId,
            disabled: layer.status !== "ready"
        })));
    };

    const renderTabs = () => {
        tabs.forEach((button) => {
            const selected = button.dataset.tab === tab;

            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
        });

        body.setAttribute("aria-labelledby", `lw-tab-${tab}`);
    };

    const canReset = (layer) => {
        if (tab === "symbology") {
            return !isDefaultSymbol(layer) || layer.theme.visible;
        }

        if (tab === "labels") {
            return Object.entries(LABEL_STYLE_DEFAULTS).some(([key, value]) => layer.labels[key] !== value);
        }

        return false;
    };

    const drawBody = () => {
        const layer = currentLayer();

        if (!layer || layer.status !== "ready") {
            body.replaceChildren(layerPendingState(layer));
            resetButton.hidden = true;
            return;
        }

        const zoom = getZoom();

        const content = {
            info: () => info.buildInfo(layer, (id) => {
                if (isOpen() && id === layerId && tab === "info") {
                    render();
                }
            }),
            symbology: () => editor.symbology(layer),
            labels: () => editor.labels(layer, { zoom, ...zoomRange }),
            fields: () => info.buildFields(layer)
        }[tab]();

        fill(body, ...content);

        resetButton.hidden = tab === "info" || tab === "fields";
        resetButton.disabled = !canReset(layer);
    };

    /* Redesenha sem perder o foco do teclado nem a rolagem da aba. */
    const render = () => {
        if (!isOpen()) {
            return;
        }

        const focused = body.contains(document.activeElement)
            ? document.activeElement.dataset.focusKey
            : null;
        const scroll = body.scrollTop;

        renderLayerSelect();
        renderTabs();
        drawBody();

        body.scrollTop = scroll;

        if (focused) {
            const target = body.querySelector(`[data-focus-key="${CSS.escape(focused)}"]`);

            if (target) {
                target.focus();
            }
        }
    };


    /* ---------------- abrir, trocar, fechar ---------------- */

    const setTab = (next, { focus = false } = {}) => {
        tab = TABS.includes(next) ? next : "info";
        body.scrollTop = 0;
        render();
        onChange();

        if (focus) {
            tabs.find((button) => button.dataset.tab === tab).focus();
        }
    };

    const setLayer = (id) => {
        const layer = store.getLayer(id);

        if (!layer) {
            return;
        }

        layerId = id;
        remember(id);
        body.scrollTop = 0;
        render();
    };

    /* Abre na camada e na aba pedidas (padrão: a camada ativa, na aba em que estava). */
    const open = ({ layer = null, tab: wanted = null } = {}) => {
        const target = store.getLayer(layer) || currentLayer() || store.getActiveLayer();

        if (!target) {
            return;
        }

        if (!isOpen()) {
            snapshots.clear();
        }

        layerId = target.id;
        remember(layerId);

        if (wanted) {
            tab = TABS.includes(wanted) ? wanted : "info";
        }

        const opening = !isOpen();

        if (opening) {
            panels.open("properties");
        }

        body.scrollTop = 0;
        render();
        onChange();

        /* Foco na aba aberta: dali, ↑/↓ trocam de aba e Tab entra no conteúdo. */
        if (opening) {
            tabs.find((button) => button.dataset.tab === tab).focus();
        }
    };

    const close = () => panels.close("properties");

    /* Botão da barra: abre na aba; na mesma aba de novo, fecha. */
    const toggle = (wanted) => {
        const active = store.getActiveLayer();

        if (isOpen() && tab === wanted && active && active.id === layerId) {
            close();
            return;
        }

        open({ layer: active ? active.id : null, tab: wanted });
    };

    const cancel = () => {
        /*
           Da mais recente para a mais antiga: a fotografia tirada
           primeiro é a do estado original (ex.: qual camada estava
           rotulada), e por isso é a última a ser reposta.
        */
        Array.from(snapshots.values()).reverse().forEach((snapshot) => store.restoreAppearance(snapshot));
        snapshots.clear();
        close();
        store.setStatus("Mudanças nas propriedades desfeitas");
    };

    const reset = () => {
        const layer = currentLayer();

        if (!layer) {
            return;
        }

        if (tab === "symbology") {
            store.setTheme(layer.id, { visible: false });
            store.setSymbol(layer.id, null);
        } else if (tab === "labels") {
            store.setLabels(layer.id, { ...LABEL_STYLE_DEFAULTS });
        }
    };


    /* ---------------- eventos da janela ---------------- */

    tabs.forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));

    /* Abas verticais: ↑/↓ (e ←/→) trocam; Home/End vão às pontas. */
    tabList.addEventListener("keydown", (event) => {
        const position = TABS.indexOf(tab);
        const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];

        if (move) {
            event.preventDefault();
            setTab(TABS[(position + move + TABS.length) % TABS.length], { focus: true });
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setTab(TABS[event.key === "Home" ? 0 : TABS.length - 1], { focus: true });
        }
    });

    layerSelect.addEventListener("change", () => setLayer(layerSelect.value));
    okButton.addEventListener("click", close);
    cancelButton.addEventListener("click", cancel);
    resetButton.addEventListener("click", reset);

    /* Botões da barra esquerda (Estilos, Rótulos, Campos): abrem a janela na aba, para a camada ativa. */
    document.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-properties-tab]");

        if (trigger && !trigger.disabled) {
            toggle(trigger.dataset.propertiesTab);
        }
    });


    /* ---------------- arrastar pelo cabeçalho ---------------- */

    let drag = null;

    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button, select, input") || window.innerWidth < DRAG_MIN_WIDTH) {
            return;
        }

        const box = windowNode.getBoundingClientRect();
        const parent = windowNode.offsetParent.getBoundingClientRect();

        drag = {
            dx: event.clientX - box.left,
            dy: event.clientY - box.top,
            parent,
            width: box.width,
            height: box.height
        };

        handle.setPointerCapture(event.pointerId);
        windowNode.classList.add("is-dragging");
        event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
        if (!drag) {
            return;
        }

        /* Sempre com pelo menos uma faixa do cabeçalho dentro da área do mapa. */
        const left = Math.min(drag.parent.width - 80, Math.max(80 - drag.width, event.clientX - drag.dx - drag.parent.left));
        const top = Math.min(drag.parent.height - 48, Math.max(0, event.clientY - drag.dy - drag.parent.top));

        windowNode.style.left = `${Math.round(left)}px`;
        windowNode.style.top = `${Math.round(top)}px`;
    });

    const endDrag = () => {
        drag = null;
        windowNode.classList.remove("is-dragging");
    };

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    /* Janela estreitou para o modo tela cheia: a posição arrastada deixa de valer. */
    window.addEventListener("resize", () => {
        if (window.innerWidth < DRAG_MIN_WIDTH) {
            windowNode.style.left = "";
            windowNode.style.top = "";
        }
    });


    /* ---------------- store ---------------- */

    const refresh = () => {
        if (!muted) {
            render();
        }
    };

    store.on("layers", () => {
        /* Camada removida com a janela aberta: fecha (não há o que editar). */
        if (isOpen() && !currentLayer()) {
            snapshots.delete(layerId);
            close();
            return;
        }

        refresh();
    });

    store.on("symbol", refresh);
    store.on("theme", refresh);
    store.on("labels", refresh);

    /* Só a aba Informação mostra números que mudam com filtros e busca. */
    store.on("view", (layer) => {
        if (isOpen() && tab === "info" && layer && layer.id === layerId) {
            render();
        }
    });

    return {
        open,
        close,
        isOpen,
        /* Aba aberta (ou null), para a barra marcar o botão correspondente. */
        activeTab: () => (isOpen() ? tab : null),
        activeLayerId: () => (isOpen() ? layerId : null),
        /* Zoom do mapa mudou: a dica da aba Rótulos mostra o zoom atual. */
        onZoom: () => {
            if (isOpen() && tab === "labels" && !muted) {
                render();
            }
        }
    };
}
