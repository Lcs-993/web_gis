/* ============================================================
   PONTOS E TRILHAS DE CAMPO

   Guarda no aparelho (localStorage) os pontos marcados e as
   trilhas gravadas. Os dados ficam só neste navegador até serem
   exportados (GPX ou GeoJSON) na aba Pontos.

   Formato:
   - waypoint: { id, name, note, lat, lng, alt, accuracy, createdAt }
   - track:    { id, name, createdAt, distance, points: [[lat, lng, alt, time], ...] }
   ============================================================ */

const STORAGE_KEY = "webgis-mobile-campo-v1";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const optionalNumber = (value) => (isFiniteNumber(value) ? value : null);

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function cleanWaypoint(value) {
    if (!value || !isFiniteNumber(value.lat) || !isFiniteNumber(value.lng)) return null;
    return {
        id: typeof value.id === "string" ? value.id : newId(),
        name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : "Ponto",
        note: typeof value.note === "string" ? value.note.slice(0, 500) : "",
        lat: value.lat,
        lng: value.lng,
        alt: optionalNumber(value.alt),
        accuracy: optionalNumber(value.accuracy),
        createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : Date.now()
    };
}

function cleanTrack(value) {
    if (!value || !Array.isArray(value.points)) return null;
    const points = value.points.filter((point) =>
        Array.isArray(point) && isFiniteNumber(point[0]) && isFiniteNumber(point[1]));
    if (points.length < 2) return null;
    return {
        id: typeof value.id === "string" ? value.id : newId(),
        name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : "Trilha",
        createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : Date.now(),
        distance: isFiniteNumber(value.distance) ? value.distance : 0,
        points
    };
}

export function loadFieldData() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        return {
            waypoints: (Array.isArray(stored?.waypoints) ? stored.waypoints : []).map(cleanWaypoint).filter(Boolean),
            tracks: (Array.isArray(stored?.tracks) ? stored.tracks : []).map(cleanTrack).filter(Boolean),
            recording: stored?.recording && Array.isArray(stored.recording.points) ? stored.recording : null
        };
    } catch (error) {
        console.warn("Não foi possível ler os pontos de campo salvos:", error);
        return { waypoints: [], tracks: [], recording: null };
    }
}

/* Devolve true se salvou; false quando o armazenamento está cheio ou bloqueado. */
export function saveFieldData({ waypoints, tracks, recording }) {
    const compactTrack = (track) => ({
        ...track,
        points: track.points.map(([lat, lng, alt, time]) => [
            Math.round(lat * 1e7) / 1e7,
            Math.round(lng * 1e7) / 1e7,
            isFiniteNumber(alt) ? Math.round(alt * 10) / 10 : null,
            time
        ])
    });
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            waypoints,
            tracks: tracks.map(compactTrack),
            recording: recording ? compactTrack(recording) : null
        }));
        return true;
    } catch (error) {
        console.error("Não foi possível salvar os pontos de campo:", error);
        return false;
    }
}
