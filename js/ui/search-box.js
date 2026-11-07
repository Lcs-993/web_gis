/* Busca textual na camada ativa, respeitando os filtros. */

import { byId } from "./dom.js";
import { formatCount } from "./format.js";
import { SEARCH_DEBOUNCE_MS } from "../config.js";

export function createSearchBox(store, mapView) {
    const input = byId("search-input");
    const clear = byId("search-clear");
    const feedback = byId("search-feedback");

    let pending = null;
    let lastFitted = null;

    const showFeedback = (text) => {
        feedback.textContent = text || "";
        feedback.hidden = !text;
    };

    const run = () => {
        pending = null;

        const layer = store.getActiveLayer();

        clear.hidden = input.value === "";

        if (!layer || layer.status !== "ready") {
            showFeedback(input.value ? "A camada ativa ainda não carregou." : null);
            return;
        }

        store.setSearch(layer.id, input.value);
    };

    const schedule = () => {
        if (pending) {
            window.clearTimeout(pending);
        }

        pending = window.setTimeout(run, SEARCH_DEBOUNCE_MS);
    };

    const reset = () => {
        if (pending) {
            window.clearTimeout(pending);
            pending = null;
        }

        input.value = "";
        clear.hidden = true;
        run();
    };

    const render = (layer) => {
        if (!layer || layer.id !== store.state.activeLayerId) {
            return;
        }

        const { matches } = layer.view;
        const term = layer.search.term;

        if (!term || !matches) {
            showFeedback(null);
            lastFitted = null;
            return;
        }

        if (!layer.visible) {
            showFeedback("Ative a camada para ver os resultados no mapa.");
        } else {
            showFeedback(matches.length
                ? `${formatCount(matches.length)} resultado${matches.length === 1 ? "" : "s"}`
                : "Nenhum resultado");
        }

        /* Enquadra só quando o termo muda, não a cada filtro. */
        if (matches.length && lastFitted !== term) {
            lastFitted = term;
            mapView.fitFeatures(layer.id, matches);
        }
    };

    input.addEventListener("input", schedule);

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            lastFitted = null;

            if (pending) {
                window.clearTimeout(pending);
            }

            run();
            return;
        }

        if (event.key === "Escape" && input.value !== "") {
            event.preventDefault();
            reset();
        }
    });

    byId("search-form").addEventListener("submit", (event) => event.preventDefault());

    clear.addEventListener("click", () => {
        reset();
        input.focus();
    });

    store.on("view", render);

    /* Trocar de camada ativa: a busca recomeça na nova camada. */
    store.on("active", (layer) => {
        input.placeholder = layer ? `Buscar em ${layer.name}` : "Buscar";
        input.setAttribute("aria-label", input.placeholder);

        if (layer && layer.search.term !== input.value.trim()) {
            input.value = layer.search.term;
            clear.hidden = input.value === "";
        }

        render(layer);
    });
}
