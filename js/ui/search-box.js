/*
   Busca textual na camada ativa, respeitando os filtros.

   A caixa de busca fica sempre à vista no canto superior direito
   do mapa; Ctrl+K (⌘K no Mac) leva o foco até ela e Esc limpa o
   termo (com o campo vazio, sai dele). Com o Analytics aberto o
   campo mora no cabeçalho dele (js/main.js).
   O botão Pesquisar da barra esquerda abre a Pesquisa avançada
   (campos, correspondência, E/OU; js/ui/layer-tools.js), que vale
   para esta mesma caixa.
*/

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
            const pending = !layer
                ? "Nenhuma camada para buscar."
                : layer.status === "error"
                    ? `${layer.name} não carregou: a busca não está disponível.`
                    : `${layer.name} ainda está carregando; a busca roda quando terminar.`;

            showFeedback(input.value ? pending : null);
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

        /* Enquadra só quando a busca muda (termo ou opções), não a cada filtro; a pesquisa avançada pode desligar. */
        const signature = `${term}|${JSON.stringify(layer.search.options)}`;

        if (matches.length && lastFitted !== signature) {
            lastFitted = signature;

            if (layer.search.options.fit) {
                mapView.fitFeatures(layer.id, matches);
            }
        }
    };

    /* ---------------- foco (Ctrl+K e menu Ferramentas › Buscar) ---------------- */

    const focusSearch = () => {
        input.focus();
        input.select();
    };

    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "k" || event.key === "K")) {
            event.preventDefault();
            focusSearch();
        }
    });

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
            event.stopPropagation();
            reset();
        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            input.blur();
        }
    });

    byId("search-form").addEventListener("submit", (event) => event.preventDefault());

    clear.addEventListener("click", () => {
        reset();
        input.focus();
    });

    store.on("view", render);

    /* Termo digitado enquanto a camada carregava: a busca roda assim que ela fica pronta. */
    store.on("layers", () => {
        const layer = store.getActiveLayer();

        if (input.value && !pending && layer && layer.status === "ready" && layer.search.term !== input.value.trim()) {
            run();
        }
    });

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

    return { focus: focusSearch };
}
