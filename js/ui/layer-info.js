/* ============================================================
   IDENTIFICAR CAMADA

   Janela (dialog modal) com os dados de uma camada: resumo
   (feições, geometria, origem) e os atributos descobertos no
   schema, com seus tipos. Esc, o "×" ou clique fora fecham.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, roleLabel } from "./format.js";

const sourceText = (layer) => {
    if (layer.source === "file") {
        return "Arquivo local";
    }

    try {
        return new URL(layer.url, window.location.href).host || layer.url;
    } catch (error) {
        return layer.url || "—";
    }
};

const geometryText = (layer) => {
    const entries = Object.entries(layer.geometryTypes || {});

    return entries.length
        ? entries.map(([type, count]) => `${type} (${formatCount(count)})`).join(", ")
        : "—";
};

export function createLayerInfo(store) {
    const dialog = byId("layer-info");
    const title = byId("layer-info-title");
    const summary = byId("layer-info-summary");
    const body = byId("layer-info-attributes");
    const close = byId("layer-info-close");

    let currentId = null;

    const render = () => {
        const layer = store.getLayer(currentId);

        if (!layer) {
            dialog.close();
            return;
        }

        title.textContent = layer.name;

        const item = (label, value) => el("div", { class: "layer-info-item" }, [
            el("dt", { text: label }),
            el("dd", { text: value })
        ]);

        summary.replaceChildren(
            item("Feições", formatCount(layer.features.length)),
            item("Visíveis com filtros", formatCount(layer.view.filtered.length)),
            item("Geometria", geometryText(layer)),
            item("Origem", sourceText(layer)),
            item("Atributos", formatCount(layer.schema.attributes.length))
        );

        body.replaceChildren(...layer.schema.attributes.map((attribute) =>
            el("tr", { class: attribute.role === "empty" ? "is-empty" : null }, [
                el("td", { class: "layer-info-name", text: attribute.name }),
                el("td", {}, el("span", {
                    class: `attribute-role role-${attribute.role}`,
                    text: roleLabel(attribute.role)
                }))
            ])
        ));
    };

    const open = (layerId) => {
        currentId = layerId;
        render();

        if (!dialog.open) {
            dialog.showModal();
        }
    };

    close.addEventListener("click", () => dialog.close());

    /* Clique no fundo (fora da caixa) fecha. */
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    dialog.addEventListener("close", () => {
        currentId = null;
    });

    /* Mantém o conteúdo atualizado se a camada mudar com a janela aberta. */
    const refresh = () => {
        if (dialog.open && currentId) {
            render();
        }
    };

    store.on("layers", refresh);
    store.on("view", refresh);

    return { open };
}
