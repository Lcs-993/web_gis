/* ============================================================
   BUSCA TEXTUAL EM MEMÓRIA

   O índice concatena, por feature, os valores dos atributos
   pesquisáveis (todos, exceto medidas contínuas e campos vazios)
   já normalizados.

   Duas passadas, da mais estrita para a mais tolerante:
   1. cada termo precisa aparecer no texto; termos numéricos
      precisam casar com um token inteiro ("22" não acha "122");
   2. se nada casar, compara a consulta sem espaços contra o texto
      sem espaços ("olhos dagua" acha "OLHOS D AGUA").
   ============================================================ */

import { isSearchable } from "./schema.js";
import { getAttribute, isEmpty, normalizeText } from "./values.js";

const NUMERIC_TOKEN = /^\d+$/;


export function buildSearchIndex(features, schema) {
    const fields = schema.attributes.filter(isSearchable).map((attribute) => attribute.name);

    return features.map((feature) => {
        const text = fields
            .map((name) => getAttribute(feature, name))
            .filter((value) => !isEmpty(value))
            .map(normalizeText)
            .join(" ");

        return {
            text,
            tokens: new Set(text.split(" ")),
            compact: text.replace(/ /g, "")
        };
    });
}


/*
   Retorna os uids (dentre os candidatos) que casam com o termo.
   `candidates` limita a busca às features que passam nos filtros.
*/
export function search(index, term, candidates) {
    const query = normalizeText(term);

    if (!query) {
        return [];
    }

    const terms = query.split(" ");

    const strict = candidates.filter((uid) => {
        const entry = index[uid];

        return terms.every((part) =>
            NUMERIC_TOKEN.test(part)
                ? entry.tokens.has(part)
                : entry.text.includes(part)
        );
    });

    if (strict.length) {
        return strict;
    }

    const compact = query.replace(/ /g, "");

    return candidates.filter((uid) => index[uid].compact.includes(compact));
}
