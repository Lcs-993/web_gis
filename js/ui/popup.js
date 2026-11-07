/* Conteúdo do popup: todos os atributos do schema, na ordem do arquivo. */

import { el } from "./dom.js";
import { formatValue } from "./format.js";
import { getAttribute } from "../data/values.js";

export function buildPopup(layer, feature) {
    const attributes = layer.schema.attributes.filter((attribute) => attribute.role !== "empty");

    const list = el("dl", { class: "feature-info" });

    attributes.forEach((attribute) => {
        list.append(
            el("dt", { text: attribute.name }),
            el("dd", { text: formatValue(getAttribute(feature, attribute.name), attribute) })
        );
    });

    if (!attributes.length) {
        list.append(el("dd", { class: "feature-info-empty", text: "Sem atributos." }));
    }

    return el("div", { class: "feature-popup-body" }, [
        el("p", { class: "feature-popup-layer", text: layer.name }),
        list
    ]);
}
