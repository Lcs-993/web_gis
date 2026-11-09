/* rampas-utils.js — funções de uso das rampas (window.RAMPAS / window.PALETAS).
   Sem dependências. Carregue depois de rampas.js. */
(function (g) {
  'use strict';

  function rampa(id) {
    const r = g.RAMPAS && g.RAMPAS[id];
    if (!r) throw new Error('Rampa não encontrada: ' + id);
    return r;
  }

  function paradasDe(id, inverter) {
    const p = rampa(id).paradas;
    return inverter ? p.map(s => ({ pos: 1 - s.pos, cor: s.cor })).reverse() : p;
  }

  function rgb2hsv([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
  }
  function hsv2rgb([h, s, v]) {
    const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }

  function mistura(a, b, k, espaco) {
    let rgb;
    if (espaco === 'hsv') {
      const A = rgb2hsv(a), B = rgb2hsv(b);
      let dh = B[0] - A[0]; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
      rgb = hsv2rgb([(A[0] + dh * k + 360) % 360, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
    } else {
      rgb = [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * k);
    }
    return [...rgb, a[3] + (b[3] - a[3]) * k];
  }

  /** Cor (array [r,g,b,a]) numa posição t de 0 a 1 da rampa. */
  function corNaPosicao(id, t, opcoes = {}) {
    const r = rampa(id), p = paradasDe(id, opcoes.inverter);
    t = Math.min(1, Math.max(0, t));
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (t <= b.pos || i === p.length - 2) {
        if (r.discreta) return (t < b.pos ? a.cor : b.cor).slice();
        const k = b.pos === a.pos ? 0 : (t - a.pos) / (b.pos - a.pos);
        return mistura(a.cor, b.cor, Math.min(1, Math.max(0, k)), r.espaco);
      }
    }
    return p[p.length - 1].cor.slice();
  }

  function css(c) {
    return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${+(c[3] / 255).toFixed(3)})`;
  }

  /** Cor contínua para um valor entre min e max. Retorna 'rgba(...)'.
      opcoes: { inverter: bool, semDados: cor para null/NaN } */
  function corDaRampa(id, valor, min, max, opcoes = {}) {
    if (valor === null || valor === undefined || Number.isNaN(+valor)) return opcoes.semDados || 'rgba(0,0,0,0)';
    const t = max === min ? 0.5 : (valor - min) / (max - min);
    return css(corNaPosicao(id, t, opcoes));
  }

  /** N cores discretas, igualmente espaçadas na rampa. */
  function classesDaRampa(id, n, opcoes = {}) {
    if (n < 2) return [css(corNaPosicao(id, 0.5, opcoes))];
    return Array.from({ length: n }, (_, i) => css(corNaPosicao(id, i / (n - 1), opcoes)));
  }

  /** Limites de classe: retorna n+1 valores (do mínimo ao máximo).
      metodo: 'intervalos-iguais' | 'quantis' | 'jenks' */
  function quebras(valores, n, metodo = 'intervalos-iguais') {
    const v = valores.map(Number).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return [];
    const mn = v[0], mx = v[v.length - 1];
    n = Math.max(1, Math.min(n, v.length));
    if (metodo === 'quantis') {
      return Array.from({ length: n + 1 }, (_, i) => {
        if (i === 0) return mn; if (i === n) return mx;
        const pos = (v.length - 1) * i / n, lo = Math.floor(pos);
        return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (pos - lo);
      });
    }
    if (metodo === 'jenks') {
      const N = v.length, L = Array.from({ length: N + 1 }, () => Array(n + 1).fill(0)),
        V = Array.from({ length: N + 1 }, () => Array(n + 1).fill(Infinity));
      for (let j = 1; j <= n; j++) { L[1][j] = 1; V[1][j] = 0; }
      for (let l = 2; l <= N; l++) {
        let s1 = 0, s2 = 0, w = 0, vr = 0;
        for (let m = 1; m <= l; m++) {
          const i3 = l - m + 1, val = v[i3 - 1];
          s2 += val * val; s1 += val; w++; vr = s2 - (s1 * s1) / w;
          const i4 = i3 - 1;
          if (i4 !== 0) for (let j = 2; j <= n; j++) {
            if (V[l][j] >= vr + V[i4][j - 1]) { L[l][j] = i3; V[l][j] = vr + V[i4][j - 1]; }
          }
        }
        L[l][1] = 1; V[l][1] = vr;
      }
      const res = Array(n + 1); res[n] = mx; res[0] = mn;
      let k = N;
      for (let j = n; j >= 2; j--) { const id = L[k][j] - 2; res[j - 1] = v[id]; k = L[k][j] - 1; }
      return res;
    }
    return Array.from({ length: n + 1 }, (_, i) => mn + (mx - mn) * i / n);
  }

  /** Cor de um valor numa classificação (limites vindos de quebras()). */
  function corDaClasse(id, valor, limites, opcoes = {}) {
    if (valor === null || valor === undefined || Number.isNaN(+valor)) return opcoes.semDados || 'rgba(0,0,0,0)';
    const n = limites.length - 1, cores = classesDaRampa(id, n, opcoes);
    for (let i = 0; i < n; i++) if (valor <= limites[i + 1]) return cores[i];
    return cores[n - 1];
  }

  /** linear-gradient fiel às paradas (degraus duros quando discreta). */
  function gradienteCSS(id, opcoes = {}) {
    const r = rampa(id), p = paradasDe(id, opcoes.inverter), dir = opcoes.direcao || 'to right';
    let partes = [];
    if (r.discreta) {
      for (let i = 0; i < p.length - 1; i++) {
        partes.push(`${css(p[i].cor)} ${(p[i].pos * 100).toFixed(2)}%`, `${css(p[i].cor)} ${(p[i + 1].pos * 100).toFixed(2)}%`);
      }
      partes.push(`${css(p[p.length - 1].cor)} 100%`);
    } else if (r.espaco === 'hsv') {
      for (let i = 0; i <= 24; i++) partes.push(`${css(corNaPosicao(id, i / 24, opcoes))} ${(i / 24 * 100).toFixed(2)}%`);
    } else {
      partes = p.map(s => `${css(s.cor)} ${(s.pos * 100).toFixed(2)}%`);
    }
    return `linear-gradient(${dir}, ${partes.join(', ')})`;
  }

  /** Legenda contínua ou por classes dentro de um elemento.
      opcoes: { titulo, unidade, classes (n), limites (array de quebras()), inverter, casas } */
  function legendaRampa(el, id, min, max, opcoes = {}) {
    if (typeof el === 'string') el = document.querySelector(el);
    const casas = opcoes.casas ?? 1, u = opcoes.unidade ? ' ' + opcoes.unidade : '';
    const fmt = x => (+x).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + u;
    let html = opcoes.titulo ? `<div class="legenda-titulo">${opcoes.titulo}</div>` : '';
    if (opcoes.limites || opcoes.classes) {
      const lim = opcoes.limites || Array.from({ length: opcoes.classes + 1 }, (_, i) => min + (max - min) * i / opcoes.classes);
      const cores = classesDaRampa(id, lim.length - 1, opcoes);
      html += cores.map((c, i) => `<div class="legenda-classe"><span style="background:${c}"></span>${fmt(lim[i])} – ${fmt(lim[i + 1])}</div>`).join('');
    } else {
      html += `<div class="legenda-barra" style="background:${gradienteCSS(id, opcoes)}"></div>
        <div class="legenda-rotulos"><span>${fmt(min)}</span><span>${fmt((min + max) / 2)}</span><span>${fmt(max)}</span></div>`;
    }
    el.classList.add('legenda-rampa');
    el.innerHTML = html;
  }

  g.RampasUtils = { corDaRampa, corNaPosicao, classesDaRampa, quebras, corDaClasse, gradienteCSS, legendaRampa };
  Object.assign(g, { corDaRampa, classesDaRampa, quebras, corDaClasse, gradienteCSS, legendaRampa });
})(typeof window !== 'undefined' ? window : globalThis);
