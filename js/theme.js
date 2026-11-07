/* ============================================================
   WEBGIS
   Alternância de tema (claro / escuro)

   O tema escuro é o padrão. O script inline no <head> aplica o
   data-theme antes da primeira pintura (sem flash); este arquivo
   cuida da troca em tempo de execução e da persistência da
   escolha do usuário. A preferência do sistema não é seguida: o
   tema só muda por escolha explícita.
   ============================================================ */

(() => {

    const STORAGE_KEY = "webgis-theme";
    const DARK = "dark";
    const LIGHT = "light";

    const root = document.documentElement;
    const toggle = document.getElementById("theme-toggle");
    const metaThemeColor = document.getElementById("meta-theme-color");

    /* Mantém sincronizado com --color-bg de cada tema. */
    const THEME_COLOR = {
        light: "#f5f5f7",
        dark: "#1c1c1e"
    };


    const store = (theme) => {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            /* Modo privado ou cota estourada: não é crítico */
        }
    };


    const apply = (theme) => {
        root.setAttribute("data-theme", theme);

        if (metaThemeColor) {
            metaThemeColor.setAttribute("content", THEME_COLOR[theme] || THEME_COLOR.dark);
        }

        if (toggle) {
            const isDark = theme === DARK;

            toggle.setAttribute("aria-pressed", String(isDark));
            toggle.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo escuro");
        }
    };


    /* Estado inicial: o atributo já veio do <head>; aqui só se sincroniza a UI. */
    apply(root.getAttribute("data-theme") === LIGHT ? LIGHT : DARK);


    if (toggle) {
        toggle.addEventListener("click", () => {
            const next = root.getAttribute("data-theme") === DARK ? LIGHT : DARK;

            apply(next);
            store(next);
        });
    }

})();
