/* ============================================================
   CÁLCULOS GEOGRÁFICOS DO NAVEGADOR DE CAMPO

   Funções puras, sem Leaflet e sem DOM: distância e azimute
   geodésicos, área e perímetro, ponto em polígono, conversão
   UTM, leitura de coordenadas digitadas e exportação GPX.

   Pontos são { lat, lng } em graus (WGS84). Geometrias seguem o
   GeoJSON ([lng, lat]). A diferença entre WGS84 e SIRGAS 2000 é
   inferior a 1 m, desprezível para navegação de campo.
   ============================================================ */

const EARTH_RADIUS = 6371008.8;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const UTM_K0 = 0.9996;
const UTM_BANDS = "CDEFGHJKLMNPQRSTUVWX";

const toRad = (degrees) => degrees * Math.PI / 180;
const toDeg = (radians) => radians * 180 / Math.PI;

export const normalizeDegrees = (degrees) => ((degrees % 360) + 360) % 360;

/* Distância de grande círculo (haversine), em metros. */
export function distance(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Azimute inicial de a para b, em graus a partir do norte verdadeiro (0–360). */
export function bearing(a, b) {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLng = toRad(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

export function pathLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += distance(points[index - 1], points[index]);
    }
    return total;
}

/* Área esférica de um anel fechado implícito, em m². */
export function ringArea(points) {
    if (points.length < 3) return 0;
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        sum += toRad(next.lng - current.lng) * (2 + Math.sin(toRad(current.lat)) + Math.sin(toRad(next.lat)));
    }
    return Math.abs(sum * EARTH_RADIUS * EARTH_RADIUS / 2);
}

export function ringPerimeter(points) {
    if (points.length < 2) return 0;
    return pathLength(points) + (points.length > 2 ? distance(points[points.length - 1], points[0]) : 0);
}

const lngLatRing = (ring) => ring.map(([lng, lat]) => ({ lat, lng }));

function polygonsOf(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return [geometry.coordinates];
    if (geometry.type === "MultiPolygon") return geometry.coordinates;
    if (geometry.type === "GeometryCollection") return geometry.geometries.flatMap(polygonsOf);
    return [];
}

/* Área (anéis externos menos furos) e perímetro externo de uma geometria GeoJSON. */
export function geometryMetrics(geometry) {
    let area = 0;
    let perimeter = 0;
    for (const [outer, ...holes] of polygonsOf(geometry)) {
        const outerPoints = lngLatRing(outer);
        area += ringArea(outerPoints);
        perimeter += ringPerimeter(outerPoints);
        holes.forEach((hole) => { area -= ringArea(lngLatRing(hole)); });
    }
    return { area: Math.max(0, area), perimeter, isPolygon: perimeter > 0 };
}

/* [minLng, minLat, maxLng, maxLat] de qualquer geometria GeoJSON. */
export function geometryBbox(geometry) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const visit = (coordinates) => {
        if (typeof coordinates[0] === "number") {
            const [lng, lat] = coordinates;
            if (lng < box[0]) box[0] = lng;
            if (lat < box[1]) box[1] = lat;
            if (lng > box[2]) box[2] = lng;
            if (lat > box[3]) box[3] = lat;
            return;
        }
        coordinates.forEach(visit);
    };
    const walk = (item) => {
        if (!item) return;
        if (item.type === "GeometryCollection") item.geometries.forEach(walk);
        else if (item.coordinates) visit(item.coordinates);
    };
    walk(geometry);
    return Number.isFinite(box[0]) ? box : null;
}

export const bboxContains = (box, lng, lat) =>
    Boolean(box) && lng >= box[0] && lng <= box[2] && lat >= box[1] && lat <= box[3];

function ringContains(ring, lng, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

export function geometryContains(geometry, lng, lat) {
    return polygonsOf(geometry).some(([outer, ...holes]) =>
        ringContains(outer, lng, lat) && !holes.some((hole) => ringContains(hole, lng, lat)));
}

const CARDINALS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];

/* Rumo em pontos cardeais em português (L = leste, O = oeste). */
export const cardinal = (degrees) => CARDINALS[Math.round(normalizeDegrees(degrees) / 45) % 8];

export function formatDms(value, isLatitude) {
    const direction = isLatitude ? (value >= 0 ? "N" : "S") : (value >= 0 ? "L" : "O");
    const absolute = Math.abs(value);
    let degrees = Math.floor(absolute);
    let minutes = Math.floor((absolute - degrees) * 60);
    let seconds = Math.round(((absolute - degrees) * 60 - minutes) * 60 * 100) / 100;
    if (seconds >= 60) { seconds = 0; minutes += 1; }
    if (minutes >= 60) { minutes = 0; degrees += 1; }
    return `${degrees}°${String(minutes).padStart(2, "0")}'${seconds.toFixed(2).padStart(5, "0")}"${direction}`;
}

const utmZoneOf = (lng) => Math.min(60, Math.floor((normalizeDegrees(lng + 180)) / 6) + 1);

/* Projeção UTM (Krüger/Snyder) no elipsoide WGS84, precisão milimétrica dentro da zona. */
export function toUtm(lat, lng, forcedZone = 0) {
    const zone = forcedZone || utmZoneOf(lng);
    const e2 = WGS84_F * (2 - WGS84_F);
    const ep2 = e2 / (1 - e2);
    const phi = toRad(lat);
    const lambda0 = toRad((zone - 1) * 6 - 180 + 3);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const n = WGS84_A / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const t = Math.tan(phi) ** 2;
    const c = ep2 * cosPhi * cosPhi;
    const a = cosPhi * (toRad(lng) - lambda0);
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const m = WGS84_A * (
        (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
        - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
        + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
        - (35 * e6 / 3072) * Math.sin(6 * phi)
    );
    const easting = UTM_K0 * n * (
        a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * a ** 5 / 120
    ) + 500000;
    let northing = UTM_K0 * (m + n * Math.tan(phi) * (
        a * a / 2
        + (5 - t + 9 * c + 4 * c * c) * a ** 4 / 24
        + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * a ** 6 / 720
    ));
    if (lat < 0) northing += 10000000;
    const band = UTM_BANDS[Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)))];
    return { zone, band, south: lat < 0, easting, northing };
}

export function fromUtm(zone, south, easting, northing) {
    const e2 = WGS84_F * (2 - WGS84_F);
    const ep2 = e2 / (1 - e2);
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const x = easting - 500000;
    const y = south ? northing - 10000000 : northing;
    const mu = y / UTM_K0 / (WGS84_A * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu
        + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
        + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
        + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const sin1 = Math.sin(phi1);
    const cos1 = Math.cos(phi1);
    const n1 = WGS84_A / Math.sqrt(1 - e2 * sin1 * sin1);
    const t1 = Math.tan(phi1) ** 2;
    const c1 = ep2 * cos1 * cos1;
    const r1 = WGS84_A * (1 - e2) / (1 - e2 * sin1 * sin1) ** 1.5;
    const d = x / (n1 * UTM_K0);
    const lat = phi1 - (n1 * Math.tan(phi1) / r1) * (
        d * d / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720
    );
    const lng = toRad((zone - 1) * 6 - 180 + 3) + (
        d
        - (1 + 2 * t1 + c1) * d ** 3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120
    ) / cos1;
    return { lat: toDeg(lat), lng: toDeg(lng) };
}

export function formatUtm(lat, lng) {
    const utm = toUtm(lat, lng);
    const round = (value) => Math.round(value).toLocaleString("pt-BR");
    return `${utm.zone}${utm.band} · E ${round(utm.easting)} · N ${round(utm.northing)}`;
}

const isValidLatLng = ({ lat, lng }) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function parseDmsPart(text) {
    const hemisphere = (text.match(/[NSEWLO]/i) || [""])[0].toUpperCase();
    const numbers = text.replace(",", ".").match(/\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length > 3) return null;
    const [degrees, minutes = 0, seconds = 0] = numbers.map(Number);
    if (minutes >= 60 || seconds >= 60) return null;
    let value = degrees + minutes / 60 + seconds / 3600;
    if (/^\s*-/.test(text) || ["S", "W", "O"].includes(hemisphere)) value = -value;
    return { value, hemisphere };
}

/*
   Lê uma coordenada digitada. Aceita:
   - graus decimais: "-20.0868, -46.0424" ou "-20,0868 -46,0424";
   - graus, minutos e segundos: 20°05'12"S 46°02'33"O;
   - UTM: "23K 412345 7778899" (zona + banda; "S" vale como sul).
   Devolve { lat, lng } ou null.
*/
export function parseCoordinate(input) {
    const text = String(input || "").trim();
    if (!text) return null;

    const utm = text.match(/^(\d{1,2})\s*([C-HJ-NP-X])\s*[,;\s]\s*(?:E\s*)?(\d{5,7}(?:[.,]\d+)?)\s*(?:m\s*)?[,;\s]\s*(?:N\s*)?(\d{6,8}(?:[.,]\d+)?)\s*m?$/i);
    if (utm) {
        const zone = Number(utm[1]);
        const band = utm[2].toUpperCase();
        const south = band === "S" || band < "N";
        const point = fromUtm(zone, south, Number(utm[3].replace(",", ".")), Number(utm[4].replace(",", ".")));
        return zone >= 1 && zone <= 60 && isValidLatLng(point) ? point : null;
    }

    const decimal = text.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
        || text.match(/^(-?\d{1,2}(?:,\d+)?)\s*[;\s]\s*(-?\d{1,3}(?:,\d+)?)$/);
    if (decimal) {
        const point = { lat: Number(decimal[1].replace(",", ".")), lng: Number(decimal[2].replace(",", ".")) };
        return isValidLatLng(point) ? point : null;
    }

    if (/[°º'′"″]|\d\s*[NSEWLO]\b|^\s*[NSEWLO]\s*\d/i.test(text)) {
        const letters = /[NSEWLO]/i.test(text);
        const parts = (!letters
            ? text.split(/[,;]/)
            : /^\s*[NSEWLO]/i.test(text)
                ? text.match(/[NSEWLO][^NSEWLO]+/gi)
                : text.match(/[^NSEWLO]+[NSEWLO]/gi)
        )?.map((part) => part.replace(/^[\s,;]+|[\s,;]+$/g, "")).filter(Boolean);
        if (!parts || parts.length !== 2) return null;
        const first = parseDmsPart(parts[0]);
        const second = parseDmsPart(parts[1]);
        if (!first || !second) return null;
        const firstIsLongitude = ["E", "W", "L", "O"].includes(first.hemisphere);
        const point = firstIsLongitude
            ? { lat: second.value, lng: first.value }
            : { lat: first.value, lng: second.value };
        return isValidLatLng(point) ? point : null;
    }

    return null;
}

const escapeXml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const isoTime = (time) => (Number.isFinite(time) ? new Date(time).toISOString() : "");

/* GPX 1.1 com pontos salvos (wpt) e trilhas gravadas (trk). */
export function buildGpx({ waypoints = [], tracks = [] }) {
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="WebGIS Mobile" xmlns="http://www.topografix.com/GPX/1/1">'
    ];
    for (const point of waypoints) {
        lines.push(`  <wpt lat="${point.lat.toFixed(7)}" lon="${point.lng.toFixed(7)}">`);
        if (Number.isFinite(point.alt)) lines.push(`    <ele>${point.alt.toFixed(1)}</ele>`);
        if (point.createdAt) lines.push(`    <time>${isoTime(point.createdAt)}</time>`);
        lines.push(`    <name>${escapeXml(point.name)}</name>`);
        if (point.note) lines.push(`    <desc>${escapeXml(point.note)}</desc>`);
        lines.push("  </wpt>");
    }
    for (const track of tracks) {
        lines.push("  <trk>", `    <name>${escapeXml(track.name)}</name>`, "    <trkseg>");
        for (const [lat, lng, alt, time] of track.points) {
            lines.push(`      <trkpt lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}">`
                + (Number.isFinite(alt) ? `<ele>${alt.toFixed(1)}</ele>` : "")
                + (Number.isFinite(time) ? `<time>${isoTime(time)}</time>` : "")
                + "</trkpt>");
        }
        lines.push("    </trkseg>", "  </trk>");
    }
    lines.push("</gpx>", "");
    return lines.join("\n");
}

export function buildGeoJson({ waypoints = [], tracks = [] }) {
    const features = [
        ...waypoints.map((point) => ({
            type: "Feature",
            properties: {
                Nome: point.name,
                Observações: point.note || null,
                Data: isoTime(point.createdAt) || null,
                "Precisão (m)": Number.isFinite(point.accuracy) ? Math.round(point.accuracy) : null
            },
            geometry: { type: "Point", coordinates: [point.lng, point.lat, ...(Number.isFinite(point.alt) ? [point.alt] : [])] }
        })),
        ...tracks.map((track) => ({
            type: "Feature",
            properties: {
                Nome: track.name,
                Início: isoTime(track.points[0]?.[3]) || null,
                "Distância (m)": Math.round(track.distance || 0)
            },
            geometry: { type: "LineString", coordinates: track.points.map(([lat, lng]) => [lng, lat]) }
        }))
    ];
    return JSON.stringify({ type: "FeatureCollection", features }, null, 1);
}
