/* ============================================================
   MENUS DE MÓDULOS — barra superior

   Gera, a partir de MODULE_MENUS (config.js), um botão por menu
   com uma lista suspensa de módulos. Item com action chama
   onAction(action); item sem action fica como "Em breve".

   Teclado (padrão de menu): Enter/Espaço/↓ abre e foca o primeiro
   item; ↑/↓ percorrem os itens; ←/→ passam ao menu vizinho; Esc
   fecha e devolve o foco ao botão. Clique fora fecha. Com um menu
   aberto, passar o mouse sobre outro botão troca de menu.
   ============================================================ */

import { el } from "./dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/* Ícones de traço (viewBox 24), no espírito dos SF Symbols. */
const ICONS = {
    flame: "M12 3c.5 3 3.5 4.6 3.5 8.6a3.5 3.5 0 0 1-7 0c0-1.6.7-2.7 1.6-3.6.2 1.4 1 2.2 1.9 2.4C11.4 8.3 11 5.6 12 3ZM6.5 13.5a5.5 5.5 0 0 0 11 0",
    cloud: "M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18ZM9 21l1-2M14 21l1-2",
    bug: "M8 9a4 4 0 0 1 8 0v4a4 4 0 0 1-8 0V9ZM12 9v8M4 13h4M16 13h4M5 8l3 2M19 8l-3 2M5 18l3-2M19 18l-3-2M10 5 9 3M14 5l1-2",
    leaf: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c3-4 6-6.5 9-8",
    calendar: "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM4 10h16M8 3.5V7M16 3.5V7",
    sprout: "M12 20v-8M12 12c0-3.5-2.5-6-7-6 0 3.5 2.5 6 7 6ZM12 12c0-3 2-5.5 6.5-5.5 0 3-2 5.5-6.5 5.5ZM7 20h10",
    droplet: "M12 3.5c3 3.6 5.5 6.6 5.5 10a5.5 5.5 0 0 1-11 0c0-3.4 2.5-6.4 5.5-10Z",
    truck: "M3 6h11v10H3zM14 9.5h4l3 3.5v3h-7M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    trend: "M4 19h16M5 15l4.5-4.5 3 3L19 7M15 7h4v4",
    radius: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 12l5.5-3.5",
    ruler: "M3.5 15.5 15.5 3.5l5 5-12 12-5-5ZM7 12l1.5 1.5M10 9l2 2M13 6l1.5 1.5",
    printer: "M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z",
    "map-pin": "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11ZM12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z",
    "file-plus": "M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4ZM14 3v4h4M12 11v6M9 14h6"
};

const svgIcon = (d, { viewBox = "0 0 24 24", className, strokeWidth = "1.7" } = {}) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const path = document.createElementNS(SVG_NS, "path");

    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className);
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", strokeWidth);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    return svg;
};

const chevron = () => svgIcon("m3 4.5 3 3 3-3", { viewBox: "0 0 12 12", className: "module-menu-chevron", strokeWidth: "1.6" });

export function createModuleMenu(container, menus, { onAction } = {}) {
    if (!container || !menus || !menus.length) {
        return { close: () => {} };
    }

    let openIndex = -1;

    const entries = menus.map((menu, index) => {
        const listId = `module-menu-${menu.id}`;

        const trigger = el("button", {
            type: "button",
            class: "module-menu-trigger",
            id: `${listId}-button`,
            "aria-haspopup": "menu",
            "aria-expanded": "false",
            "aria-controls": listId
        }, [el("span", { text: menu.label }), chevron()]);

        const items = menu.items.map((item) => {
            const ready = Boolean(item.action);

            return el("button", {
                type: "button",
                role: "menuitem",
                class: `module-menu-item${ready ? "" : " is-soon"}`,
                tabindex: "-1",
                "aria-disabled": ready ? null : "true",
                dataset: ready ? { action: item.action } : {}
            }, [
                el("span", { class: "module-menu-icon" },
                    ICONS[item.icon] ? svgIcon(ICONS[item.icon], { className: "module-menu-icon-svg" }) : null),
                el("span", { class: "module-menu-item-text" }, [
                    el("span", { class: "module-menu-item-label", text: item.label }),
                    item.description
                        ? el("span", { class: "module-menu-item-description", text: item.description })
                        : null
                ]),
                ready ? null : el("span", { class: "module-menu-soon", text: "Em breve" })
            ]);
        });

        const list = el("div", {
            class: `module-menu-list tone-${menu.tone || "gray"}`,
            id: listId,
            role: "menu",
            "aria-labelledby": trigger.id,
            hidden: true
        }, [el("p", { class: "module-menu-title", text: menu.label, "aria-hidden": "true" }), ...items]);

        const group = el("div", { class: "module-menu-group" }, [trigger, list]);

        container.appendChild(group);

        return { index, trigger, list, items, group };
    });

    const focusItem = (entry, position) => {
        const { items } = entry;

        if (items.length) {
            items[(position + items.length) % items.length].focus();
        }
    };

    const close = ({ returnFocus = false } = {}) => {
        if (openIndex === -1) {
            return;
        }

        const entry = entries[openIndex];

        entry.list.hidden = true;
        entry.trigger.setAttribute("aria-expanded", "false");
        openIndex = -1;

        if (returnFocus) {
            entry.trigger.focus();
        }
    };

    const open = (index, { focus = null } = {}) => {
        if (openIndex !== index) {
            close();
        }

        const entry = entries[index];

        entry.list.hidden = false;
        entry.trigger.setAttribute("aria-expanded", "true");
        openIndex = index;

        if (focus === "first") {
            focusItem(entry, 0);
        } else if (focus === "last") {
            focusItem(entry, -1);
        }
    };

    const neighbor = (index, step) => (index + step + entries.length) % entries.length;

    entries.forEach((entry) => {
        const { index, trigger, list, items } = entry;

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

                const next = neighbor(index, event.key === "ArrowRight" ? 1 : -1);

                entries[next].trigger.focus();

                if (openIndex !== -1) {
                    open(next);
                }
            } else if (event.key === "Escape" && openIndex !== -1) {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        });

        list.addEventListener("click", (event) => {
            const item = event.target.closest(".module-menu-item");

            if (!item || item.getAttribute("aria-disabled") === "true") {
                return;
            }

            close({ returnFocus: true });

            if (onAction) {
                onAction(item.dataset.action);
            }
        });

        list.addEventListener("keydown", (event) => {
            const position = items.indexOf(document.activeElement);

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                focusItem(entry, position + (event.key === "ArrowDown" ? 1 : -1));
            } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                focusItem(entry, event.key === "Home" ? 0 : -1);
            } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();

                const next = neighbor(index, event.key === "ArrowRight" ? 1 : -1);

                entries[next].trigger.focus();
                open(next, { focus: "first" });
            } else if (event.key === "Escape") {
                /* stopPropagation: o Esc não chega aos painéis do mapa. */
                event.preventDefault();
                event.stopPropagation();
                close({ returnFocus: true });
            } else if (event.key === "Tab") {
                close();
            }
        });
    });

    /* pointerdown fora de qualquer menu fecha o aberto. */
    document.addEventListener("pointerdown", (event) => {
        if (openIndex !== -1 && !container.contains(event.target)) {
            close();
        }
    });

    return { close };
}
