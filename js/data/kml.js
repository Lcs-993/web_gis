/* ============================================================
   KML → GeoJSON

   Converte um documento KML (Google Earth, QGIS, ArcGIS) em um
   FeatureCollection, para seguir pelo mesmo caminho do GeoJSON
   (schema, filtros, dashboard). Nenhum atributo é fixo: as
   propriedades vêm do próprio arquivo.

   - Feição: cada <Placemark>, em qualquer nível de <Folder>.
   - Propriedades: "name" e "description" (HTML reduzido a texto)
     quando existem, mais todos os campos de <ExtendedData>
     (<Data name><value> e <SchemaData><SimpleData name>).
   - Geometrias: Point, LineString, LinearRing (como Polygon),
     Polygon com furos, MultiGeometry e gx:Track / gx:MultiTrack.
     Altitude é descartada (o mapa é 2D).
   - Estilos (<Style>, ícones) são ignorados: a simbologia é a da
     camada no painel.

   Usa só a API DOM padrão, sem bibliotecas.
   ============================================================ */

/* Filhos-elemento de um nó, pelo nome local (ignora prefixos como gx:). */
const children = (node, name) => {
    const result = [];

    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1 && (!name || child.localName === name)) {
            result.push(child);
        }
    }

    return result;
};

const child = (node, name) => children(node, name)[0] || null;

const text = (node) => (node ? String(node.textContent || "").trim() : "");

/* Descendentes por nome local, em ordem de documento. */
const descendants = (node, name, found = []) => {
    children(node).forEach((element) => {
        if (element.localName === name) {
            found.push(element);
        }

        descendants(element, name, found);
    });

    return found;
};


/* ---------------- coordenadas ---------------- */

/* "lon,lat[,alt] lon,lat[,alt] …" → [[lon, lat], …] */
const parseCoordinates = (value) => {
    const points = [];

    String(value || "").trim().split(/\s+/).forEach((tuple) => {
        if (!tuple) {
            return;
        }

        const [lon, lat] = tuple.split(",").map(Number);

        if (Number.isFinite(lon) && Number.isFinite(lat)) {
            points.push([lon, lat]);
        }
    });

    return points;
};

const coordinatesOf = (node) => parseCoordinates(text(child(node, "coordinates")));

const closeRing = (ring) => {
    if (ring.length < 3) {
        return null;
    }

    const [firstLon, firstLat] = ring[0];
    const [lastLon, lastLat] = ring[ring.length - 1];

    return firstLon === lastLon && firstLat === lastLat ? ring : [...ring, ring[0]];
};

const ringOf = (boundary) => {
    const linearRing = boundary ? child(boundary, "LinearRing") : null;

    return linearRing ? closeRing(coordinatesOf(linearRing)) : null;
};


/* ---------------- geometrias ---------------- */

const GEOMETRY_TAGS = ["Point", "LineString", "LinearRing", "Polygon", "MultiGeometry", "Track", "MultiTrack"];

/* Lista de geometrias simples de um elemento (MultiGeometry vira várias). */
function parseGeometry(node) {
    switch (node.localName) {
        case "Point": {
            const [point] = coordinatesOf(node);

            return point ? [{ type: "Point", coordinates: point }] : [];
        }

        case "LineString": {
            const line = coordinatesOf(node);

            return line.length >= 2 ? [{ type: "LineString", coordinates: line }] : [];
        }

        case "LinearRing": {
            const ring = closeRing(coordinatesOf(node));

            return ring ? [{ type: "Polygon", coordinates: [ring] }] : [];
        }

        case "Polygon": {
            const outer = ringOf(child(node, "outerBoundaryIs"));

            if (!outer) {
                return [];
            }

            /* Um innerBoundaryIs pode ter um ou mais LinearRing. */
            const holes = children(node, "innerBoundaryIs")
                .flatMap((boundary) => children(boundary, "LinearRing"))
                .map((ring) => closeRing(coordinatesOf(ring)))
                .filter(Boolean);

            return [{ type: "Polygon", coordinates: [outer, ...holes] }];
        }

        case "Track": {
            /* gx:Track: um <gx:coord>"lon lat alt"</gx:coord> por instante. */
            const line = children(node, "coord")
                .map((coord) => text(coord).split(/\s+/).map(Number))
                .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
                .map(([lon, lat]) => [lon, lat]);

            return line.length >= 2 ? [{ type: "LineString", coordinates: line }] : [];
        }

        case "MultiTrack":
        case "MultiGeometry":
            return children(node)
                .filter((element) => GEOMETRY_TAGS.includes(element.localName))
                .flatMap(parseGeometry);

        default:
            return [];
    }
}

/* Junta as partes: uma só → ela mesma; mesmo tipo → Multi*; tipos mistos → GeometryCollection. */
function combine(parts) {
    if (!parts.length) {
        return null;
    }

    if (parts.length === 1) {
        return parts[0];
    }

    const type = parts[0].type;

    if (parts.every((part) => part.type === type)) {
        return { type: `Multi${type}`, coordinates: parts.map((part) => part.coordinates) };
    }

    return { type: "GeometryCollection", geometries: parts };
}


/* ---------------- propriedades ---------------- */

/* Descrições costumam ser HTML (tabelas de atributos); vira texto simples. */
const htmlToText = (value) => String(value)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

function parseProperties(placemark) {
    const properties = {};

    const name = text(child(placemark, "name"));
    const description = htmlToText(text(child(placemark, "description")));

    if (name) {
        properties.name = name;
    }

    if (description) {
        properties.description = description;
    }

    const extended = child(placemark, "ExtendedData");

    if (extended) {
        children(extended, "Data").forEach((data) => {
            const key = data.getAttribute("name");

            if (key) {
                properties[key] = text(child(data, "value"));
            }
        });

        children(extended, "SchemaData").forEach((schemaData) => {
            children(schemaData, "SimpleData").forEach((simple) => {
                const key = simple.getAttribute("name");

                if (key) {
                    properties[key] = text(simple);
                }
            });
        });
    }

    return properties;
}


/* ---------------- documento ---------------- */

/*
   Bytes → texto respeitando o encoding do prólogo XML
   (<?xml … encoding="ISO-8859-1"?>); sem declaração, UTF-8.
*/
export function decodeXml(bytes) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
    const declared = /<\?xml[^>]*encoding=["']([\w.:-]+)["']/i.exec(head);

    if (declared) {
        try {
            return new TextDecoder(declared[1]).decode(bytes);
        } catch (error) {
            /* Encoding desconhecido pelo navegador: tenta UTF-8. */
        }
    }

    return new TextDecoder("utf-8").decode(bytes);
}

export function kmlToGeoJSON(source, parser = new DOMParser()) {
    const doc = parser.parseFromString(source, "application/xml");
    const root = doc.documentElement;

    if (!root || root.localName === "parsererror" || doc.getElementsByTagName("parsererror").length) {
        throw new Error("O arquivo KML não é um XML válido.");
    }

    if (root.localName !== "kml") {
        throw new Error("O arquivo não é um documento KML.");
    }

    const features = descendants(root, "Placemark").map((placemark) => {
        const parts = children(placemark)
            .filter((element) => GEOMETRY_TAGS.includes(element.localName))
            .flatMap(parseGeometry);

        return {
            type: "Feature",
            properties: parseProperties(placemark),
            geometry: combine(parts)
        };
    });

    const documentNode = descendants(root, "Document")[0] || null;
    const name = documentNode ? text(child(documentNode, "name")) : "";

    return {
        type: "FeatureCollection",
        name: name || undefined,
        features
    };
}
