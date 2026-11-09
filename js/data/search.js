/* ============================================================
   BUSCA TEXTUAL EM MEMÓRIA

   O índice guarda, por feature, os valores dos atributos
   pesquisáveis (todos, exceto medidas contínuas e campos vazios)
   já normalizados: um a um (para a pesquisa avançada escolher os
   campos) e concatenados (para a busca padrão, mais rápida).

   Busca padrão (contém, todos os termos, todos os campos), em duas
   passadas, da mais estrita para a mais tolerante:
   1. cada termo precisa aparecer no texto; termos numéricos
      precisam casar com um token inteiro ("22" não acha "122");
   2. se nada casar, compara a consulta sem espaços contra o texto
      sem espaços ("olhos dagua" acha "OLHOS D AGUA").

   Pesquisa avançada (painel do botão Pesquisar), por camada:
   - fields: só nesses atributos (null = todos os pesquisáveis);
   - match: "contains" (contém), "starts" (alguma palavra começa
     com o termo) ou "exact" (o valor inteiro de um campo é igual);
   - combine: "all" (todos os termos, E) ou "any" (qualquer um, OU).
     No valor exato com "all", a consulta inteira é um só valor;
     com "any", cada termo é um valor ("22 23" acha 22 ou 23).
   ============================================================ */

import { isSearchable } from "./schema.js";
import { getAttribute, isEmpty, normalizeText } from "./values.js";

const NUMERIC_TOKEN = /^\d+$/;

export const SEARCH_MATCH = [
    { id: "contains", label: "Contém", hint: "O termo aparece em qualquer parte do valor. Números casam com o número inteiro (22 não acha 122)." },
    { id: "starts", label: "Começa com", hint: "Alguma palavra do valor começa com o termo (FAZ acha FAZENDA)." },
    { id: "exact", label: "Valor exato", hint: "O valor inteiro do campo é igual ao termo (maiúsculas e acentos não importam)." }
];

export const SEARCH_COMBINE = [
    { id: "all", label: "Todos os termos (E)" },
    { id: "any", label: "Qualquer termo (OU)" }
];

export const DEFAULT_SEARCH_OPTIONS = Object.freeze({ fields: null, match: "contains", combine: "all", fit: true });

export const isDefaultSearch = (options) =>
    !options || (options.fields === null && options.match === "contains" && options.combine === "all");


export function buildSearchIndex(features, schema) {
    const fields = schema.attributes.filter(isSearchable).map((attribute) => attribute.name);

    return features.map((feature) => {
        const values = {};

        fields.forEach((name) => {
            const value = getAttribute(feature, name);

            if (!isEmpty(value)) {
                values[name] = normalizeText(value);
            }
        });

        const text = Object.values(values).join(" ");

        return {
            values,
            text,
            tokens: new Set(text.split(" ")),
            compact: text.replace(/ /g, "")
        };
    });
}


/* Busca padrão: contém, todos os termos, todos os campos, com a passada tolerante. */
const searchDefault = (index, query, candidates) => {
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
};


/*
   Retorna os uids (dentre os candidatos) que casam com o termo.
   `candidates` limita a busca às features que passam nos filtros.
*/
export function search(index, term, candidates, options = DEFAULT_SEARCH_OPTIONS) {
    const query = normalizeText(term);

    if (!query) {
        return [];
    }

    if (isDefaultSearch(options)) {
        return searchDefault(index, query, candidates);
    }

    const { fields, match, combine } = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    if (Array.isArray(fields) && !fields.length) {
        return [];
    }

    const valuesOf = (entry) => (fields
        ? fields.map((name) => entry.values[name]).filter(Boolean)
        : Object.values(entry.values));

    const quantifier = combine === "any" ? "some" : "every";

    if (match === "exact") {
        const parts = combine === "any" ? query.split(" ") : [query];

        return candidates.filter((uid) => {
            const values = valuesOf(index[uid]);

            return parts.some((part) => values.includes(part));
        });
    }

    const terms = query.split(" ");

    if (match === "starts") {
        return candidates.filter((uid) => {
            const words = valuesOf(index[uid]).join(" ").split(" ");

            return terms[quantifier]((part) => words.some((word) => word.startsWith(part)));
        });
    }

    /* Contém, com campos escolhidos e/ou qualquer termo. */
    const hasNumber = terms.some((part) => NUMERIC_TOKEN.test(part));

    const strict = candidates.filter((uid) => {
        const text = valuesOf(index[uid]).join(" ");
        const tokens = hasNumber ? new Set(text.split(" ")) : null;

        return terms[quantifier]((part) =>
            NUMERIC_TOKEN.test(part)
                ? tokens.has(part)
                : text.includes(part)
        );
    });

    if (strict.length || combine === "any") {
        return strict;
    }

    const compact = query.replace(/ /g, "");

    return candidates.filter((uid) => valuesOf(index[uid]).join("").replace(/ /g, "").includes(compact));
}
