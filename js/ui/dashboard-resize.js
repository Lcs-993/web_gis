/* ============================================================
   ALTURA DO DASHBOARD

   Alça na borda superior do dashboard (role="separator"):
   - arrastar (mouse, caneta ou toque) ajusta a altura;
   - teclado: ↑/↓ em passos de 24 px, Home = mínimo, End = máximo;
   - duplo clique volta à altura padrão do CSS (--dashboard-h).

   A altura vira a variável --dashboard-h no <html>, a mesma que o
   CSS usa para o dashboard e para subir os controles do mapa. A
   escolha fica em localStorage (só neste navegador); sem acesso a
   ele, vale a altura padrão.
   ============================================================ */

const STORAGE_KEY = "webgis-dashboard-h";
const MIN_HEIGHT = 240;
/* Espaço de mapa que sempre sobra acima do dashboard. */
const MIN_MAP = 120;
const KEY_STEP = 24;

const readStored = () => {
    try {
        const value = Number(window.localStorage.getItem(STORAGE_KEY));

        return Number.isFinite(value) && value > 0 ? value : null;
    } catch (error) {
        return null;
    }
};

const writeStored = (value) => {
    try {
        if (value === null) {
            window.localStorage.removeItem(STORAGE_KEY);
        } else {
            window.localStorage.setItem(STORAGE_KEY, String(Math.round(value)));
        }
    } catch (error) {
        /* Navegação privada ou armazenamento bloqueado: a altura só não é lembrada. */
    }
};

export function createDashboardResize(dashboard, { onResize, maximizeButton = null } = {}) {
    if (!dashboard) {
        return { refresh: () => {}, setMaximized: () => {} };
    }

    const root = document.documentElement;
    const container = dashboard.parentElement;

    const handle = document.createElement("div");

    handle.className = "dashboard-resizer";
    handle.tabIndex = 0;
    handle.title = "Arraste para ajustar a altura (duplo clique: altura padrão)";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "horizontal");
    handle.setAttribute("aria-label", "Altura do Analytics");
    handle.appendChild(document.createElement("span")).className = "dashboard-resizer-grip";
    dashboard.prepend(handle);

    const maxHeight = () => Math.max(MIN_HEIGHT, container.clientHeight - MIN_MAP);
    const clamp = (value) => Math.min(maxHeight(), Math.max(MIN_HEIGHT, value));

    let custom = readStored();
    let frame = null;

    const notify = () => {
        if (frame !== null) {
            return;
        }

        frame = window.requestAnimationFrame(() => {
            frame = null;

            if (onResize) {
                onResize(dashboard.offsetHeight);
            }
        });
    };

    const updateAria = () => {
        handle.setAttribute("aria-valuemin", String(MIN_HEIGHT));
        handle.setAttribute("aria-valuemax", String(Math.round(maxHeight())));
        handle.setAttribute("aria-valuenow", String(Math.round(dashboard.offsetHeight || custom || MIN_HEIGHT)));
    };

    /* Aplica a altura (px) ou volta ao padrão do CSS (null). */
    const apply = (value, { save = false } = {}) => {
        custom = value === null ? null : clamp(value);

        if (custom === null) {
            root.style.removeProperty("--dashboard-h");
        } else {
            root.style.setProperty("--dashboard-h", `${Math.round(custom)}px`);
        }

        if (save) {
            writeStored(custom);
        }

        updateAria();
        notify();
    };


    /* ---------------- arrastar ---------------- */

    let drag = null;

    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        drag = { startY: event.clientY, startHeight: dashboard.offsetHeight };
        root.classList.add("is-resizing-dashboard");
    });

    handle.addEventListener("pointermove", (event) => {
        if (drag) {
            /* Arrastar para cima aumenta a altura. */
            apply(drag.startHeight + (drag.startY - event.clientY));
        }
    });

    const endDrag = () => {
        if (!drag) {
            return;
        }

        drag = null;
        root.classList.remove("is-resizing-dashboard");
        writeStored(custom);
    };

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    handle.addEventListener("dblclick", () => apply(null, { save: true }));


    /* ---------------- teclado ---------------- */

    handle.addEventListener("keydown", (event) => {
        const current = dashboard.offsetHeight;
        const next = {
            ArrowUp: current + KEY_STEP,
            ArrowDown: current - KEY_STEP,
            Home: MIN_HEIGHT,
            End: maxHeight()
        }[event.key];

        if (next !== undefined) {
            event.preventDefault();
            apply(next, { save: true });
        }
    });


    /* Janela menor: a altura salva é reajustada ao novo limite. */
    window.addEventListener("resize", () => {
        if (custom !== null) {
            apply(custom);
        } else {
            updateAria();
        }
    });

    if (custom !== null) {
        apply(custom);
    }


    /*
       Maximizar: o painel ocupa toda a área do mapa (classe no <html>;
       o CSS cuida do resto). A altura escolhida na alça é mantida e
       volta ao restaurar. Não é lembrado entre sessões.
    */
    const setMaximized = (on) => {
        root.classList.toggle("dashboard-maximized", on);

        if (maximizeButton) {
            const label = on ? "Restaurar" : "Maximizar";

            maximizeButton.setAttribute("aria-pressed", String(on));
            maximizeButton.title = label;
            maximizeButton.setAttribute("aria-label", `${label} o Analytics`);
        }

        notify();
    };

    if (maximizeButton) {
        maximizeButton.addEventListener("click", () => setMaximized(!root.classList.contains("dashboard-maximized")));
    }

    return {
        setMaximized,
        /* Chamar ao abrir o dashboard: os limites dependem do tamanho atual do mapa. */
        refresh: () => {
            if (custom !== null) {
                apply(custom);
            } else {
                updateAria();
            }
        }
    };
}
