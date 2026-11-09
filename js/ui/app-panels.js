/* ============================================================
   PEÇAS DA APLICAÇÃO (fora do mapa e dos dados)

   - Configurações: tema e "Reduzir transparência", via a API de
     js/theme.js (window.webgisTheme).
   - Notificações: lista curta de novidades (camada carregada,
     falha, exportação) no cartão da Conta (pé da barra esquerda),
     com um sininho no canto do ícone do usuário até ser vista.
   - Créditos das fontes, usados no Sobre e no rodapé.
   ============================================================ */

import { el, byId } from "./dom.js";
import { createComingSoon } from "./coming-soon.js";

const MAX_NOTIFICATIONS = 20;

/* Atribuição em HTML (config.js) → texto puro, sem inserir HTML na página. */
export const plainText = (html) =>
    html ? new DOMParser().parseFromString(html, "text/html").body.textContent.trim() : "";


/* ---------------- configurações ---------------- */

export function createSettingsPanel() {
    const theme = window.webgisTheme;
    const options = Array.from(document.querySelectorAll("[data-theme-option]"));
    const semBlur = byId("settings-sem-blur");

    if (!theme) {
        return;
    }

    const sync = () => {
        const current = theme.get();

        options.forEach((option) => {
            const checked = option.dataset.themeOption === current;

            option.setAttribute("aria-checked", String(checked));
            option.tabIndex = checked ? 0 : -1;
        });

        semBlur.checked = theme.isSemBlur();
    };

    options.forEach((option) => {
        option.addEventListener("click", () => theme.set(option.dataset.themeOption));
        option.addEventListener("keydown", (event) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();

                const next = options[(options.indexOf(option) + 1) % options.length];

                theme.set(next.dataset.themeOption);
                next.focus();
            }
        });
    });

    semBlur.addEventListener("change", () => theme.setSemBlur(semBlur.checked));
    document.addEventListener("webgis:theme", sync);

    sync();
}


/* ---------------- créditos ---------------- */

export function renderAboutCredits(list) {
    byId("about-credits").replaceChildren(...list.filter(Boolean).map((text) => el("li", { text })));
}


/* ---------------- notificações ---------------- */

export function createNotifications() {
    const button = byId("account-button");
    const dot = byId("notify-dot");
    const LABEL = "Conta e notificações";
    const listNode = byId("notification-list");
    const empty = byId("notification-empty");
    const items = [];

    createComingSoon(button);

    const timeText = (date) => date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const render = () => {
        listNode.replaceChildren(...items.map((item) =>
            el("li", { class: `notification-item is-${item.kind}` }, [
                el("span", { class: "notification-mark", "aria-hidden": "true" }),
                el("span", { class: "notification-text", text: item.text }),
                el("time", { class: "notification-time", text: timeText(item.date) })
            ])
        ));
        empty.hidden = items.length > 0;
    };

    const setUnseen = (unseen) => {
        const label = unseen ? `${LABEL} (notificações novas)` : LABEL;

        dot.hidden = !unseen;
        button.setAttribute("aria-label", label);
        button.dataset.tooltip = label;
    };

    /* Abrir o cartão = notificações vistas: o sininho some. */
    button.addEventListener("click", () => setUnseen(false));

    const notify = (text, kind = "info") => {
        items.unshift({ text, kind, date: new Date() });
        items.length = Math.min(items.length, MAX_NOTIFICATIONS);
        render();

        if (button.getAttribute("aria-expanded") !== "true") {
            setUnseen(true);
        }
    };

    render();

    return { notify };
}
