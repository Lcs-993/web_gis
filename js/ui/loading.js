/* ============================================================
   CARREGAMENTO DE CAMADAS (cartão no centro do mapa)

   Mostra o progresso enquanto houver camadas carregando, para o
   usuário ver que a aplicação está trabalhando:
   - "Baixando": barra com % e MB quando o tamanho é conhecido;
     barra animada contínua (indeterminada) quando não é.
   - "Processando": leitura dos dados e montagem do mapa.

   Não bloqueia o mapa (sem captura de clique) e some ao terminar.
   ============================================================ */

import { byId } from "./dom.js";

const MB = 1024 * 1024;

const formatMb = (bytes) =>
    (bytes / MB).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });

export function createLoadingOverlay() {
    const overlay = byId("loading-overlay");
    const title = byId("loading-title");
    const bar = byId("loading-bar");
    const fill = byId("loading-bar-fill");
    const detail = byId("loading-detail");

    /* id → { name, phase, loaded, total } */
    const jobs = new Map();
    let frame = null;

    const render = () => {
        frame = null;

        if (!jobs.size) {
            overlay.hidden = true;
            return;
        }

        overlay.hidden = false;

        const [job] = jobs.values();
        const others = jobs.size - 1;
        const suffix = others ? ` (+${others} camada${others === 1 ? "" : "s"})` : "";

        if (job.phase === "processing") {
            title.textContent = `Preparando ${job.name}${suffix}`;
            detail.textContent = "Lendo os dados e montando o mapa…";
            bar.classList.add("is-indeterminate");
            bar.removeAttribute("aria-valuenow");
            fill.style.width = "";
            return;
        }

        title.textContent = `Carregando ${job.name}${suffix}`;

        if (job.total) {
            const percent = Math.min(100, Math.round((job.loaded / job.total) * 100));

            bar.classList.remove("is-indeterminate");
            bar.setAttribute("aria-valuenow", String(percent));
            fill.style.width = `${percent}%`;
            detail.textContent = `${formatMb(job.loaded)} de ${formatMb(job.total)} MB · ${percent}%`;
        } else {
            bar.classList.add("is-indeterminate");
            bar.removeAttribute("aria-valuenow");
            fill.style.width = "";
            detail.textContent = job.loaded
                ? `${formatMb(job.loaded)} MB recebidos`
                : "Conectando…";
        }
    };

    /* Uma pintura por frame, mesmo com muitos avisos de progresso. */
    const schedule = () => {
        if (frame === null) {
            frame = window.requestAnimationFrame(render);
        }
    };

    return {
        start(id, name) {
            jobs.set(id, { name, phase: "downloading", loaded: 0, total: null });
            schedule();
        },

        update(id, progress) {
            const job = jobs.get(id);

            if (!job) {
                return;
            }

            Object.assign(job, progress);

            /* Antes de um trabalho pesado e síncrono: pinta já, sem esperar o frame. */
            if (progress.phase === "processing") {
                if (frame !== null) {
                    window.cancelAnimationFrame(frame);
                }

                render();
                return;
            }

            schedule();
        },

        finish(id) {
            jobs.delete(id);
            schedule();
        }
    };
}
