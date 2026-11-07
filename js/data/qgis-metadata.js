/* ============================================================
   METADADOS DO QGIS (.qmd)

   O QGIS grava os metadados de uma camada num XML ".qmd" ao lado
   do arquivo de dados (ex.: geojson/pol_talhoes.qmd). Aqui ele é
   lido e reduzido ao que interessa mostrar: título, resumo,
   palavras-chave, contato, idioma, links e o CRS de origem.

   Opcional: sem o arquivo (404, arquivo local, erro de rede),
   devolve null e a janela da camada mostra só o que o GeoJSON tem.
   ============================================================ */

const text = (node) => (node && node.textContent ? node.textContent.trim() : "");

/* Primeiro filho direto com esse nome (o .qmd repete nomes em níveis diferentes). */
const child = (parent, name) =>
    parent ? Array.from(parent.children).find((node) => node.localName === name) || null : null;

export function parseQgisMetadata(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const root = doc.documentElement;

    if (!root || root.localName !== "qgis" || doc.getElementsByTagName("parsererror").length) {
        return null;
    }

    const contactNode = child(root, "contact");
    const contact = contactNode
        ? ["name", "position", "organization", "voice", "email"]
            .map((name) => text(child(contactNode, name)))
            .filter(Boolean)
            .join(" · ")
        : "";

    const keywords = Array.from(root.getElementsByTagName("keyword"))
        .map(text)
        .filter(Boolean);

    const links = Array.from(root.getElementsByTagName("link"))
        .map((node) => ({ name: node.getAttribute("name") || "", url: node.getAttribute("url") || "" }))
        .filter((link) => link.url);

    const srs = root.getElementsByTagName("spatialrefsys")[0];
    const crsName = text(child(srs, "description"));
    const crsId = text(child(srs, "authid"));

    const metadata = {
        title: text(child(root, "title")),
        abstract: text(child(root, "abstract")),
        keywords,
        contact,
        language: text(child(root, "language")),
        links,
        crs: crsName || crsId ? [crsName, crsId].filter(Boolean).join(" · ") : ""
    };

    const hasContent = Object.values(metadata).some((value) => (Array.isArray(value) ? value.length : value));

    return hasContent ? metadata : null;
}

/* "geojson/pol_talhoes.geojson" → "geojson/pol_talhoes.qmd" (null se não for .geojson/.json). */
export const metadataUrlFor = (url) =>
    url && /\.(geo)?json(\?.*)?$/i.test(url) ? url.replace(/\.(geo)?json(\?.*)?$/i, ".qmd") : null;

export async function loadQgisMetadata(url) {
    const metadataUrl = metadataUrlFor(url);

    if (!metadataUrl) {
        return null;
    }

    try {
        const response = await fetch(metadataUrl);

        return response.ok ? parseQgisMetadata(await response.text()) : null;
    } catch (error) {
        return null;
    }
}
