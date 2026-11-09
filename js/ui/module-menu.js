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

    container.replaceChildren(...triggers.map((trigger) => el("div", { class: "module-menu-group" }, trigger)));

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
