/* ============================================================
   WEBGIS
   Navegação principal + menu lateral
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    const FOCUSABLE =
        'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"])';

    const supportsInert = "inert" in HTMLElement.prototype;


    /* ============================================================
       NAVEGAÇÃO PRINCIPAL
       ============================================================ */

    const mainNavigation = document.querySelector(".main-navigation");
    const navItems = document.querySelectorAll(".nav-item");

    const openDropdownClass = "is-open";
    const openNavItemClass = "menu-open";


    /* Retorna o item de menu associado a um gatilho, se existir. */
    const getDropdown = (item) => {
        const menu = item.nextElementSibling;

        if (!menu || !menu.classList.contains("nav-dropdown")) {
            return null;
        }

        return menu;
    };


    /* Mantém aria-expanded sincronizado com o estado visual. */
    const syncExpanded = (item, isOpen) => {
        item.setAttribute("aria-expanded", String(isOpen));
    };


    /* Move o foco para dentro (ou de volta) do dropdown. */
    const focusDropdownItem = (menu, direction) => {
        const entries = Array.from(
            menu.querySelectorAll(FOCUSABLE)
        );

        if (!entries.length) {
            return;
        }

        const index = direction === "last"
            ? entries.length - 1
            : 0;

        entries[index].focus();
    };


    const openDropdown = (item, menu, focusTarget) => {
        menu.classList.add(openDropdownClass);
        item.classList.add(openNavItemClass);
        syncExpanded(item, true);

        if (focusTarget) {
            focusDropdownItem(menu, focusTarget);
        }
    };


    const closeDropdown = (item) => {
        const menu = getDropdown(item);

        if (menu) {
            menu.classList.remove(openDropdownClass);
        }

        item.classList.remove(openNavItemClass);
        syncExpanded(item, false);
    };


    /* Fecha todos os dropdowns. Retorna o último gatilho aberto. */
    const closeAllDropdowns = () => {
        let lastItem = null;

        navItems.forEach((item) => {
            if (item.classList.contains(openNavItemClass)) {
                lastItem = item;
            }

            closeDropdown(item);
        });

        return lastItem;
    };


    navItems.forEach((item) => {
        const menu = getDropdown(item);

        item.addEventListener("click", () => {
            const isOpen = menu.classList.contains(openDropdownClass);

            closeAllDropdowns();

            if (!isOpen) {
                openDropdown(item, menu, null);
            }
        });


        /* Abrir e entrar no submenu via teclado. */
        item.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                return;
            }

            event.preventDefault();

            closeAllDropdowns();
            openDropdown(
                item,
                menu,
                event.key === "ArrowDown" ? "first" : "last"
            );
        });
    });


    /* ============================================================
       TECLADO DENTRO DOS DROPDOWNS
       ============================================================ */

    document.querySelectorAll(".nav-dropdown").forEach((menu) => {
        menu.addEventListener("keydown", (event) => {
            /*
               Array.from é obrigatório: querySelectorAll devolve um
               NodeList, que não implementa indexOf — usá-lo direto
               lançava TypeError e derrubava todo o teclado do menu.
            */
            const entries = Array.from(
                menu.querySelectorAll(FOCUSABLE)
            );

            if (!entries.length) {
                return;
            }

            const current = entries.indexOf(
                document.activeElement
            );

            switch (event.key) {
                case "Escape": {
                    event.preventDefault();

                    /*
                       Impede o handler global de rodar: ele
                       também trata Escape e fecharia a sidebar
                       junto com o dropdown.
                    */
                    event.stopPropagation();

                    const item = menu.parentElement
                        .querySelector(".nav-item");

                    closeDropdown(item);
                    item.focus();

                    break;
                }

                case "ArrowDown": {
                    event.preventDefault();
                    entries[(current + 1) % entries.length].focus();
                    break;
                }

                case "ArrowUp": {
                    event.preventDefault();
                    entries[
                        (current - 1 + entries.length) % entries.length
                    ].focus();
                    break;
                }

                case "Home": {
                    event.preventDefault();
                    entries[0].focus();
                    break;
                }

                case "End": {
                    event.preventDefault();
                    entries[entries.length - 1].focus();
                    break;
                }
            }
        });
    });


    /* ============================================================
       FECHAR DROPDOWNS AO CLICAR FORA / SELECIONAR ITEM
       ============================================================ */

    document.addEventListener("click", (event) => {
        if (
            mainNavigation &&
            mainNavigation.contains(event.target)
        ) {
            return;
        }

        closeAllDropdowns();
    });


    navItems.forEach((item) => {
        const menu = getDropdown(item);

        if (!menu) {
            return;
        }

        menu.addEventListener("click", (event) => {
            if (event.target.closest(".dropdown-item")) {
                closeAllDropdowns();
            }
        });
    });


    /* ============================================================
       MENU LATERAL
       ============================================================ */

    const sidebarToggle = document.querySelector(".sidebar-toggle");
    const sidebar = document.querySelector("#sidebar");


    /*
       Enquanto o painel está fechado ele permanece na ordem de
       tabulação, o que fazia o teclado entrar em conteúdo
       invisível. O atributo `inert` resolve nos navegadores
       modernos; abaixo há um fallback por `tabindex`.
    */
    const setSidebarFocusable = (isFocusable) => {
        if (supportsInert) {
            sidebar.inert = !isFocusable;
            return;
        }

        sidebar
            .querySelectorAll(FOCUSABLE)
            .forEach((element) => {
                if (isFocusable) {
                    element.removeAttribute("tabindex");
                } else {
                    element.setAttribute("tabindex", "-1");
                }
            });
    };


    const updateSidebarState = (isOpen) => {

        sidebar.classList.toggle("is-open", isOpen);
        sidebarToggle.classList.toggle("is-open", isOpen);

        sidebarToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        sidebarToggle.setAttribute(
            "aria-label",
            isOpen
                ? "Fechar menu lateral"
                : "Abrir menu lateral"
        );

        sidebar.setAttribute(
            "aria-hidden",
            String(!isOpen)
        );

        setSidebarFocusable(isOpen);
    };


    if (sidebarToggle && sidebar) {

        sidebarToggle.addEventListener("click", () => {
            const isOpen =
                sidebar.classList.contains("is-open");

            /* Evita os dois painéis abertos ao mesmo tempo. */
            closeAllDropdowns();

            updateSidebarState(!isOpen);
        });
    }


    /* ============================================================
       ESCAPE — FECHA DROPDOWNS E DEPOIS A SIDEBAR
       ============================================================ */

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        const lastItem = closeAllDropdowns();

        if (lastItem) {
            lastItem.focus();
            return;
        }

        if (
            sidebar &&
            sidebar.classList.contains("is-open")
        ) {
            updateSidebarState(false);
            sidebarToggle.focus();
        }
    });

});
