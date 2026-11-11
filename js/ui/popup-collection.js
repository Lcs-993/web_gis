/* ============================================================
   POP-UP DE REGISTRO DE CAMPO (coletas)

   Cartão largo para pontos de coleta — pragas, doenças, daninhas,
   amostras de qualidade, condição da lavoura… —, ligado por
   popup.template = "coleta" em js/config.js. popup.fields diz qual
   atributo do arquivo faz cada papel; atributo ausente ou vazio
   simplesmente não aparece.

   Cabeçalho: ícone do tipo (na cor do tema no mapa), "TIPO ·
   CÓDIGO", o alvo como título, fazenda e talhão, e o status.
   Abas (alternam o conteúdo):
   - Informações: Localização, Dados da coleta e Ações rápidas à
     esquerda; a foto principal com galeria à direita.
   - Fotos e anexos: todas as imagens (clique amplia).
   - Histórico: coleta, fotos anexadas e última atualização.
   - Relacionamentos: fazenda, talhão (com "Mostrar talhão", que
     enquadra o polígono relacionado) e campanha.
   O ponto já fica centralizado no mapa ao abrir (js/main.js), por
   isso não há "Ver no mapa" nas ações.
   Rodapé: quem atualizou e quando; "Ver mais detalhes" abre a
   lista completa de atributos.

   Fotos ampliadas numa visualização em tela cheia (Esc fecha,
   setas trocam).
   ============================================================ */

import { el } from "./dom.js";
import { formatValue } from "./format.js";
import { getAttribute, isEmpty, normalizeText, toTime } from "../data/values.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/* Traços 24×24 (herdam currentColor). */
const PATHS = {
    pragas: "M9 7.5a3 3 0 0 1 6 0M8 11a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0v-3ZM12 11v7M4 10l4 2M20 10l-4 2M4 18l4-2M20 18l-4-2M10 5 8.5 3M14 5l1.5-2",
    doencas: "M5 19c0-8 5-14 14-14 0 9-6 14-14 14ZM5 19l7-7M10.5 9.5h.01M14 13h.01M15.5 9h.01",
    daninhas: "M12 21v-8M12 13c0-4-3-6-7-6 0 4 3 6 7 6ZM12 15c0-4 3-7 7-7 0 4-3 7-7 7Z",
    qualidade: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 14h9",
    lavoura: "M3 20h18M6 20c0-6 1-10 3-13M10 20c0-5 1-9 4-12M15 20c0-4 1-7 4-9",
    ponto: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01",
    foto: "M4 7h3l2-2h6l2 2h3v12H4V7ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    historico: "M12 21a9 9 0 1 0-9-9M3 12l-1-2M3 12l2-1.5M12 7v5l3 2",
    relacao: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    local: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    coleta: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3",
    acoes: "M13 3 5 14h6l-1 7 8-11h-6l1-7Z",
    ampliar: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16 16l4.5 4.5M11 8v6M8 11h6",
    mapa: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14",
    tabela: "M4 5.5h16v13H4zM4 10h16M4 14.5h16M10 10v8.5",
    telaCheia: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    copiar: "M9 9h11v11H9zM5 15H4V4h11v1",
    anterior: "M15 5l-7 7 7 7",
    proxima: "M9 5l7 7-7 7",
    fechar: "M7 7l10 10M17 7 7 17",
    relogio: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
    detalhes: "M6 9l6 6 6-6"
};

const icon = (name, className = "collection-svg") => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const path = document.createElementNS(SVG_NS, "path");

    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", PATHS[name] || PATHS.ponto);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);

    return svg;
};

/* "Plantas daninhas" → daninhas; "Condição da lavoura" → lavoura… */
const typeIcon = (type) => {
    const text = normalizeText(type || "");

    if (text.includes("praga")) {
        return "pragas";
    }

    if (text.includes("doen")) {
        return "doencas";
    }

    if (text.includes("daninh")) {
        return "daninhas";
    }

    if (text.includes("qualidade") || text.includes("amostra")) {
        return "qualidade";
    }

    if (text.includes("lavoura") || text.includes("condi")) {
        return "lavoura";
    }

    return "ponto";
};

/* Tom do selo pelo texto: nível de infestação ou status. */
const tone = (value) => {
    const text = normalizeText(value || "");

    if (/alto|alta|critic|severo/.test(text)) {
        return "danger";
    }

    if (/moderad|medio|media|analise|andamento|pendente/.test(text)) {
        return "warning";
    }

    if (/baixo|baixa|conclu|aprovad|ok/.test(text)) {
        return "success";
    }

    return "info";
};

const pad2 = (n) => String(n).padStart(2, "0");

/* ISO → "14/11/2026 · 09:32" (só a data, se não houver hora). */
const dateTime = (value, joiner = " · ") => {
    const time = toTime(value);

    if (time === null) {
        return isEmpty(value) ? "" : String(value);
    }

    const date = new Date(time);
    const day = date.toLocaleDateString("pt-BR");
    const hasTime = /[tT ]\d{2}:\d{2}/.test(String(value));

    return hasTime ? `${day}${joiner}${pad2(date.getHours())}:${pad2(date.getMinutes())}` : day;
};

const fileName = (url) => decodeURIComponent(String(url).split(/[\\/]/).pop() || url);


/* ---------------- visualização ampliada (tela cheia) ---------------- */

function openLightbox(photos, start, { caption }) {
    let index = start;
    const opener = document.activeElement;
    const image = el("img", { class: "photo-lightbox-image", alt: "" });
    const label = el("figcaption", { class: "photo-lightbox-caption" });
    const counter = el("span", { class: "photo-lightbox-counter" });

    const show = (next) => {
        index = (next + photos.length) % photos.length;
        image.src = photos[index];
        image.alt = caption(index);
        label.textContent = caption(index);
        counter.textContent = `${pad2(index + 1)} / ${pad2(photos.length)}`;
    };

    const navButton = (dir) => el("button", {
        type: "button",
        class: `photo-lightbox-arrow is-${dir < 0 ? "prev" : "next"}`,
        "aria-label": dir < 0 ? "Foto anterior" : "Próxima foto",
        onclick: (event) => {
            event.stopPropagation();
            show(index + dir);
        }
    }, [icon(dir < 0 ? "anterior" : "proxima")]);

    const closeButton = el("button", {
        type: "button",
        class: "photo-lightbox-close",
        "aria-label": "Fechar visualização",
        title: "Fechar (Esc)",
        onclick: () => close()
    }, [icon("fechar")]);

    const overlay = el("div", {
        class: "photo-lightbox",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Fotografia ampliada",
        onclick: (event) => {
            if (event.target === overlay) {
                close();
            }
        }
    }, [
        closeButton,
        photos.length > 1 ? navButton(-1) : null,
        el("figure", { class: "photo-lightbox-figure" }, [image, el("div", { class: "photo-lightbox-bar" }, [label, counter])]),
        photos.length > 1 ? navButton(1) : null
    ]);

    /* Captura: o Esc fecha só a foto, não o cartão nem os painéis. */
    const onKey = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
        } else if (event.key === "ArrowLeft" && photos.length > 1) {
            event.preventDefault();
            show(index - 1);
        } else if (event.key === "ArrowRight" && photos.length > 1) {
            event.preventDefault();
            show(index + 1);
        } else if (event.key === "Tab") {
            /* Foco preso na visualização. */
            const items = [...overlay.querySelectorAll("button")];
            const first = items[0];
            const last = items[items.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    };

    function close() {
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("webgis:close-popups", close);
        overlay.remove();

        if (opener && opener.isConnected) {
            opener.focus({ preventScroll: true });
        }
    }

    show(index);
    document.addEventListener("keydown", onKey, true);
    /* A tabela abriu (ou outro pedido de fechar os pop-ups): a foto ampliada fecha junto. */
    document.addEventListener("webgis:close-popups", close);
    document.body.appendChild(overlay);
    closeButton.focus();
}


/* ---------------- pop-up ---------------- */

let popupCounter = 0;

/*
   related: { count, onLocate } do polígono relacionado (ou null).
   onShowInTable: como no pop-up padrão (ou null).
*/
export function buildCollectionPopup(layer, feature, { onShowInTable = null, related = null } = {}) {
    const fields = (layer.popup && layer.popup.fields) || {};
    const attributeOf = (role) => layer.schema.attributes.find((attribute) => attribute.name === fields[role]) || null;
    const raw = (role) => (fields[role] ? getAttribute(feature, fields[role]) : null);
    const has = (role) => !isEmpty(raw(role));
    const text = (role) => {
        const attribute = attributeOf(role);

        return has(role) ? (attribute ? formatValue(raw(role), attribute) : String(raw(role))) : "";
    };

    const id = `collection-${++popupCounter}`;
    const type = text("type");
    const target = text("target");
    const photos = has("photos")
        ? String(raw("photos")).split(";").map((url) => url.trim()).filter(Boolean)
        : [];
    const caption = (index) => `Evidência fotográfica · Foto ${pad2(index + 1)}${type ? ` · ${type}` : ""}`;
    const zoomTo = (index) => openLightbox(photos, index, { caption });

    /* Cor do tipo: a mesma do ponto no mapa (tema), senão a da camada. */
    const typeColor = (() => {
        const legend = layer.theme && layer.theme.visible ? layer.theme.legend : null;
        const item = legend && legend.field === fields.type
            ? legend.classes.find((entry) => String(entry.key) === String(raw("type")))
            : null;

        return item ? item.color : layer.color;
    })();

    /* ---- cabeçalho ---- */
    const badge = el("span", { class: "collection-icon", "aria-hidden": "true" }, [icon(typeIcon(type))]);

    badge.style.setProperty("--type-color", typeColor);

    const place = [has("farm") ? `Fazenda ${text("farm")}` : "", has("plot") ? `Talhão ${text("plot")}` : ""]
        .filter(Boolean).join(" · ");

    const header = el("header", { class: "collection-header" }, [
        badge,
        el("div", { class: "collection-heading" }, [
            el("p", { class: "collection-eyebrow", text: [type || "Registro de campo", text("code")].filter(Boolean).join(" · ") }),
            el("h3", { class: "collection-title", text: target || type || "Ponto de coleta" }),
            place ? el("p", { class: "collection-subtitle", text: place }) : null
        ]),
        has("status")
            ? el("span", { class: `collection-status is-${tone(text("status"))}` }, [el("i", { "aria-hidden": "true" }), text("status")])
            : null
    ]);

    /* ---- peças ---- */
    const field = (label, value, { stacked = false, extra = null } = {}) => value
        ? el("div", { class: `collection-field${stacked ? " is-stacked" : ""}` }, [
            el("span", { class: "collection-field-label", text: label }),
            el("strong", { class: "collection-field-value" }, [value, extra])
        ])
        : null;

    const tag = (value, kind) => el("em", { class: `collection-tag is-${kind}`, text: value });

    const card = (iconName, title, children, kicker = null) => el("article", { class: "collection-card" }, [
        el("div", { class: "collection-card-heading" }, [
            el("span", { class: "collection-card-icon" }, [icon(iconName)]),
            el("h4", { text: title }),
            kicker ? el("span", { class: "collection-card-kicker", text: kicker }) : null
        ]),
        ...children
    ]);

    const button = (label, iconName, handler, variant = "secondary") => el("button", {
        type: "button",
        class: `collection-button is-${variant}`,
        onclick: handler
    }, [icon(iconName), el("span", { text: label })]);

    /* Coordenadas do ponto (lat, lon), com cópia. */
    const coordinates = feature.geometry && feature.geometry.type === "Point"
        ? feature.geometry.coordinates
        : null;
    const coordText = coordinates ? `${coordinates[1].toFixed(6)}, ${coordinates[0].toFixed(6)}` : "";
    const copyButton = coordinates
        ? el("button", {
            type: "button",
            class: "collection-copy",
            title: "Copiar coordenadas",
            "aria-label": "Copiar coordenadas",
            onclick: async (event) => {
                const node = event.currentTarget;

                try {
                    await navigator.clipboard.writeText(coordText);
                    node.classList.add("is-done");
                    node.title = "Copiado";
                    setTimeout(() => {
                        node.classList.remove("is-done");
                        node.title = "Copiar coordenadas";
                    }, 1400);
                } catch {
                    /* Sem área de transferência: o texto continua selecionável. */
                }
            }
        }, [icon("copiar")])
        : null;

    /* ---- foto principal com galeria ---- */
    let photoIndex = 0;
    let photoColumn;

    if (photos.length) {
        const main = el("img", { class: "collection-photo-image", alt: caption(0), src: photos[0], loading: "lazy" });
        const counter = el("span", { class: "collection-photo-counter" });
        const photoCaption = el("span", { class: "collection-photo-caption" });
        const thumbs = photos.map((url, index) => el("button", {
            type: "button",
            class: "collection-thumb",
            "aria-label": `Ver foto ${index + 1}`,
            onclick: () => showPhoto(index)
        }, [el("img", { src: url, alt: "", loading: "lazy" })]));

        const showPhoto = (index) => {
            photoIndex = (index + photos.length) % photos.length;
            main.src = photos[photoIndex];
            main.alt = caption(photoIndex);
            photoCaption.textContent = caption(photoIndex);
            counter.textContent = `${pad2(photoIndex + 1)} / ${pad2(photos.length)}`;
            thumbs.forEach((thumb, i) => thumb.setAttribute("aria-current", String(i === photoIndex)));
        };

        const arrow = (dir) => el("button", {
            type: "button",
            class: `collection-photo-arrow is-${dir < 0 ? "prev" : "next"}`,
            "aria-label": dir < 0 ? "Foto anterior" : "Próxima foto",
            onclick: () => showPhoto(photoIndex + dir)
        }, [icon(dir < 0 ? "anterior" : "proxima")]);

        photoColumn = el("section", { class: "collection-photo", "aria-label": "Imagem da coleta" }, [
            el("div", { class: "collection-card-heading" }, [
                el("span", { class: "collection-card-icon" }, [icon("foto")]),
                el("h4", { text: "Imagem da coleta" }),
                counter,
                el("button", {
                    type: "button",
                    class: "collection-button is-outline is-small",
                    onclick: () => zoomTo(photoIndex)
                }, [icon("telaCheia"), el("span", { text: "Tela cheia" })])
            ]),
            el("div", { class: "collection-photo-frame" }, [
                el("button", {
                    type: "button",
                    class: "collection-photo-open",
                    "aria-label": "Ampliar foto",
                    onclick: () => zoomTo(photoIndex)
                }, [main]),
                photos.length > 1 ? arrow(-1) : null,
                photos.length > 1 ? arrow(1) : null,
                photoCaption
            ]),
            photos.length > 1 ? el("div", { class: "collection-thumbs" }, thumbs) : null,
            el("p", { class: "collection-photo-meta" }, [
                el("span", {}, [el("i", { "aria-hidden": "true" }), "Imagem vinculada ao ponto"]),
                el("span", { text: `${photos.length} ${photos.length === 1 ? "arquivo" : "arquivos"}` })
            ])
        ]);

        showPhoto(0);
    } else {
        photoColumn = el("section", { class: "collection-photo is-empty", "aria-label": "Imagem da coleta" }, [
            icon("foto", "collection-empty-icon"),
            el("p", { text: "Nenhuma foto vinculada a esta coleta." })
        ]);
    }

    /* ---- painéis ---- */
    const levelTag = has("level") ? tag(text("level"), tone(text("level"))) : null;

    const informacoes = el("div", { class: "collection-columns" }, [
        el("div", { class: "collection-stack" }, [
            card("local", "Localização", [
                field("Fazenda", text("farm")),
                field("Talhão", text("plot")),
                field("Coordenadas (lat, lon)", coordText, { stacked: true, extra: copyButton })
            ].filter(Boolean), "Ponto amostral"),
            card("coleta", "Dados da coleta", [
                field("Data da coleta", dateTime(raw("date"))),
                field("Responsável", text("by")),
                target ? field(type ? `Alvo (${type.toLowerCase()})` : "Alvo", tag(target, "accent")) : null,
                levelTag ? field("Nível", levelTag) : null,
                field("Resultado", text("result")),
                field("Observações", text("notes"), { stacked: true })
            ].filter(Boolean)),
            card("acoes", "Ações rápidas", [
                el("div", { class: "collection-actions" }, [
                    photos.length ? button("Ampliar foto", "ampliar", () => zoomTo(photoIndex), "primary") : null,
                    onShowInTable ? button("Ver na tabela", "tabela", onShowInTable) : null
                ])
            ])
        ]),
        photoColumn
    ]);

    const fotos = photos.length
        ? el("div", { class: "collection-attachments" }, photos.map((url, index) => el("button", {
            type: "button",
            class: "collection-attachment",
            onclick: () => zoomTo(index)
        }, [
            el("img", { src: url, alt: "", loading: "lazy" }),
            el("span", { class: "collection-attachment-name", text: index === 0 ? "Foto principal" : `Foto ${index + 1}` }),
            el("span", { class: "collection-attachment-file", text: fileName(url) })
        ])))
        : el("p", { class: "collection-empty", text: "Nenhuma foto ou anexo vinculado." });

    const events = [
        has("date") ? { title: "Coleta registrada", detail: [dateTime(raw("date"), " às "), text("by")].filter(Boolean).join(" · "), time: toTime(raw("date")) } : null,
        photos.length ? { title: "Fotografias anexadas", detail: [dateTime(raw("date"), " às "), `${photos.length} ${photos.length === 1 ? "arquivo" : "arquivos"}`].filter(Boolean).join(" · "), time: (toTime(raw("date")) ?? 0) + 60000 } : null,
        has("updated") ? { title: has("status") ? `Status: ${text("status")}` : "Registro atualizado", detail: [dateTime(raw("updated"), " às "), text("updatedBy")].filter(Boolean).join(" · "), time: toTime(raw("updated")) } : null
    ].filter(Boolean).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

    const historico = events.length
        ? el("ol", { class: "collection-timeline" }, events.map((event) => el("li", {}, [
            el("i", { "aria-hidden": "true" }),
            el("div", {}, [el("strong", { text: event.title }), el("span", { text: event.detail })])
        ])))
        : el("p", { class: "collection-empty", text: "Sem eventos registrados." });

    const relation = (label, value, kind, action = null) => value
        ? el("div", { class: "collection-relation" }, [
            el("div", {}, [
                el("span", { class: "collection-field-label", text: label }),
                el("strong", { text: value }),
                el("small", { text: kind })
            ]),
            action
        ])
        : null;

    const relacionamentos = el("div", { class: "collection-relations" }, [
        relation("Fazenda", text("farm"), "Entidade territorial"),
        relation("Talhão", text("plot"), related && related.count ? "Polígono associado" : "Polígono não encontrado na camada de talhões",
            related && related.count ? button("Mostrar talhão", "mapa", related.onLocate) : null),
        relation("Campanha", text("campaign"), "Atividade operacional")
    ].filter(Boolean));

    /* Todos os atributos (Ver mais detalhes). */
    const allAttributes = el("dl", { class: "collection-all" }, layer.schema.attributes
        .filter((attribute) => attribute.role !== "empty" && attribute.name !== fields.photos)
        .map((attribute) => {
            const value = getAttribute(feature, attribute.name);

            return el("div", { class: "collection-all-row" }, [
                el("dt", { text: attribute.name }),
                el("dd", { text: isEmpty(value) ? "—" : formatValue(value, attribute) })
            ]);
        }));

    const TABS = [
        ["informacoes", "Informações", "info", informacoes, null],
        ["fotos", "Fotos e anexos", "foto", fotos, photos.length || null],
        ["historico", "Histórico", "historico", historico, null],
        ["relacionamentos", "Relacionamentos", "relacao", relacionamentos, null],
        ["detalhes", "Todos os atributos", "detalhes", allAttributes, null]
    ];

    const panels = TABS.map(([key, title, , content]) => el("div", {
        class: "collection-panel",
        id: `${id}-${key}`,
        role: "tabpanel",
        "aria-label": title,
        hidden: true
    }, [content]));

    const scroller = el("div", { class: "collection-panels" }, panels);

    /* Abas visíveis (a de detalhes só abre pelo rodapé). */
    const tabs = TABS.slice(0, 4).map(([key, title, iconName, , count], index) => el("button", {
        type: "button",
        class: "collection-tab",
        role: "tab",
        id: `${id}-tab-${key}`,
        "aria-controls": `${id}-${key}`,
        tabindex: index === 0 ? "0" : "-1",
        onclick: () => select(index),
        onkeydown: (event) => {
            const moves = { ArrowRight: 1, ArrowLeft: -1 };

            if (moves[event.key]) {
                event.preventDefault();

                const next = (index + moves[event.key] + 4) % 4;

                select(next);
                tabs[next].focus();
            }
        }
    }, [
        icon(iconName),
        el("span", { text: title }),
        count ? el("span", { class: "collection-tab-count", text: String(count) }) : null
    ]));

    const detailsButton = el("button", {
        type: "button",
        class: "collection-button is-secondary is-small",
        "aria-expanded": "false",
        onclick: () => select(current === 4 ? 0 : 4)
    }, [el("span", { text: "Ver mais detalhes" }), icon("detalhes")]);

    let current = 0;

    function select(index) {
        current = index;
        panels.forEach((panel, i) => {
            panel.hidden = i !== index;
        });
        tabs.forEach((tab, i) => {
            tab.setAttribute("aria-selected", String(i === index));
            tab.tabIndex = i === index || (index === 4 && i === 0) ? 0 : -1;
        });
        detailsButton.setAttribute("aria-expanded", String(index === 4));
        detailsButton.querySelector("span").textContent = index === 4 ? "Menos detalhes" : "Ver mais detalhes";
        scroller.scrollTop = 0;
    }

    select(0);

    const footer = el("footer", { class: "collection-footer" }, [
        has("updated") || has("updatedBy")
            ? el("span", { class: "collection-updated" }, [
                icon("relogio"),
                ["Atualizado", has("updated") ? `em ${dateTime(raw("updated"), " às ")}` : "", has("updatedBy") ? `por ${text("updatedBy")}` : ""]
                    .filter(Boolean).join(" ")
            ])
            : el("span"),
        detailsButton
    ]);

    return el("div", { class: "collection-popup" }, [
        header,
        el("nav", { class: "collection-tabs", role: "tablist", "aria-label": "Seções do registro" }, tabs),
        scroller,
        footer
    ]);
}
