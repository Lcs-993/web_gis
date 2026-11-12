/* ============================================================
   SERVIDOR DO APP DE CAMPO

   O app de campo (repositório -app-campo-agronomico) envia as
   fichas para um servidor (pasta backend/ daquele repositório),
   que publica camadas GeoJSON em /api/v1/camadas/<nome>.geojson.
   Este módulo guarda o endereço desse servidor e monta as
   definições das camadas do campo (CAMPO_LAYERS, em config.js).

   Ordem de prioridade do endereço:
   1. ?campo=<url> (e ?campo_chave=<chave>) na URL do WebGIS: fica
      guardado neste navegador e some da barra de endereço;
   2. o que foi salvo em Configurações → App de campo;
   3. CAMPO_API.url em config.js (endereço oficial, quando houver).
   Sem endereço, as camadas do campo não são carregadas e a
   demonstração de coletas continua no lugar.
   ============================================================ */

import { CAMPO_API, CAMPO_LAYERS } from "../config.js";

const CHAVE = "webgis-campo-servidor";

const normalizar = (url) => String(url || "").trim().replace(/\/+$/, "");

function lerGuardado() {
    try {
        const valor = JSON.parse(localStorage.getItem(CHAVE) || "null");

        return valor && typeof valor === "object" ? valor : null;
    } catch {
        return null;
    }
}

export function salvarServidorCampo({ url, chave }) {
    try {
        if (normalizar(url)) {
            localStorage.setItem(CHAVE, JSON.stringify({ url: normalizar(url), chave: String(chave || "").trim() }));
        } else {
            localStorage.removeItem(CHAVE);
        }
    } catch {
        /* Navegador sem armazenamento: vale só para esta visita. */
    }
}

/* Lê ?campo= da URL uma única vez, guarda e limpa a barra de endereço. */
function absorverParametroDaUrl() {
    const params = new URLSearchParams(location.search);

    if (!params.has("campo")) {
        return;
    }

    salvarServidorCampo({ url: params.get("campo"), chave: params.get("campo_chave") });
    params.delete("campo");
    params.delete("campo_chave");

    const resto = params.toString();

    history.replaceState(null, "", `${location.pathname}${resto ? `?${resto}` : ""}${location.hash}`);
}

/* { url, chave, origem: "navegador" | "config" } ou null se não houver servidor. */
export function servidorCampo() {
    absorverParametroDaUrl();

    const guardado = lerGuardado();

    if (guardado && normalizar(guardado.url)) {
        return { url: normalizar(guardado.url), chave: guardado.chave || "", origem: "navegador" };
    }

    if (normalizar(CAMPO_API.url)) {
        return { url: normalizar(CAMPO_API.url), chave: CAMPO_API.chave || "", origem: "config" };
    }

    return null;
}

/* Endereço de uma camada do servidor, com nomes legíveis (rotulos=pt) e a chave de leitura, se houver. */
export function urlCamadaCampo(servidor, camada) {
    const params = new URLSearchParams({ rotulos: "pt" });

    if (servidor.chave) {
        params.set("chave", servidor.chave);
    }

    return `${servidor.url}/api/v1/camadas/${encodeURIComponent(camada)}.geojson?${params}`;
}

/* Definições prontas para o catálogo de camadas (mesmo formato de LAYERS). */
export function camadasDoCampo(servidor) {
    return CAMPO_LAYERS.map(({ camada, ...definicao }) => ({ ...definicao, url: urlCamadaCampo(servidor, camada) }));
}

/* Testa o endereço: { ok, mensagem }. */
export async function testarServidorCampo({ url, chave }) {
    const servidor = { url: normalizar(url), chave: String(chave || "").trim() };

    if (!servidor.url) {
        return { ok: false, mensagem: "Informe o endereço do servidor." };
    }

    try {
        const saude = await fetch(`${servidor.url}/api/v1/saude`, { cache: "no-store" });

        if (!saude.ok) {
            return { ok: false, mensagem: `O servidor respondeu HTTP ${saude.status}.` };
        }

        const camada = await fetch(urlCamadaCampo(servidor, "coletas").replace("?", "?limite=1&"), { cache: "no-store" });

        if (camada.status === 401) {
            return { ok: false, mensagem: "Servidor encontrado, mas a chave de leitura foi recusada." };
        }

        if (!camada.ok) {
            return { ok: false, mensagem: `O servidor respondeu HTTP ${camada.status} ao ler as coletas.` };
        }

        return { ok: true, mensagem: "Conectado. As camadas do campo entram ao salvar." };
    } catch {
        return { ok: false, mensagem: "Sem resposta. Confira o endereço, a internet e se o servidor libera este site (CORS)." };
    }
}
