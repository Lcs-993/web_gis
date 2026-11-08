/* ============================================================
   CARTÃO DA FEIÇÃO (seleção com o Analytics aberto)

   Com o Analytics aberto, a seleção aparece na tabela e o popup
   não abre (cobriria o mapa sobre a própria feição). A tabela,
   porém, mostra poucas colunas em telas estreitas e corta textos
   longos. O cartão mostra a feição inteira num canto do mapa,
   com o mesmo conteúdo do popup (js/ui/popup.js).

   × só esconde o cartão; a seleção continua na tabela e no mapa.
   Em telas estreitas ele começa recolhido (só o título).
   ============================================================ */

import { byId } from "./dom.js";

export function createFeatureCard() {
    const card = byId("feature-card");
    const body = byId("feature-card-body");
    const closeButton = byId("feature-card-close");
    const toggleButton = byId("feature-card-toggle");

    /* Em telas estreitas o cartão começa recolhido: o mapa continua visível. */
    const setExpanded = (expanded) => {
        card.classList.toggle("is-expanded", expanded);
        toggleButton.setAttribute("aria-expanded", String(expanded));
        toggleButton.setAttribute("aria-label", expanded ? "Recolher os atributos" : "Mostrar todos os atributos");
        toggleButton.title = expanded ? "Recolher" : "Mostrar atributos";
    };

    toggleButton.addEventListener("click", () => setExpanded(!card.classList.contains("is-expanded")));

    let key = null;

    const hide = () => {
        card.hidden = true;
        body.replaceChildren();
        key = null;
    };

    /*
       Mesma feição de novo (ex.: o Analytics reaberto): não remonta
       nem reabre um cartão fechado à mão, salvo com reveal (o
       usuário clicou outra vez na feição).
    */
    const show = (selectionKey, content, { reveal = false } = {}) => {
        if (key === selectionKey) {
            if (reveal) {
                card.hidden = false;
            }

            return;
        }

        key = selectionKey;
        body.replaceChildren(content);
        setExpanded(false);
        card.hidden = false;
    };

    closeButton.addEventListener("click", () => {
        card.hidden = true;
    });

    card.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            card.hidden = true;
        }
    });

    return { show, hide };
}
