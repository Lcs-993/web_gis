/* ============================================================
   RAMPAS DE CORES

   Os dados vêm de assets/rampas_de_cores/rampas.js (gerado pelo
   converter_rampas.py a partir das rampas do ArcMap/QGIS), que
   define window.RAMPAS. Ele é carregado no index.html antes do
   app; sem ele, o tema volta para a paleta padrão.

   As contas são as do rampas-utils.js da mesma pasta, em forma de
   módulo e devolvendo cores em hex (#rrggbb), que o mapa, a
   legenda e o KML usam sem conversão:
   - rampColors(id, n): n cores igualmente espaçadas na rampa;
   - rampGradient(id): linear-gradient para a amostra da rampa;
   - breaks(valores, n, método): limites das classes
     (intervalos iguais, quantis ou quebras naturais de Jenks).
   ============================================================ */

const source = () => (typeof window !== "undefined" && window.RAMPAS) || {};

export const RAMP_TYPES = [
    ["sequencial", "Sequenciais"],
    ["divergente", "Divergentes"],
    ["multimatiz", "Multimatiz"],
    ["categorica", "Categóricas"]
];

export const BREAK_METHODS = [
    ["jenks", "Quebras naturais (Jenks)"],
    ["quantis", "Quantis (mesmo número de feições)"],
    ["intervalos-iguais", "Intervalos iguais"],
    ["manual", "Manual (limites digitados)"]
];

/* "Arcmap_12_raster" → "Arcmap 12". */
const prettyName = (name) => String(name)
    .replace(/_raster$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

export const hasRamp = (id) => Boolean(id && source()[id]);

/* Lista para o seletor: { id, name, type }, na ordem do arquivo. */
export const listRamps = () => Object.entries(source()).map(([id, ramp]) => ({
    id,
    name: prettyName(ramp.nome || id),
    type: ramp.tipo || "outras"
}));

export const rampName = (id) => {
    const ramp = source()[id];

    return ramp ? prettyName(ramp.nome || id) : "";
};


/* ---------------- cor numa posição da rampa ---------------- */

const stopsOf = (ramp, invert) => invert
    ? ramp.paradas.map((stop) => ({ pos: 1 - stop.pos, cor: stop.cor })).reverse()
    : ramp.paradas;

const rgbToHsv = ([r, g, b]) => {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;

    if (d) {
        h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    }

    return [(h * 60 + 360) % 360, max ? d / max : 0, max];
};

const hsvToRgb = ([h, s, v]) => {
    const f = (n) => {
        const k = (n + h / 60) % 6;

        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };

    return [f(5) * 255, f(3) * 255, f(1) * 255];
};

const mix = (a, b, k, space) => {
    if (space === "hsv") {
        const A = rgbToHsv(a);
        const B = rgbToHsv(b);
        let dh = B[0] - A[0];

        if (dh > 180) {
            dh -= 360;
        }

        if (dh < -180) {
            dh += 360;
        }

        return hsvToRgb([(A[0] + dh * k + 360) % 360, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
    }

    return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
};

/* Cor [r, g, b] na posição t (0 a 1). */
const colorAt = (ramp, t, invert) => {
    const stops = stopsOf(ramp, invert);
    const x = Math.min(1, Math.max(0, t));

    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];

        if (x <= b.pos || i === stops.length - 2) {
            if (ramp.discreta) {
                return (x < b.pos ? a.cor : b.cor).slice(0, 3);
            }

            const k = b.pos === a.pos ? 0 : (x - a.pos) / (b.pos - a.pos);

            return mix(a.cor, b.cor, Math.min(1, Math.max(0, k)), ramp.espaco);
        }
    }

    return stops[stops.length - 1].cor.slice(0, 3);
};

const toHex = (rgb) => "#" + rgb
    .map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0"))
    .join("");

/* n cores (hex) igualmente espaçadas; com uma só, a do meio. */
export const rampColors = (id, n, { invert = false } = {}) => {
    const ramp = source()[id];

    if (!ramp || n < 1) {
        return [];
    }

    if (n === 1) {
        return [toHex(colorAt(ramp, 0.5, invert))];
    }

    return Array.from({ length: n }, (_, i) => toHex(colorAt(ramp, i / (n - 1), invert)));
};

/* Amostra da rampa para CSS (degraus duros quando discreta). */
export const rampGradient = (id, { invert = false } = {}) => {
    const ramp = source()[id];

    if (!ramp) {
        return "none";
    }

    const stops = stopsOf(ramp, invert);
    let parts;

    if (ramp.discreta) {
        parts = stops.flatMap((stop, i) => i < stops.length - 1
            ? [`${toHex(stop.cor.slice(0, 3))} ${(stop.pos * 100).toFixed(2)}%`, `${toHex(stop.cor.slice(0, 3))} ${(stops[i + 1].pos * 100).toFixed(2)}%`]
            : [`${toHex(stop.cor.slice(0, 3))} 100%`]);
    } else if (ramp.espaco === "hsv") {
        parts = Array.from({ length: 25 }, (_, i) => `${toHex(colorAt(ramp, i / 24, invert))} ${(i / 24 * 100).toFixed(2)}%`);
    } else {
        parts = stops.map((stop) => `${toHex(stop.cor.slice(0, 3))} ${(stop.pos * 100).toFixed(2)}%`);
    }

    return `linear-gradient(to right, ${parts.join(", ")})`;
};


/* ---------------- classes (quebras) ---------------- */

/* Quebras naturais de Jenks: minimiza a variância dentro das classes. */
const jenks = (sorted, n) => {
    const count = sorted.length;
    const lower = Array.from({ length: count + 1 }, () => new Array(n + 1).fill(0));
    const variance = Array.from({ length: count + 1 }, () => new Array(n + 1).fill(Infinity));

    for (let j = 1; j <= n; j++) {
        lower[1][j] = 1;
        variance[1][j] = 0;
    }

    for (let l = 2; l <= count; l++) {
        let sum = 0;
        let sumSquares = 0;
        let w = 0;
        let v = 0;

        for (let m = 1; m <= l; m++) {
            const i3 = l - m + 1;
            const value = sorted[i3 - 1];

            sumSquares += value * value;
            sum += value;
            w++;
            v = sumSquares - (sum * sum) / w;

            const i4 = i3 - 1;

            if (i4 !== 0) {
                for (let j = 2; j <= n; j++) {
                    if (variance[l][j] >= v + variance[i4][j - 1]) {
                        lower[l][j] = i3;
                        variance[l][j] = v + variance[i4][j - 1];
                    }
                }
            }
        }

        lower[l][1] = 1;
        variance[l][1] = v;
    }

    const limits = new Array(n + 1);
    let k = count;

    limits[n] = sorted[count - 1];
    limits[0] = sorted[0];

    for (let j = n; j >= 2; j--) {
        limits[j - 1] = sorted[lower[k][j] - 2];
        k = lower[k][j] - 1;
    }

    return limits;
};

/*
   Até 4.000 valores o Jenks roda sobre todos (O(n²)); acima disso,
   sobre uma amostra regular dos valores ordenados, que preserva a
   distribuição e mantém a resposta imediata.
*/
const JENKS_MAX = 4000;

/*
   Limites das classes: n + 1 valores, do mínimo ao máximo, sem
   repetidos (dados com muitos valores iguais podem dar menos classes).
*/
export const breaks = (values, n, method = "jenks") => {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);

    if (!sorted.length) {
        return [];
    }

    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const classes = Math.max(1, Math.min(n, sorted.length));
    let limits;

    if (min === max) {
        return [min, max];
    }

    if (method === "quantis") {
        limits = Array.from({ length: classes + 1 }, (_, i) => {
            if (i === 0) {
                return min;
            }

            if (i === classes) {
                return max;
            }

            const pos = (sorted.length - 1) * i / classes;
            const lo = Math.floor(pos);

            return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
        });
    } else if (method === "jenks") {
        const sample = sorted.length > JENKS_MAX
            ? Array.from({ length: JENKS_MAX }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / (JENKS_MAX - 1))])
            : sorted;

        limits = jenks(sample, Math.min(classes, sample.length));
        limits[0] = min;
        limits[limits.length - 1] = max;
    } else {
        limits = Array.from({ length: classes + 1 }, (_, i) => min + (max - min) * i / classes);
    }

    return limits.filter((value, i) => i === 0 || value > limits[i - 1]);
};
