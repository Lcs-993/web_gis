/* ============================================================
   MENU (estilo macOS Big Sur)

   Um único componente para todos os menus: barra superior,
   filtro da busca e menu de contexto (botão direito).

   Linha compacta (24 px, 13 px) em três colunas:
     marcação (✓) · rótulo · atalho em cinza ou › de submenu.
   Item selecionado (hover/teclado) ganha a pílula na cor de
   acento. Itens sem ação ficam em cinza com "Em breve".

   Itens:
     { label, action?, shortcut?, checked?, disabled?, soon?,
       description?, items?: [...] }      submenu em cascata
     { separator: true }                  filete
     { heading: "Texto" }                 título de seção

   checked: booleano já resolvido por quem monta a lista.
   description vira a dica (title) da linha.

   Teclado: ↑/↓ percorrem (pulam desabilitados), Home/End, Enter
   ou Espaço ativam, → abre o submenu, ← volta ao menu pai, Esc
   fecha o nível atual. Submenus também abrem com o mouse, após um
   pequeno atraso. Clique fora fecha tudo.
   ============================================================ */

import { el } from "./dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SUBMENU_DELAY = 160;

const sprite = (id, className) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const use = document.createElementNS(SVG_NS, "use");

    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#${id}`);
    svg.appendChild(use);

    return svg;
};

/* Marca ✓ e seta ›, desenhadas no mesmo traço dos ícones. */
const CHECK = "M5 12.5 9.5 17 19 7";
const CHEVRON = "M9.5 6 15.5 12l-6 6";

const glyph = (d, className) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const path = document.createElementNS(SVG_NS, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    return svg;
};

const isActionable = (item) => Boolean(item.action || (item.items && item.items.length));

let layer = null;
let current = null;

/*
   Camada única para todos os níveis do menu aberto: no <body> ou,
   em tela cheia (Apresentar), dentro do elemento em tela cheia (só
   ele é desenhado).
*/
const getLayer = () => {
    if (!layer) {
        layer = el("div", { class: "menu-layer" });
    }

    const host = document.fullscreenElement || document.webkitFullscreenElement || document.body;

    if (layer.parentElement !== host) {
        host.appendChild(layer);
    }

    return layer;
};

export const closeMenus = (options) => {
    if (current) {
        current.close(options);
    }
};


/*
   Abre um menu.
     items      lista de itens (ver acima)
     anchor     elemento: o menu abre embaixo dele (barra, botões)
     point      { x, y }: o menu abre no ponto (botão direito)
     onAction   (action, item) ao escolher um item
     onClose    ao fechar (qualquer motivo)
     onHorizontal  (direção) ←/→ no nível raiz sem submenu; retorne
                   true para tratar (troca de menu na barra)
     focus      "first" | "last" | null: foco inicial (teclado)
     label      nome acessível do menu
     variant    classe extra "menu-<variant>" (opcional)
*/
export function openMenu({ items, anchor = null, point = null, onAction, onClose, onHorizontal, focus = null, label = "", variant = "" }) {
    closeMenus();

    const container = getLayer();
    const levels = [];
    let submenuTimer = null;
    let closed = false;

    const clearTimer = () => {
        if (submenuTimer) {
            window.clearTimeout(submenuTimer);
            submenuTimer = null;
        }
    };

    const rowsOf = (level) => level.rows.filter((row) => row.getAttribute("aria-disabled") !== "true");

    const focusRow = (level, index) => {
        const rows = rowsOf(level);

        if (rows.length) {
            rows[(index + rows.length) % rows.length].focus();
        }
    };

    /* Fecha os níveis abaixo de "depth" (0 = só a raiz fica). */
    const closeFrom = (depth) => {
        while (levels.length > depth + 1) {
            const level = levels.pop();

            level.element.remove();

            if (level.parentRow) {
                level.parentRow.setAttribute("aria-expanded", "false");
            }
        }
    };

    const place = (element, { x, y, flipX = null }) => {
        element.style.left = "0px";
        element.style.top = "0px";

        const box = element.getBoundingClientRect();
        const margin = 8;
        let left = x;
        let top = y;

        if (left + box.width > window.innerWidth - margin) {
            left = flipX !== null ? flipX - box.width : window.innerWidth - margin - box.width;
        }

        if (top + box.height > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - margin - box.height);
        }

        element.style.left = `${Math.max(margin, Math.round(left))}px`;
        element.style.top = `${Math.max(margin, Math.round(top))}px`;
    };

    const activate = (item) => {
        clearTimer();
        api.close({ returnFocus: true });

        if (onAction) {
            onAction(item.action, item);
        }
    };

    const openSubmenu = (level, row, item, { focusFirst = false } = {}) => {
        clearTimer();
        closeFrom(level.depth);

        const sub = build(item.items, level.depth + 1, row);
        const box = row.getBoundingClientRect();

        row.setAttribute("aria-expanded", "true");
        container.appendChild(sub.element);
        place(sub.element, { x: box.right - 2, y: box.top - 5, flipX: box.left + 2 });

        if (focusFirst) {
            focusRow(sub, 0);
        }
    };

    const build = (list, depth, parentRow = null) => {
        const rows = [];
        const level = { depth, rows, parentRow, element: null };
        const hasChecks = list.some((item) => "checked" in item);

        const children = list.map((item) => {
            if (item.separator) {
                return el("div", { class: "menu-separator", role: "separator" });
            }

            if (item.heading) {
                return el("div", { class: "menu-heading", role: "presentation", text: item.heading });
            }

            const submenu = Boolean(item.items && item.items.length);
            const disabled = Boolean(item.disabled) || !isActionable(item);
            const checkable = "checked" in item;

            const trail = submenu
                ? glyph(CHEVRON, "menu-chevron")
                : item.soon || (!item.action && !item.disabled)
                    ? el("span", { class: "menu-soon", text: "Em breve" })
                    : item.shortcut
                        ? el("kbd", { class: "menu-shortcut", text: item.shortcut })
                        : null;

            const row = el("button", {
                type: "button",
                class: `menu-item${disabled ? " is-disabled" : ""}`,
                role: checkable ? "menuitemcheckbox" : "menuitem",
                tabindex: "-1",
                title: item.description || null,
                "aria-checked": checkable ? String(Boolean(item.checked)) : null,
                "aria-disabled": disabled ? "true" : null,
                "aria-haspopup": submenu ? "menu" : null,
                "aria-expanded": submenu ? "false" : null,
                "aria-keyshortcuts": item.shortcut || null
            }, [
                el("span", { class: "menu-check" }, item.checked ? glyph(CHECK, "menu-check-icon") : null),
                item.icon ? sprite(item.icon, "menu-icon") : null,
                el("span", { class: "menu-label", text: item.label }),
                trail ? el("span", { class: "menu-trail" }, trail) : null
            ]);

            row.addEventListener("click", (event) => {
                event.stopPropagation();

                if (disabled) {
                    return;
                }

                if (submenu) {
                    openSubmenu(level, row, item, { focusFirst: true });
                } else {
                    activate(item);
                }
            });

            /* Mouse: foco acompanha (pílula única) e submenu abre após um instante. */
            row.addEventListener("pointerenter", () => {
                clearTimer();

                if (!disabled) {
                    row.focus({ preventScroll: true });
                }

                submenuTimer = window.setTimeout(() => {
                    if (submenu && !disabled) {
                        openSubmenu(level, row, item);
                    } else {
                        closeFrom(level.depth);
                    }
                }, SUBMENU_DELAY);
            });

            row.addEventListener("keydown", (event) => {
                const position = rowsOf(level).indexOf(row);

                switch (event.key) {
                    case "ArrowDown":
                        event.preventDefault();
                        focusRow(level, position + 1);
                        break;
                    case "ArrowUp":
                        event.preventDefault();
                        focusRow(level, position - 1);
                        break;
                    case "Home":
                        event.preventDefault();
                        focusRow(level, 0);
                        break;
                    case "End":
                        event.preventDefault();
                        focusRow(level, -1);
                        break;
                    case "ArrowRight":
                        event.preventDefault();

                        if (submenu && !disabled) {
                            openSubmenu(level, row, item, { focusFirst: true });
                        } else if (depth === 0 && onHorizontal) {
                            onHorizontal(1);
                        }
                        break;
                    case "ArrowLeft":
                        event.preventDefault();

                        if (depth > 0) {
                            closeFrom(depth - 1);
                            parentRow.focus();
                        } else if (onHorizontal) {
                            onHorizontal(-1);
                        }
                        break;
                    case "Escape":
                        event.preventDefault();
                        event.stopPropagation();

                        if (depth > 0) {
                            closeFrom(depth - 1);
                            parentRow.focus();
                        } else {
                            api.close({ returnFocus: true });
                        }
                        break;
                    case "Tab":
                        event.preventDefault();
                        api.close({ returnFocus: true });
                        break;
                    default:
                        break;
                }
            });

            /* Desabilitados entram na lista (contam na leitura), mas o teclado os pula (rowsOf). */
            rows.push(row);

            return row;
        });

        level.element = el("div", {
            class: `menu${depth ? " is-submenu" : ""}${hasChecks ? " has-checks" : ""}${variant ? ` menu-${variant}` : ""}`,
            role: "menu",
            "aria-label": depth ? (parentRow ? parentRow.textContent : "") : label || null,
            "aria-orientation": "vertical"
        }, children);

        levels.push(level);

        return level;
    };

    const outside = (event) => {
        if (!container.contains(event.target) && !(anchor && anchor.contains(event.target))) {
            api.close();
        }
    };

    const onScrollOrResize = () => api.close();

    const api = {
        close: ({ returnFocus = false } = {}) => {
            if (closed) {
                return;
            }

            closed = true;
            clearTimer();
            levels.splice(0).forEach((level) => level.element.remove());
            document.removeEventListener("pointerdown", outside, true);
            window.removeEventListener("resize", onScrollOrResize);
            window.removeEventListener("blur", onScrollOrResize);

            if (current === api) {
                current = null;
            }

            if (returnFocus && anchor && typeof anchor.focus === "function") {
                anchor.focus();
            }

            if (onClose) {
                onClose();
            }
        },
        focusFirst: () => focusRow(levels[0], 0)
    };

    const root = build(items, 0);

    container.appendChild(root.element);

    if (anchor) {
        const box = anchor.getBoundingClientRect();

        place(root.element, { x: box.left, y: box.bottom + 6 });
    } else if (point) {
        place(root.element, { x: point.x, y: point.y });
    }

    current = api;

    /* pointerdown em captura: fecha antes de o clique chegar ao mapa. */
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("blur", onScrollOrResize);

    if (focus === "first") {
        focusRow(root, 0);
    } else if (focus === "last") {
        focusRow(root, -1);
    } else {
        /* Sem item em foco o teclado ainda funciona: o menu recebe o foco. */
        root.element.tabIndex = -1;
        root.element.focus({ preventScroll: true });
        root.element.addEventListener("keydown", (event) => {
            if (event.target !== root.element) {
                return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                focusRow(root, event.key === "ArrowDown" ? 0 : -1);
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                api.close({ returnFocus: true });
            } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && onHorizontal) {
                event.preventDefault();
                onHorizontal(event.key === "ArrowRight" ? 1 : -1);
            }
        });
    }

    return api;
}
