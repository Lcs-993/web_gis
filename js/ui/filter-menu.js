/* ============================================================
   MENU DE FILTROS (funil da pílula de busca)

   Atalho para o que se faz com mais frequência, no estilo dos
   menus do macOS: ver e remover os filtros ativos (✓; clicar
   remove), trocar entre "todas" e "qualquer uma", aplicar um
   conjunto salvo e limpar. Montar condições novas continua no
   painel Filtro (barra esquerda), aberto pelo primeiro item.
   ============================================================ */

import { byId } from "./dom.js";
import { openMenu } from "./menu.js";
import { describeFilter } from "../data/filters.js";
import { applyFilterSet, listSavedFilters } from "../data/saved-filters.js";

export function createFilterMenu(store, { openPanel }) {
    const button = byId("filter-menu-button");

    const itemsFor = (layer) => {
        const filters = layer ? layer.filters : [];
        const saved = layer ? listSavedFilters(layer.id) : [];
        const items = [{ label: "Painel de filtros…", action: "panel", description: "Montar condições por atributo" }];

        if (filters.length) {
            items.push(
                { separator: true },
                { heading: "Ativos (clique para remover)" },
                ...filters.map((filter, index) => ({
                    label: describeFilter(filter),
                    action: `remove:${index}`,
                    checked: true,
                    description: "Remover este filtro"
                }))
            );
        }

        if (filters.length > 1) {
            items.push(
                { separator: true },
                { label: "Atender a todas", action: "mode:all", checked: layer.filterMode !== "any" },
                { label: "Atender a qualquer uma", action: "mode:any", checked: layer.filterMode === "any" }
            );
        }

        items.push(
            { separator: true },
            saved.length
                ? {
                    label: "Filtros salvos",
                    items: saved.map((set, index) => ({
                        label: set.name,
                        action: `saved:${index}`,
                        description: set.filters.map(describeFilter).join(set.mode === "any" ? " ou " : " · ")
                    }))
                }
                : { label: "Nenhum filtro salvo", disabled: true },
            { label: "Limpar filtros", action: "clear", disabled: !filters.length }
        );

        return items;
    };

    const run = (action) => {
        const layer = store.getActiveLayer();
        const [name, arg] = String(action).split(":");

        if (name === "panel") {
            openPanel();
            return;
        }

        if (!layer) {
            return;
        }

        if (name === "remove") {
            store.removeFilter(layer.id, Number(arg));
        } else if (name === "mode") {
            store.setFilterMode(layer.id, arg);
        } else if (name === "saved") {
            const set = listSavedFilters(layer.id)[Number(arg)];

            if (set) {
                applyFilterSet(store, layer, set);
            }
        } else if (name === "clear") {
            store.clearFilters(layer.id);
        }
    };

    let handle = null;

    const open = (focus) => {
        const layer = store.getActiveLayer();

        button.setAttribute("aria-expanded", "true");
        handle = openMenu({
            items: itemsFor(layer && layer.status === "ready" ? layer : null),
            anchor: button,
            label: "Filtros",
            focus,
            onAction: run,
            onClose: () => {
                button.setAttribute("aria-expanded", "false");
                handle = null;
            }
        });
    };

    button.addEventListener("click", () => {
        if (handle) {
            handle.close();
        } else {
            open(null);
        }
    });

    button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            open("first");
        }
    });
}
