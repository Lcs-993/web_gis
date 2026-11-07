/* ============================================================
   EXPORTAÇÃO KML

   Gera um KML do jeito que a camada aparece no mapa:
   - só as feições consideradas (filtros e busca aplicados);
   - cores do tema por categoria, ou a cor da camada;
   - com tema, uma pasta por categoria (vira a legenda no Google
     Earth), na mesma ordem e com as mesmas cores do mapa;
   - camadas "outline" (ex.: Fazendas) saem só com contorno;
   - todos os atributos em <ExtendedData> (QGIS) e num balão HTML
     legível (Google Earth): título, faixa na cor da feição e tabela.

   Puro (sem DOM): recebe dados, devolve o texto do KML.
   ============================================================ */

import { getAttribute, isEmpty } from "./values.js";

const escapeXml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/* "#rrggbb" + opacidade (0–1) → "aabbggrr" (ordem do KML). */
const kmlColor = (hex, alpha = 1) => {
    const clean = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    const rgb = clean ? clean[1].toLowerCase() : "ffffff";
    const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");

    return `${a}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`;
};

const styleId = (hex) => `c_${String(hex || "ffffff").replace("#", "").toLowerCase()}`;


/* ---------------- geometria ---------------- */

const coordinates = (points) => points.map(([lon, lat]) => `${lon},${lat}`).join(" ");

const ring = (points) => `<LinearRing><coordinates>${coordinates(points)}</coordinates></LinearRing>`;

const polygon = (rings) => {
    const [outer, ...holes] = rings;

    return `<Polygon><outerBoundaryIs>${ring(outer)}</outerBoundaryIs>${
        holes.map((hole) => `<innerBoundaryIs>${ring(hole)}</innerBoundaryIs>`).join("")
    }</Polygon>`;
};

function geometryToKml(geometry) {
    if (!geometry) {
        return "";
    }

    const { type, coordinates: c } = geometry;

    switch (type) {
        case "Point":
            return `<Point><coordinates>${c[0]},${c[1]}</coordinates></Point>`;
        case "MultiPoint":
            return `<MultiGeometry>${c.map((point) => `<Point><coordinates>${point[0]},${point[1]}</coordinates></Point>`).join("")}</MultiGeometry>`;
        case "LineString":
            return `<LineString><tessellate>1</tessellate><coordinates>${coordinates(c)}</coordinates></LineString>`;
        case "MultiLineString":
            return `<MultiGeometry>${c.map((line) => `<LineString><tessellate>1</tessellate><coordinates>${coordinates(line)}</coordinates></LineString>`).join("")}</MultiGeometry>`;
        case "Polygon":
            return polygon(c);
        case "MultiPolygon":
            return `<MultiGeometry>${c.map(polygon).join("")}</MultiGeometry>`;
        case "GeometryCollection":
            return `<MultiGeometry>${(geometry.geometries || []).map(geometryToKml).join("")}</MultiGeometry>`;
        default:
            return "";
    }
}


/* ---------------- estilos ---------------- */

/*
   Um estilo por cor. Preenchimento mais opaco que no mapa (sobre
   o satélite do Google Earth, 0,10 some); com tema, igual ao mapa.
*/
function styleXml(hex, { outline, themed }) {
    const fillAlpha = outline ? 0 : themed ? 0.55 : 0.35;

    /* Balão: só a descrição HTML de cada feição (sem os links "Rotas" do Google Earth). */
    return `<Style id="${styleId(hex)}">` +
        "<BalloonStyle><bgColor>ffffffff</bgColor><text><![CDATA[$[description]]]></text></BalloonStyle>" +
        `<LineStyle><color>${kmlColor(hex, 1)}</color><width>${outline ? 2 : 1.5}</width></LineStyle>` +
        `<PolyStyle><color>${kmlColor(hex, fillAlpha)}</color><fill>${outline ? 0 : 1}</fill><outline>1</outline></PolyStyle>` +
        `<IconStyle><color>${kmlColor(hex, 1)}</color><scale>1</scale>` +
        "<Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>" +
        "</Style>";
}


/* ---------------- balão (popup) ---------------- */

/*
   HTML do balão, no visual do popup do app: cabeçalho escuro com
   faixa na cor da feição, título em branco e camada em verde-claro;
   atributos em "cartão" (nome do campo pequeno em verde, valor
   embaixo), linhas alternadas e rodapé discreto.

   Feito para o navegador antigo do Google Earth Pro (e o Earth Web):
   só tabelas, atributos cellpadding/cellspacing/bgcolor e estilos
   inline; nada de <style>, flex, border-radius ou border-collapse,
   que ele ignora ou desenha errado. Fundo sempre nas <td>.
*/
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BALLOON_WIDTH = 320;

function balloonHtml({ title, subtitle, color, rows, exportedAt }) {
    const accent = /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#50ab46";

    const body = rows.map(([label, value], index) => {
        const bg = index % 2 ? "#f4f6f3" : "#ffffff";

        return `<tr><td bgcolor="${bg}" style="padding:7px 14px;border-bottom:1px solid #e6e9e4">` +
            `<div style="${FONT};color:#4e8a3c;font-size:10px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase">${escapeXml(label)}</div>` +
            `<div style="${FONT};color:#1d1d1f;font-size:13px;font-weight:600;padding-top:1px">${escapeXml(value)}</div>` +
            "</td></tr>";
    }).join("");

    return `<table width="${BALLOON_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="${FONT};width:${BALLOON_WIDTH}px">` +
        /* Faixa na cor da feição (mesma cor do polígono/legenda). */
        `<tr><td bgcolor="${accent}" height="5" style="height:5px;font-size:0;line-height:0">&nbsp;</td></tr>` +
        `<tr><td bgcolor="#2a2d29" style="padding:11px 14px 10px">` +
        (subtitle ? `<div style="${FONT};color:#9acd83;font-size:10px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase">${escapeXml(subtitle)}</div>` : "") +
        `<div style="${FONT};color:#ffffff;font-size:16px;font-weight:bold;padding-top:2px">${escapeXml(title)}</div>` +
        "</td></tr>" +
        (body || `<tr><td style="padding:10px 14px;${FONT};color:#8e8e93;font-size:12px">Sem atributos.</td></tr>`) +
        `<tr><td bgcolor="#ffffff" style="padding:8px 14px 2px;${FONT};color:#a1a6a0;font-size:10px">` +
        `Exportado do WebGIS${exportedAt ? ` · ${escapeXml(exportedAt)}` : ""}</td></tr>` +
        "</table>";
}


/* ---------------- documento ---------------- */

/*
   groups: [{ name, items: [{ feature, color }] }] — uma pasta por
   grupo (com tema: uma por categoria; sem tema: uma só).
   attributes: atributos exportados (schema), na ordem da tabela.
   nameFields: atributos do rótulo do mapa; viram o nome do
   Placemark, unidos por " · " (o nome do KML é de uma linha só).
*/
export function toKml({
    documentName, groups, attributes, nameFields = [], outline = false, themed = false,
    /* Formata o valor para o balão (o ExtendedData leva o valor bruto). */
    formatValue = (value) => String(value),
    exportedAt = ""
}) {
    const colors = new Set();

    groups.forEach((group) => group.items.forEach((item) => colors.add(item.color)));

    const placemark = ({ feature, color }) => {
        const nameValue = nameFields
            .map((field) => getAttribute(feature, field))
            .filter((value) => !isEmpty(value))
            .join(" · ");
        const data = attributes
            .map((attribute) => {
                const value = getAttribute(feature, attribute.name);

                return isEmpty(value)
                    ? ""
                    : `<Data name="${escapeXml(attribute.name)}"><value>${escapeXml(value)}</value></Data>`;
            })
            .join("");

        const rows = attributes
            .map((attribute) => [attribute, getAttribute(feature, attribute.name)])
            .filter(([, value]) => !isEmpty(value))
            .map(([attribute, value]) => [attribute.name, formatValue(value, attribute)]);
        const description = balloonHtml({
            title: isEmpty(nameValue) ? documentName : nameValue,
            subtitle: isEmpty(nameValue) ? "" : documentName,
            color,
            rows,
            exportedAt
        });

        return "<Placemark>" +
            (isEmpty(nameValue) ? "" : `<name>${escapeXml(nameValue)}</name>`) +
            /* CDATA: "]]>" dentro do HTML fecharia o bloco antes da hora. */
            `<description><![CDATA[${description.replace(/]]>/g, "]]&gt;")}]]></description>` +
            `<styleUrl>#${styleId(color)}</styleUrl>` +
            (data ? `<ExtendedData>${data}</ExtendedData>` : "") +
            geometryToKml(feature.geometry) +
            "</Placemark>";
    };

    const folders = groups.map((group) =>
        `<Folder><name>${escapeXml(group.name)}</name>\n${group.items.map(placemark).join("\n")}\n</Folder>`
    );

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        "<Document>",
        `<name>${escapeXml(documentName)}</name>`,
        ...Array.from(colors, (hex) => styleXml(hex, { outline, themed })),
        ...folders,
        "</Document>",
        "</kml>",
        ""
    ].join("\n");
}
