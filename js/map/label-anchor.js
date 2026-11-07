/* ============================================================
   PONTO DE RÓTULO

   Calcula, a partir da geometria GeoJSON, um ponto [lat, lng]
   para posicionar o rótulo de uma feição. Não depende do Leaflet.

   Polígonos: o centroide pode cair fora de formas côncavas
   (comuns em talhões). Por isso traça-se uma linha horizontal na
   latitude do centroide, cruza-se com as bordas e usa-se o meio
   do trecho interno mais largo — um ponto garantidamente dentro
   do anel externo.
   ============================================================ */

/* Área com sinal e centroide de um anel [[lng, lat], ...]. */
const ringStats = (ring) => {
    let area = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x0, y0] = ring[j];
        const [x1, y1] = ring[i];
        const cross = x0 * y1 - x1 * y0;

        area += cross;
        cx += (x0 + x1) * cross;
        cy += (y0 + y1) * cross;
    }

    area /= 2;

    if (area === 0) {
        const [x, y] = ring[0];

        return { area: 0, x, y };
    }

    return { area: Math.abs(area), x: cx / (6 * area), y: cy / (6 * area) };
};

/* Meio do trecho interno mais largo na latitude y. */
const interiorPoint = (ring, x, y) => {
    const crossings = [];

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x0, y0] = ring[j];
        const [x1, y1] = ring[i];

        if ((y0 > y) !== (y1 > y)) {
            crossings.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
    }

    crossings.sort((a, b) => a - b);

    let best = null;

    for (let i = 0; i + 1 < crossings.length; i += 2) {
        const width = crossings[i + 1] - crossings[i];

        if (!best || width > best.width) {
            best = { width, x: (crossings[i] + crossings[i + 1]) / 2 };
        }
    }

    return best ? [y, best.x] : [y, x];
};

/* Maior polígono (anel externo) de um Polygon/MultiPolygon. */
const largestRing = (polygons) => {
    let best = null;

    polygons.forEach((polygon) => {
        const ring = polygon[0];

        if (!ring || ring.length < 3) {
            return;
        }

        const stats = ringStats(ring);

        if (!best || stats.area > best.stats.area) {
            best = { ring, stats };
        }
    });

    return best;
};

export function labelAnchor(geometry) {
    if (!geometry) {
        return null;
    }

    const { type, coordinates } = geometry;

    if (type !== "GeometryCollection" && !coordinates) {
        return null;
    }

    switch (type) {
        case "Point":
            return [coordinates[1], coordinates[0]];

        case "MultiPoint":
            return coordinates.length ? [coordinates[0][1], coordinates[0][0]] : null;

        case "LineString": {
            const middle = coordinates[Math.floor(coordinates.length / 2)];

            return middle ? [middle[1], middle[0]] : null;
        }

        case "MultiLineString": {
            const longest = coordinates.reduce((a, b) => (b.length > a.length ? b : a), []);
            const middle = longest[Math.floor(longest.length / 2)];

            return middle ? [middle[1], middle[0]] : null;
        }

        case "Polygon":
        case "MultiPolygon": {
            const best = largestRing(type === "Polygon" ? [coordinates] : coordinates);

            return best ? interiorPoint(best.ring, best.stats.x, best.stats.y) : null;
        }

        case "GeometryCollection": {
            const first = (geometry.geometries || []).map(labelAnchor).find(Boolean);

            return first || null;
        }

        default:
            return null;
    }
}
