/* ============================================================
   BARRA DE MENUS (barra superior)

   Um botão por menu de MODULE_MENUS (config.js); a lista abre com
   o componente de menu (js/ui/menu.js, estilo macOS Big Sur).

   getMenus() é chamado a cada abertura: marcações (✓) e itens que
   dependem do estado (mapas base, tema, tela cheia) chegam sempre
   atualizados, sem o menu guardar estado.

   Teclado (padrão de barra de menus): Enter/Espaço/↓ abre e foca o
   primeiro item; ↑ abre no último; ←/→ passam ao menu vizinho
   (também de dentro do menu aberto); Esc fecha e devolve o foco ao
   botão. Com um menu aberto, passar o mouse sobre outro botão troca
   de menu.

   Tela estreita: quando os botões não cabem entre a marca e as
   ações da barra, a barra recebe .is-compact e eles dão lugar a um
   único botão "Módulos", cuja lista traz todos os menus, um após o
   outro, com o nome de cada um como título de seção.
   ============================================================ */

import { el } from "./dom.js";
import { openMenu } from "./menu.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const chevron = () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const path = document.createElementNS(SVG_NS, "path");

    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("class", "module-menu-chevron");
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", "m3 4.5 3 3 3-3");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    return svg;
};

export function createModuleMenu(container, { getMenus, onAction } = {}) {
    const menus = getMenus ? getMenus() : [];

    if (!container || !menus.length) {
        return { close: () => {} };
    }

    let openIndex = -1;
    let handle = null;

    const triggers = menus.map((menu) => el("button", {
        type: "button",
        class: "module-menu-trigger",
        id: `module-menu-${menu.id}-button`,
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        dataset: { menu: menu.id }
    }, [el("span", { text: menu.label }), chevron()]));

    const compactTrigger = el("button", {
        type: "button",
        class: "module-menu-trigger module-menu-compact",
        id: "module-menu-compact-button",
        "aria-haspopup": "menu",
        "aria-expanded": "false"
    }, [el("span", { text: "Módulos" }), chevron()]);

    container.replaceChildren(
        ...triggers.map((trigger) => el("div", { class: "module-menu-group" }, trigger)),
        el("div", { class: "module-menu-group module-menu-compact-group" }, compactTrigger)
    );

    const close = () => {
        if (handle) {
            handle.close();
        }
    };

    const open = (index, { focus = null } = {}) => {
        const current = getMenus()[index];
        const trigger = triggers[index];

        close();
        openIndex = index;
        trigger.setAttribute("aria-expanded", "true");

        handle = openMenu({
            items: current.items,
            anchor: trigger,
            label: current.label,
            focus,
            onAction,
            onHorizontal: (step) => move(index, step, { openNext: true }),
            onClose: () => {
                trigger.setAttribute("aria-expanded", "false");

                if (openIndex === index) {
                    openIndex = -1;
                    handle = null;
                }
            }
        });
    };

    /* Vizinho à esquerda/direita; com um menu aberto, abre o vizinho. */
    const move = (index, step, { openNext = false } = {}) => {
        const nextIndex = (index + step + triggers.length) % triggers.length;

        triggers[nextIndex].focus();

        if (openNext || openIndex !== -1) {
            open(nextIndex, { focus: "first" });
        }

        return true;
    };

    /* Todos os menus numa lista só: título de seção + itens, separados por filete. */
    const openCompact = ({ focus = null } = {}) => {
        const items = getMenus().flatMap((menu, index) => [
            ...(index ? [{ separator: true }] : []),
            { heading: menu.label },
            ...menu.items
        ]);

        close();
        openIndex = -2;
        compactTrigger.setAttribute("aria-expanded", "true");

        handle = openMenu({
            items,
            anchor: compactTrigger,
            label: "Módulos",
            focus,
            onAction,
            onClose: () => {
                compactTrigger.setAttribute("aria-expanded", "false");

                if (openIndex === -2) {
                    openIndex = -1;
                    handle = null;
                }
            }
        });
    };

    compactTrigger.addEventListener("click", () => {
        if (openIndex === -2) {
            close();
        } else {
            openCompact();
        }
    });

    compactTrigger.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openCompact({ focus: "first" });
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openCompact({ focus: "last" });
        }
    });

    /*
       Modo compacto: mede com os botões completos à mostra; se o
       primeiro encosta na marca ou o último nas ações, compacta.
    */
    const topbar = container.closest(".topbar");
    const brand = topbar ? topbar.querySelector(".brand") : null;
    const actions = topbar ? topbar.querySelector(".topbar-actions") : null;
    const MIN_GAP = 8;

    const updateCompact = () => {
        if (!topbar || !brand || !actions) {
            return;
        }

        const wasCompact = topbar.classList.contains("is-compact");

        topbar.classList.remove("is-compact");

        const first = triggers[0].getBoundingClientRect();
        const last = triggers[triggers.length - 1].getBoundingClientRect();
        const compact = first.left < brand.getBoundingClientRect().right + MIN_GAP
            || last.right > actions.getBoundingClientRect().left - MIN_GAP;

        topbar.classList.toggle("is-compact", compact);

        if (compact !== wasCompact) {
            close();
        }
    };

    updateCompact();

    if (typeof ResizeObserver === "function" && topbar) {
        new ResizeObserver(updateCompact).observe(topbar);
    } else {
        window.addEventListener("resize", updateCompact);
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(updateCompact);
    }

    triggers.forEach((trigger, index) => {
        trigger.addEventListener("click", () => {
            if (openIndex === index) {
                close();
            } else {
                open(index);
            }
        });

        trigger.addEventListener("pointerenter", () => {
            if (openIndex !== -1 && openIndex !== index) {
                open(index);
            }
        });

        trigger.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open(index, { focus: "first" });
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                open(index, { focus: "last" });
            } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                move(index, event.key === "ArrowRight" ? 1 : -1);
            }
        });
    });

    return { close };
}
