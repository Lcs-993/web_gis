/* ============================================================
   IDENTIFICAR CAMADA

   Janela (dialog modal) com os dados de uma camada: resumo
   (feições, geometria, origem) e os atributos descobertos no
   schema, com seus tipos. Esc, o "×" ou clique fora fecham.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, roleLabel } from "./format.js";
import { loadQgisMetadata } from "../data/qgis-metadata.js";

/* Coordenada em graus com 4 casas (~10 m), vírgula decimal. */
const degrees = (value) => value.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const bboxText = (bbox) =>
    bbox
        ? `Lon ${degrees(bbox[0])} a ${degrees(bbox[2])} · Lat ${degrees(bbox[1])} a ${degrees(bbox[3])}`
        : "—";

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
    const metaSection = byId("layer-info-metadata");
    const metaList = byId("layer-info-metadata-list");

    /* layerId → metadados do .qmd (null = sem arquivo ou ainda carregando). */
    const qgisCache = new Map();

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

        const metadata = layer.metadata || {};
        const qgis = qgisCache.get(layer.id) || null;
        const wide = (label, value) => {
            const node = item(label, value);

            node.classList.add("is-wide");
            return node;
        };

        summary.replaceChildren(
            /* Quatro curtos na primeira linha; os de texto longo, dois por linha. */
            item("Feições", formatCount(layer.features.length)),
            item("Visíveis com filtros", formatCount(layer.view.filtered.length)),
            item("Atributos", formatCount(layer.schema.attributes.length)),
            item("Origem", sourceText(layer)),
            wide("Geometria", geometryText(layer)),
            /* Como o mapa lê os dados; o CRS de origem (QGIS) só se for outro. */
            wide("Sistema de coordenadas", metadata.crs || "—"),
            ...(qgis && qgis.crs && qgis.crs !== metadata.crs ? [wide("CRS de origem (QGIS)", qgis.crs)] : []),
            wide("Extensão", bboxText(metadata.bbox))
        );

        renderMetadata(layer, qgis);

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

    /*
       Seção Metadados: descrição gravada no GeoJSON + o .qmd do QGIS
       (título, resumo, palavras-chave, contato, idioma, links).
       Campos vazios não aparecem; sem nada, a seção some.
    */
    const renderMetadata = (layer, qgis) => {
        const rows = [];
        const add = (label, value) => {
            if (value && (!Array.isArray(value) || value.length)) {
                rows.push(el("div", { class: "layer-info-meta-row" }, [el("dt", { text: label }), el("dd", {}, value)]));
            }
        };

        if (qgis) {
            add("Título", qgis.title);
            add("Resumo", qgis.abstract);
            add("Palavras-chave", qgis.keywords.join(", "));
            add("Contato", qgis.contact);
            add("Idioma", qgis.language);
            add("Links", qgis.links.map((link) =>
                el("a", { href: link.url, target: "_blank", rel: "noopener", text: link.name || link.url })));
        }

        if (layer.metadata && layer.metadata.description && (!qgis || layer.metadata.description !== qgis.abstract)) {
            add("Descrição do arquivo", layer.metadata.description);
        }

        metaList.replaceChildren(...rows);
        metaSection.hidden = !rows.length;
    };

    const open = (layerId) => {
        currentId = layerId;
        render();

        if (!dialog.open) {
            dialog.showModal();
        }

        /* .qmd do QGIS: buscado uma vez por camada, na primeira abertura. */
        const layer = store.getLayer(layerId);

        if (layer && layer.source === "url" && !qgisCache.has(layerId)) {
            qgisCache.set(layerId, null);
            loadQgisMetadata(layer.url).then((metadata) => {
                qgisCache.set(layerId, metadata);

                if (currentId === layerId) {
                    render();
                }
            });
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
