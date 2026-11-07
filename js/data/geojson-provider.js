/* ============================================================
   DATA PROVIDER — GeoJSON, KML e KMZ

   Carrega e valida um FeatureCollection a partir de URL ou de
   arquivo local. Arquivos locais podem ser GeoJSON, KML ou KMZ:
   KML/KMZ são convertidos para GeoJSON (data/kml.js, data/kmz.js)
   e seguem pela mesma validação. Novos formatos (Shapefile,
   FlatGeobuf) devem entrar do mesmo jeito, com a mesma saída:
   { name, features, geometryTypes }
   ============================================================ */

import { decodeXml, kmlToGeoJSON } from "./kml.js";
import { kmzToKml } from "./kmz.js";

const ACCEPTED_CRS = [
    "urn:ogc:def:crs:ogc:1.3:crs84",
    "urn:ogc:def:crs:epsg::4326",
    "epsg:4326",
    "crs84"
];

export class DataError extends Error {}


function validate(data) {
    if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
        throw new DataError("O arquivo não é um GeoJSON FeatureCollection válido.");
    }

    /* "crs" é legado (RFC 7946 removeu), mas exportadores ainda o gravam. */
    const crsName = data.crs && data.crs.properties && data.crs.properties.name;

    if (crsName && !ACCEPTED_CRS.includes(String(crsName).toLowerCase())) {
        throw new DataError(
            `Sistema de coordenadas não suportado (${crsName}). Reprojete para WGS84 (EPSG:4326).`
        );
    }

    const geometryTypes = {};

    const features = data.features.filter((feature) => {
        if (!feature || feature.type !== "Feature") {
            return false;
        }

        const type = feature.geometry ? feature.geometry.type : "sem geometria";

        geometryTypes[type] = (geometryTypes[type] || 0) + 1;

        if (!feature.properties || typeof feature.properties !== "object") {
            feature.properties = {};
        }

        return true;
    });

    return {
        name: typeof data.name === "string" ? data.name : null,
        features,
        geometryTypes,
        metadata: {
            description: typeof data.description === "string" ? data.description.trim() : "",
            crs: crsLabel(crsName),
            bbox: validBbox(data.bbox) || computeBbox(features)
        }
    };
}


/*
   Sistema de coordenadas dos dados como o mapa os lê. Sem "crs", o
   GeoJSON é WGS 84 por definição (RFC 7946); os aceitos também são.
*/
const crsLabel = (crsName) => {
    const name = String(crsName || "").toLowerCase();

    return !name || name.includes("crs84") || name.includes("4326")
        ? "WGS 84 · EPSG:4326 (graus decimais)"
        : String(crsName);
};

const validBbox = (bbox) =>
    Array.isArray(bbox) && bbox.length >= 4 && bbox.slice(0, 4).every(Number.isFinite)
        ? (bbox.length === 6 ? [bbox[0], bbox[1], bbox[3], bbox[4]] : bbox.slice(0, 4))
        : null;

/* [oeste, sul, leste, norte] percorrendo todas as coordenadas (null sem geometria). */
function computeBbox(features) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];

    const visit = (coords) => {
        if (typeof coords[0] === "number") {
            box[0] = Math.min(box[0], coords[0]);
            box[1] = Math.min(box[1], coords[1]);
            box[2] = Math.max(box[2], coords[0]);
            box[3] = Math.max(box[3], coords[1]);
            return;
        }

        coords.forEach(visit);
    };

    const visitGeometry = (geometry) => {
        if (!geometry) {
            return;
        }

        if (geometry.type === "GeometryCollection") {
            (geometry.geometries || []).forEach(visitGeometry);
        } else if (Array.isArray(geometry.coordinates)) {
            visit(geometry.coordinates);
        }
    };

    features.forEach((feature) => visitGeometry(feature.geometry));

    return box.every(Number.isFinite) ? box : null;
}


/* Espera o navegador pintar a tela antes de um trabalho síncrono pesado. */
const nextPaint = () => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
});

const parseJson = async (text, onProgress) => {
    onProgress({ phase: "processing" });
    await nextPaint();

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new DataError("O conteúdo não é JSON válido.");
    }
};


/*
   Lê o corpo em partes para informar o progresso.

   total só é confiável sem compressão: com Content-Encoding, o
   Content-Length é o tamanho comprimido e os bytes lidos (já
   descomprimidos) passariam dele. Nesse caso total = null e a
   interface mostra progresso indeterminado (só os MB recebidos).
*/
async function readBody(response, onProgress) {
    const length = Number(response.headers.get("content-length"));
    const encoded = Boolean(response.headers.get("content-encoding"));
    const total = !encoded && Number.isFinite(length) && length > 0 ? length : null;

    if (!response.body || typeof response.body.getReader !== "function") {
        onProgress({ phase: "downloading", loaded: 0, total: null });
        return response.text();
    }

    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);
        loaded += value.length;
        onProgress({ phase: "downloading", loaded, total: total && loaded <= total ? total : null });
    }

    const bytes = new Uint8Array(loaded);
    let offset = 0;

    chunks.forEach((chunk) => {
        bytes.set(chunk, offset);
        offset += chunk.length;
    });

    return new TextDecoder("utf-8").decode(bytes);
}


/*
   onProgress recebe { phase: "downloading", loaded, total } durante
   o download e { phase: "processing" } antes da leitura do JSON.
*/
export async function loadFromUrl(url, { signal, onProgress = () => {} } = {}) {
    let response;

    onProgress({ phase: "downloading", loaded: 0, total: null });

    try {
        response = await fetch(url, { signal });
    } catch (error) {
        if (error.name === "AbortError") {
            throw error;
        }

        throw new DataError("Falha de rede ao baixar a camada.");
    }

    if (!response.ok) {
        throw new DataError(`Servidor respondeu HTTP ${response.status}.`);
    }

    let text;

    try {
        text = await readBody(response, onProgress);
    } catch (error) {
        throw new DataError("A conexão caiu durante o download da camada.");
    }

    return validate(await parseJson(text, onProgress));
}


/* Formato pelo conteúdo, com a extensão como desempate: "PK" = ZIP (KMZ); "<" = XML (KML). */
const detectFormat = (file, bytes) => {
    const extension = (/\.([a-z0-9]+)$/i.exec(file.name || "") || [])[1];
    const lower = extension ? extension.toLowerCase() : "";

    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return "kmz";
    }

    if (lower === "kml" || lower === "kmz") {
        return lower;
    }

    /* Primeiro caractere significativo (o TextDecoder já descarta o BOM). */
    const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 64)).trimStart();

    return head.startsWith("<") ? "kml" : "geojson";
};

const convertKml = async (text, onProgress) => {
    onProgress({ phase: "processing" });
    await nextPaint();

    try {
        return kmlToGeoJSON(text);
    } catch (error) {
        throw new DataError(error.message);
    }
};

export async function loadFromFile(file, { onProgress = () => {} } = {}) {
    onProgress({ phase: "downloading", loaded: 0, total: file.size || null });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectFormat(file, bytes);

    if (format === "kmz") {
        let kml;

        try {
            kml = await kmzToKml(bytes.buffer);
        } catch (error) {
            throw new DataError(error.message);
        }

        return validate(await convertKml(kml, onProgress));
    }

    if (format === "kml") {
        return validate(await convertKml(decodeXml(bytes), onProgress));
    }

    return validate(await parseJson(new TextDecoder("utf-8").decode(bytes), onProgress));
}
