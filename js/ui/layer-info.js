/* ============================================================
   INFORMAÇÃO E CAMPOS DE UMA CAMADA

   Conteúdo das abas Informação e Campos da janela de Propriedades
   (js/ui/layer-properties.js), para qualquer camada:

   Informação: resumo (feições, geometria, origem, CRS, extensão)
   e metadados (descrição do GeoJSON + .qmd do QGIS).
   Campos: os atributos descobertos no schema, com tipo e quantos
   valores preenchidos.
   ============================================================ */

import { el } from "./dom.js";
import { formatCount, formatNumber, roleLabel } from "./format.js";
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

export function createLayerInfo() {
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
    const buildMetadata = (layer, qgis) => {
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

        return rows.length
            ? el("section", { class: "layer-info-meta", "aria-label": "Metadados" }, [
                el("h3", { class: "settings-title", text: "Metadados" }),
                el("dl", { class: "layer-info-meta-list" }, rows)
            ])
            : null;
    };

    /*
       Aba Informação. onUpdate é chamado quando o .qmd do QGIS chega
       (buscado uma vez por camada), para a aba se redesenhar.
    */
    const buildInfo = (layer, onUpdate) => {
        const metadata = layer.metadata || {};
        const qgis = qgisCache.get(layer.id) || null;

        if (layer.source === "url" && !qgisCache.has(layer.id)) {
            qgisCache.set(layer.id, null);
            loadQgisMetadata(layer.url).then((data) => {
                qgisCache.set(layer.id, data);

                if (data && onUpdate) {
                    onUpdate(layer.id);
                }
            });
        }

        return [
            el("dl", { class: "layer-info-summary" }, [
                item("Feições", formatCount(layer.features.length)),
                item("Visíveis com filtros", formatCount(layer.view.filtered.length)),
                item("Atributos", formatCount(layer.schema.attributes.length)),
                item("Origem", sourceText(layer)),
                wide("Geometria", geometryText(layer)),
                /* Como o mapa lê os dados; o CRS de origem (QGIS) só se for outro. */
                wide("Sistema de coordenadas", metadata.crs || "—"),
                ...(qgis && qgis.crs && qgis.crs !== metadata.crs ? [wide("CRS de origem (QGIS)", qgis.crs)] : []),
                wide("Extensão", bboxText(metadata.bbox))
            ]),
            buildMetadata(layer, qgis)
        ];
    };

    /* Aba Campos: atributo, tipo e percentual preenchido. */
    const buildFields = (layer) => {
        const total = layer.features.length;

        const rows = layer.schema.attributes.map((attribute) =>
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

        return [
            el("p", {
                class: "panel-summary",
                text: `${formatCount(layer.schema.attributes.length)} atributos em ${formatCount(total)} feições`
            }),
            el("div", { class: "layer-info-table-scroll" }, el("table", { class: "data-table layer-info-table" }, [
                el("thead", {}, el("tr", {}, [
                    el("th", { scope: "col", text: "Atributo" }),
                    el("th", { scope: "col", text: "Tipo" }),
                    el("th", { scope: "col", text: "Preenchidos" })
                ])),
                el("tbody", {}, rows)
            ]))
        ];
    };

    return { buildInfo, buildFields };
}
