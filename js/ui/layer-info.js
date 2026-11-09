/* ============================================================
   PROPRIEDADES E CAMPOS DA CAMADA ATIVA (painéis à esquerda)

   Propriedades: resumo (feições, geometria, origem, CRS,
   extensão) e metadados (descrição do GeoJSON + .qmd do QGIS).
   Campos: os atributos descobertos no schema, com tipo e
   quantos valores preenchidos.

   Sempre da camada ativa: o "i" da linha da camada no painel
   Camadas torna a camada ativa e abre Propriedades.
   ============================================================ */

import { el, byId } from "./dom.js";
import { formatCount, formatNumber, roleLabel } from "./format.js";
import { loadQgisMetadata } from "../data/qgis-metadata.js";
import { layerPendingState } from "./skeleton.js";

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

export function createLayerInfo(store, { isVisible = () => true } = {}) {
    const summary = byId("layer-info-summary");
    const body = byId("layer-info-attributes");
    const propertiesBody = byId("layer-properties-attributes");
    const fieldsSummary = byId("layer-fields-summary");
    const propertiesFieldsSummary = byId("layer-properties-fields-summary");
    const metaSection = byId("layer-info-metadata");
    const metaList = byId("layer-info-metadata-list");

    /* layerId → metadados do .qmd (null = sem arquivo ou ainda carregando). */
    const qgisCache = new Map();

    const item = (label, value) => el("div", { class: "layer-info-item" }, [
        el("dt", { text: label }),
        el("dd", { text: value })
    ]);

    const wide = (label, value) => {
        const node = item(label, value);

        node.classList.add("is-wide");
        return node;
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

    const fieldRows = (layer) => {
        const total = layer.features.length;

        return layer.schema.attributes.map((attribute) =>
            el("tr", { class: attribute.role === "empty" ? "is-empty" : null }, [
                el("td", { class: "layer-info-name", text: attribute.name }),
                el("td", {}, el("span", {
                    class: `attribute-role role-${attribute.role}`,
                    text: roleLabel(attribute.role)
                })),
                el("td", {
                    class: "layer-info-filled",
                    title: `${formatCount(attribute.filled)} de ${formatCount(total)}`,
                    text: total ? `${formatNumber((attribute.filled / total) * 100, 0)}%` : "—"
                })
            ])
        );
    };

    const render = () => {
        const layer = store.getActiveLayer();

        if (!layer || layer.status !== "ready") {
            /* Esqueleto enquanto carrega; mensagem clara se falhou. Campos mostra o mesmo. */
            summary.replaceChildren(layerPendingState(layer));
            body.replaceChildren();
            propertiesBody.replaceChildren();
            fieldsSummary.replaceChildren(layerPendingState(layer));
            propertiesFieldsSummary.replaceChildren(layerPendingState(layer));
            metaSection.hidden = true;
            return;
        }

        const metadata = layer.metadata || {};
        const qgis = qgisCache.get(layer.id) || null;

        summary.replaceChildren(
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

        const total = layer.features.length;
        const rows = fieldRows(layer);
        const fieldSummary = `${formatCount(layer.schema.attributes.length)} atributos em ${formatCount(total)} feições`;

        fieldsSummary.replaceChildren(fieldSummary);
        propertiesFieldsSummary.replaceChildren(fieldSummary);

        body.replaceChildren(...rows);
        propertiesBody.replaceChildren(...rows.map((row) => row.cloneNode(true)));

        /* .qmd do QGIS: buscado uma vez por camada, na primeira vez que ela aparece aqui. */
        if (layer.source === "url" && !qgisCache.has(layer.id)) {
            qgisCache.set(layer.id, null);
            loadQgisMetadata(layer.url).then((data) => {
                qgisCache.set(layer.id, data);

                if (store.state.activeLayerId === layer.id) {
                    render();
                }
            });
        }
    };

    /* Só redesenha com o painel à vista: a busca dispara "view" a cada tecla. */
    const refresh = () => {
        if (isVisible()) {
            render();
        }
    };

    store.on("layers", refresh);
    store.on("active", refresh);
    store.on("view", refresh);

    return { render };
}
