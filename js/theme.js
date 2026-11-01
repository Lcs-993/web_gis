/* ============================================================
   WEBGIS
   Alternância de tema (claro / escuro)

   O atributo data-theme é aplicado por um script inline no
   <head> antes da primeira pintura da página, para evitar
   flash branco. Este arquivo cuida apenas da troca em
   tempo de execução e da persistência da preferência.
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


    const readStored = () => {
        try {
            const value = localStorage.getItem(STORAGE_KEY);

            return value === DARK || value === LIGHT ? value : null;
        } catch (error) {
            /* localStorage indisponível */
            return null;
        }
    };


    const store = (theme) => {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            /* Modo privado ou cota estourada: não é crítico */
        }
    };


    /*
       O atributo pode ter vindo do script inline, da preferência
       do sistema ou de um clique. Esta função normaliza os três
       casos e atualiza o que depende do tema.
    */
    const apply = (theme) => {
        root.setAttribute("data-theme", theme);

        if (metaThemeColor) {
            metaThemeColor.setAttribute(
                "content",
                THEME_COLOR[theme] || THEME_COLOR.light
            );
        }

        if (toggle) {
            const isDark = theme === DARK;

            toggle.setAttribute("aria-pressed", String(isDark));
            toggle.setAttribute(
                "aria-label",
                isDark
                    ? "Ativar modo claro"
                    : "Ativar modo escuro"
            );
        }
    };


    /* Estado inicial: atributo já definido, o JS só sincroniza UI */
    apply(root.getAttribute("data-theme") || LIGHT);


    if (toggle) {
        toggle.addEventListener("click", () => {
            const next =
                root.getAttribute("data-theme") === DARK
                    ? LIGHT
                    : DARK;

            apply(next);
            store(next);
        });
    }


    /*
       Sem escolha explícita do usuário, acompanha a preferência
       do sistema em tempo real — alternar o tema do Windows ou
       do macOS muda o site na hora.
    */
    if (window.matchMedia) {
        const query = window.matchMedia("(prefers-color-scheme: dark)");

        const onSystemChange = (event) => {
            if (readStored()) {
                return;
            }

            apply(event.matches ? DARK : LIGHT);
        };

        if (query.addEventListener) {
            query.addEventListener("change", onSystemChange);
        } else if (query.addListener) {
            /* Safari < 14 */
            query.addListener(onSystemChange);
        }
    }

})();
