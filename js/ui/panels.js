/* ============================================================
   GERENCIADOR DE PAINÉIS

   Abre/fecha os painéis (camadas, filtros, dashboard) a partir de
   qualquer botão com data-panel-toggle="<id>". Mantém
   aria-expanded de todos os gatilhos, `inert` em painéis
   fechados e uma pilha para o Escape fechar o mais recente.

   Painéis "popover" fecham ao clicar fora; os demais ficam
   abertos enquanto o usuário trabalha no mapa.
   ============================================================ */

export function createPanels(definitions, { onChange } = {}) {
    const panels = new Map();
    const stack = [];

    const triggersOf = (id) =>
        Array.from(document.querySelectorAll(`[data-panel-toggle="${id}"]`));

    const apply = (panel) => {
        const { element, open } = panel;

        /* Painéis com transição (sidebar) não usam hidden: display:none mataria a animação. */
        if (panel.useHidden) {
            element.hidden = !open;
        }

        element.inert = !open;
        element.classList.toggle("is-open", open);
        element.setAttribute("aria-hidden", String(!open));

        triggersOf(panel.id).forEach((trigger) => {
            trigger.setAttribute("aria-expanded", String(open));
        });

        if (panel.hostClass) {
            document.documentElement.classList.toggle(panel.hostClass, open);
        }
    };

    const setOpen = (id, open, { focus = false, returnFocus = null } = {}) => {
        const panel = panels.get(id);

        if (!panel || panel.open === open) {
            return;
        }

        panel.open = open;

        const position = stack.indexOf(id);

        if (position !== -1) {
            stack.splice(position, 1);
        }

        if (open) {
            stack.push(id);

            panels.forEach((other) => {
                if (other !== panel && open && panel.exclusiveWith.includes(other.id)) {
                    setOpen(other.id, false);
                }
            });
        }

        apply(panel);

        if (open && focus) {
            const target = panel.element.querySelector(
                "[autofocus], input, select, button, [tabindex]:not([tabindex='-1'])"
            );

            if (target) {
                target.focus();
            }
        }

        if (!open && returnFocus) {
            returnFocus.focus();
        }

        if (onChange) {
            onChange(id, open);
        }
    };

    definitions.forEach((definition) => {
        const element = document.getElementById(definition.element);

        if (!element) {
            return;
        }

        const panel = {
            id: definition.id,
            element,
            open: false,
            popover: Boolean(definition.popover),
            useHidden: definition.useHidden !== false,
            hostClass: definition.hostClass || null,
            exclusiveWith: definition.exclusiveWith || []
        };

        panels.set(panel.id, panel);
        apply(panel);
    });

    document.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-panel-toggle]");

        if (!trigger) {
            return;
        }

        const panel = panels.get(trigger.dataset.panelToggle);

        if (!panel) {
            return;
        }

        setOpen(panel.id, !panel.open, { focus: !panel.open && panel.popover });
    });

    document.addEventListener("click", (event) => {
        const closer = event.target.closest("[data-panel-close]");

        if (closer) {
            setOpen(closer.dataset.panelClose, false);
        }
    });

    /*
       pointerdown (e não click): o alvo ainda está no DOM. Com
       click, um botão removido durante o próprio clique (ex.: o "×"
       de um filtro) parecia "fora" do painel e o fechava.
    */
    document.addEventListener("pointerdown", (event) => {
        panels.forEach((panel) => {
            if (!panel.open || !panel.popover) {
                return;
            }

            if (panel.element.contains(event.target)) {
                return;
            }

            if (triggersOf(panel.id).some((trigger) => trigger.contains(event.target))) {
                return;
            }

            setOpen(panel.id, false);
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || event.defaultPrevented || !stack.length) {
            return;
        }

        /* Uma janela modal aberta trata o próprio Esc; os painéis atrás ficam como estão. */
        if (document.querySelector("dialog[open]")) {
            return;
        }

        const id = stack[stack.length - 1];
        const trigger = triggersOf(id).find((item) => item.offsetParent !== null);

        event.preventDefault();
        setOpen(id, false, { returnFocus: trigger || null });
    });

    return {
        open: (id, options) => setOpen(id, true, options),
        close: (id) => setOpen(id, false),
        toggle: (id) => {
            const panel = panels.get(id);

            if (panel) {
                setOpen(id, !panel.open);
            }
        },
        isOpen: (id) => Boolean(panels.get(id) && panels.get(id).open)
    };
}
