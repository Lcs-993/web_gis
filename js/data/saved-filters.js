/* ============================================================
   FILTROS SALVOS

   Conjuntos de filtros com nome, por camada, guardados no
   navegador (localStorage). Nada sai da máquina do usuário.

   Formato: { [layerId]: [{ name, mode, filters, savedAt }] }

   localStorage pode faltar ou falhar (janela privada, cota,
   bloqueio): toda leitura/escrita é protegida e o painel segue
   funcionando, só sem persistência.
   ============================================================ */

const KEY = "webgis-saved-filters";
const MAX_PER_LAYER = 20;

const readAll = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");

        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
};

const writeAll = (data) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
    } catch (error) {
        return false;
    }
};

const isValidSet = (set) =>
    set && typeof set.name === "string" && Array.isArray(set.filters);

export function listSavedFilters(layerId) {
    const sets = readAll()[layerId];

    return Array.isArray(sets) ? sets.filter(isValidSet) : [];
}

/* Mesmo nome substitui o conjunto anterior. Retorna false se não deu para gravar. */
export function saveFilterSet(layerId, name, filters, mode) {
    const data = readAll();
    const others = listSavedFilters(layerId).filter((set) => set.name !== name);

    data[layerId] = [
        { name, mode: mode === "any" ? "any" : "all", filters, savedAt: new Date().toISOString() },
        ...others
    ].slice(0, MAX_PER_LAYER);

    return writeAll(data);
}

export function deleteFilterSet(layerId, name) {
    const data = readAll();

    data[layerId] = listSavedFilters(layerId).filter((set) => set.name !== name);

    if (!data[layerId].length) {
        delete data[layerId];
    }

    return writeAll(data);
}


/*
   Aplica um conjunto salvo na camada. Só entram condições cujos
   atributos existem na camada como está agora (o arquivo pode ter
   mudado desde que o conjunto foi salvo).
*/
export function applyFilterSet(store, layer, set) {
    if (!layer || layer.status !== "ready") {
        return;
    }

    const names = new Set(layer.schema.attributes.map((attribute) => attribute.name));
    const usable = set.filters.filter((filter) => filter && names.has(filter.field));
    const dropped = set.filters.length - usable.length;

    store.setFilters(layer.id, usable, set.mode);
    store.setStatus(dropped
        ? `“${set.name}” aplicado; ${dropped} condição(ões) ignorada(s): atributo inexistente`
        : `“${set.name}” aplicado`);
}
