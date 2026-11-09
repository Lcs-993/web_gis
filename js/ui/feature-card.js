/* ============================================================
   CARTÃO DA FEIÇÃO (o "pop-up" do WebGIS)

   A feição clicada aparece num cartão fixo no canto superior
   direito do mapa, abaixo da caixa de busca e acima dos controles,
   e não mais num balão sobre a própria feição (que cobria a área
   em análise). Mesmo conteúdo de sempre (js/ui/popup.js).

   Enquanto o cartão está à vista, o mapa enquadra fora dele
   (onVisibilityChange → insets do mapa, em js/main.js).

   × ou Esc: onDismiss decide (sem o Analytics, desfaz a seleção;
   com ele, só esconde o cartão e a linha continua na tabela).
   ============================================================ */

import { byId } from "./dom.js";

export function createFeatureCard({ onDismiss, onVisibilityChange } = {}) {
    const card = byId("feature-card");
    const body = byId("feature-card-body");
    const closeButton = byId("feature-card-close");

    let key = null;

    const setVisible = (visible) => {
        const changed = card.hidden === visible;

        card.hidden = !visible;

        if (changed && onVisibilityChange) {
            onVisibilityChange(visible, card);
        }
    };

    const hide = () => {
        setVisible(false);
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
                setVisible(true);
            }

            return;
        }

        key = selectionKey;
        body.replaceChildren(content);
        body.scrollTop = 0;
        setVisible(true);
    };

    const dismiss = () => {
        setVisible(false);

        if (onDismiss) {
            onDismiss();
        }
    };

    closeButton.addEventListener("click", dismiss);

    card.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
        }
    });

    return { show, hide, isVisible: () => !card.hidden };
}
