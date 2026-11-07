/* ============================================================
   AVISO "EM BREVE"

   Para botões de recursos ainda não implementados (ex.: assistente
   de IA na barra superior). O botão aponta, por aria-controls, para
   um cartão que abre e fecha ao clicar; fecha com Esc ou ao clicar
   fora. Mesmo visual dos itens "Em breve" dos menus de módulos.
   ============================================================ */

export function createComingSoon(button) {
    const card = button ? document.getElementById(button.getAttribute("aria-controls")) : null;

    if (!button || !card) {
        return;
    }

    const setOpen = (open) => {
        card.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
    };

    button.addEventListener("click", () => setOpen(card.hidden));

    document.addEventListener("pointerdown", (event) => {
        if (!card.hidden && !card.contains(event.target) && !button.contains(event.target)) {
            setOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !card.hidden) {
            /* stopPropagation: o Esc não fecha também os painéis do mapa. */
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            button.focus();
        }
    }, true);
}
