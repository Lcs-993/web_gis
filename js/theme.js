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


    /*
       Modo sem desfoque (vidro quase sólido, sem backdrop-filter),
       para máquinas em que o mapa fica lento sob os painéis. Liga em
       Configurações › Reduzir transparência.

       A escolha é guardada por tema: no escuro vem desligado; no
       claro vem LIGADO (o vidro claro desfocado sobre o satélite
       perde contraste), até o usuário desligar. Trocar de tema
       aplica a escolha do tema novo. Guardado como "1" (ligado) ou
       "0" (desligado); sem valor, vale o padrão do tema.
       A classe vem antes dos painéis aparecerem, pois este script
       roda no fim do <body>.
    */
    const SEM_BLUR_KEYS = { dark: "webgis-sem-blur", light: "webgis-sem-blur-claro" };
    const SEM_BLUR_DEFAULT = { dark: false, light: true };

    const currentTheme = () => root.getAttribute("data-theme") === LIGHT ? LIGHT : DARK;

    const readSemBlur = (theme) => {
        try {
            const value = localStorage.getItem(SEM_BLUR_KEYS[theme]);

            if (value === "1" || value === "0") {
                return value === "1";
            }
        } catch (error) {
            /* Sem localStorage: vale o padrão do tema */
        }

        return SEM_BLUR_DEFAULT[theme];
    };

    const setSemBlur = (on) => {
        root.classList.toggle("sem-blur", on);

        try {
            localStorage.setItem(SEM_BLUR_KEYS[currentTheme()], on ? "1" : "0");
        } catch (error) {
            /* Sem localStorage: vale só até recarregar */
        }
    };

    const applySemBlur = () => root.classList.toggle("sem-blur", readSemBlur(currentTheme()));

    applySemBlur();


    /* Avisa a interface (painel Configurações) que o tema mudou. */
    const announce = () => document.dispatchEvent(new CustomEvent("webgis:theme"));

    const setTheme = (theme) => {
        const next = theme === LIGHT ? LIGHT : DARK;

        apply(next);
        store(next);
        applySemBlur();
        announce();
    };


    /* Estado inicial: o atributo já veio do <head>; aqui só se sincroniza a UI. */
    apply(root.getAttribute("data-theme") === LIGHT ? LIGHT : DARK);


    if (toggle) {
        toggle.addEventListener("click", () => {
            setTheme(root.getAttribute("data-theme") === DARK ? LIGHT : DARK);
        });
    }


    /* API mínima para os módulos (js/ui/app-panels.js). */
    window.webgisTheme = Object.freeze({
        get: currentTheme,
        set: setTheme,
        isSemBlur: () => root.classList.contains("sem-blur"),
        setSemBlur: (on) => {
            setSemBlur(Boolean(on));
            announce();
        }
    });

})();
