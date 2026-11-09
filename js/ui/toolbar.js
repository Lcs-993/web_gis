/* ============================================================
   BARRA DE FERRAMENTAS (esquerda; a única barra lateral)

   Esquerda (estilo ArcGIS Map Viewer): 48 px só com ícones ou
   240 px com ícone + rótulo. Expande pelo botão do rodapé, pelo ☰
   da barra superior ou pela tecla [; a escolha fica salva neste
   navegador. Tem todas as ferramentas, inclusive as da camada ativa (busca,
   filtro, estilos…; a camada ativa se escolhe pelo nome no painel
   Camadas), desabilitadas enquanto nenhuma camada
   está pronta.

   Os controles do mapa (localização, início, zoom) flutuam no
   canto inferior direito do mapa; não há barra à direita.

   Os itens não guardam estado: painéis abrem por data-panel-toggle
   (js/ui/panels.js), o Analytics por data-dashboard-tab e as ações
   por data-action. O indicador de item ativo desliza até o item com
   aria-expanded="true" ou aria-pressed="true".
   ============================================================ */

import { byId } from "./dom.js";

const EXPANDED_KEY = "webgis-barra-expandida";

const read = (key) => {
    try {
        return localStorage.getItem(key) === "1";
    } catch (error) {
        return false;
    }
};

const write = (key, on) => {
    try {
        if (on) {
            localStorage.setItem(key, "1");
        } else {
            localStorage.removeItem(key);
        }
    } catch (error) {
        /* Sem localStorage: vale só nesta visita */
    }
};

/* Teclas de atalho não valem enquanto o usuário digita. */
export const isTyping = (target) =>
    Boolean(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));

export function createToolbars(store, { onAction, dashboardTabs, onLayoutChange } = {}) {
    const left = byId("toolbar-left");
    const expandButton = byId("toolbar-expand");
    const menuButton = byId("toolbar-menu-button");
    const root = document.documentElement;


    /* ---------------- dica (tooltip) ---------------- */

    /*
       Um único elemento no <body>: as barras rolam (overflow) e
       cortariam uma dica feita com ::after. Aparece com o mouse e
       com o foco do teclado, só quando o rótulo não está visível.
    */
    const tooltip = document.createElement("div");

    tooltip.className = "toolbar-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);

    const labelsVisible = (item) => item.closest(".toolbar-left") && left.classList.contains("is-expanded");

    const showTooltip = (item) => {
        /* Item aberto (painel, menu ou cartão à vista): a dica só atrapalharia. */
        if (!item.dataset.tooltip || labelsVisible(item) || item.getAttribute("aria-expanded") === "true") {
            tooltip.hidden = true;
            return;
        }

        tooltip.textContent = item.dataset.tooltip;
        tooltip.hidden = false;

        /* Em tela cheia (Apresentar) só o elemento em tela cheia é desenhado: a dica vai para dentro dele. */
        const host = document.fullscreenElement || document.webkitFullscreenElement || document.body;

        if (tooltip.parentElement !== host) {
            host.appendChild(tooltip);
        }

        const box = item.getBoundingClientRect();
        const tip = tooltip.getBoundingClientRect();
        const x = box.right + 10;
        const y = Math.min(window.innerHeight - tip.height - 6, Math.max(6, box.top + (box.height - tip.height) / 2));

        tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };

    const hideTooltip = () => {
        tooltip.hidden = true;
    };


    /* ---------------- indicador do item ativo ---------------- */

    const refreshIndicator = (bar) => {
        const indicator = bar.querySelector(".toolbar-indicator");
        const active = bar.querySelector(
            ".toolbar-scroll .toolbar-item[aria-expanded='true'], .toolbar-scroll .toolbar-item[aria-pressed='true']"
        );

        if (!indicator) {
            return;
        }

        indicator.classList.toggle("is-visible", Boolean(active));

        if (active) {
            indicator.style.transform = `translateY(${active.offsetTop}px)`;
            indicator.style.height = `${active.offsetHeight}px`;
        }
    };

    const refresh = () => {
        if (dashboardTabs) {
            left.querySelectorAll("[data-dashboard-tab]").forEach((item) => {
                item.setAttribute("aria-pressed", String(dashboardTabs.isActive(item.dataset.dashboardTab)));
            });
        }

        refreshIndicator(left);
    };


    /* ---------------- expandir / recolher (esquerda) ---------------- */

    const setExpanded = (on, { save = true } = {}) => {
        left.classList.toggle("is-expanded", on);
        expandButton.setAttribute("aria-expanded", String(on));
        expandButton.setAttribute("aria-label", on ? "Recolher a barra" : "Expandir a barra");
        expandButton.dataset.tooltip = on ? "Recolher ( [ )" : "Expandir ( [ )";
        menuButton.setAttribute("aria-expanded", String(on));
        menuButton.setAttribute("aria-label", on ? "Recolher a barra de ferramentas" : "Expandir a barra de ferramentas");
        hideTooltip();

        if (save) {
            write(EXPANDED_KEY, on);
        }
    };

    const toggleLeft = () => setExpanded(!left.classList.contains("is-expanded"));

    expandButton.addEventListener("click", toggleLeft);
    menuButton.addEventListener("click", toggleLeft);

    /* A largura anima; o mapa e o indicador se ajustam no fim. */
    left.addEventListener("transitionend", (event) => {
        if (event.target === left && event.propertyName === "width") {
            refresh();

            if (onLayoutChange) {
                onLayoutChange();
            }
        }
    });


    /* Sem camada pronta, as ferramentas da camada ficam desabilitadas. */
    const syncLayerTools = () => {
        const layer = store.getActiveLayer();
        const ready = Boolean(layer && layer.status === "ready");

        left.querySelectorAll("[data-needs-layer]").forEach((item) => {
            item.disabled = !ready;
        });

        document.querySelectorAll("[data-active-layer-name]").forEach((node) => {
            node.textContent = layer ? layer.name : "";
        });
    };


    store.on("layers", syncLayerTools);
    store.on("active", syncLayerTools);


    /* ---------------- cliques e teclado ---------------- */

    [left].forEach((bar) => {
        bar.addEventListener("click", (event) => {
            const item = event.target.closest(".toolbar-item");

            if (!item) {
                return;
            }

            hideTooltip();

            /* "Em breve": não faz nada (a dica já diz). */
            if (item.hasAttribute("data-soon")) {
                event.preventDefault();
                showTooltip(item);
                return;
            }

            if (item.dataset.action && onAction) {
                onAction(item.dataset.action);
            }

            if (item.dataset.dashboardTab && dashboardTabs) {
                dashboardTabs.toggle(item.dataset.dashboardTab);
            }
        });

        bar.addEventListener("pointerover", (event) => {
            const item = event.target.closest(".toolbar-item");

            if (item) {
                showTooltip(item);
            }
        });

        bar.addEventListener("pointerleave", hideTooltip);
        bar.addEventListener("focusin", (event) => {
            const item = event.target.closest(".toolbar-item");

            if (item && item.matches(":focus-visible")) {
                showTooltip(item);
            }
        });
        bar.addEventListener("focusout", hideTooltip);
        bar.querySelector(".toolbar-scroll").addEventListener("scroll", hideTooltip, { passive: true });

        /* ↑/↓ percorrem os itens da barra; Home/End vão às pontas. */
        bar.addEventListener("keydown", (event) => {
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                return;
            }

            const items = Array.from(bar.querySelectorAll(".toolbar-item")).filter((item) => !item.disabled && item.offsetParent !== null);
            const position = items.indexOf(document.activeElement);

            if (!items.length) {
                return;
            }

            event.preventDefault();

            const next = event.key === "Home"
                ? 0
                : event.key === "End"
                    ? items.length - 1
                    : (position + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;

            items[next].focus();
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "[" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target)) {
            event.preventDefault();
            toggleLeft();
        }
    }, true);

    window.addEventListener("resize", () => {
        hideTooltip();
        refresh();
    });


    /* ---------------- estado inicial ---------------- */

    setExpanded(read(EXPANDED_KEY), { save: false });
    syncLayerTools();
    refresh();

    return {
        refresh,
        /* Menu Ferramentas › Barra lateral expandida (mesmo efeito da tecla [). */
        toggle: toggleLeft,
        isExpanded: () => left.classList.contains("is-expanded")
    };
}
